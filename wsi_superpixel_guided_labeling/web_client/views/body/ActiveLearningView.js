/* global $, __webpack_public_path__ */
import View from '@girder/core/views/View';
import { restRequest, getApiRoot } from '@girder/core/rest';
import _ from 'underscore';

import router from '@girder/histomicsui/router';
import FolderCollection from '@girder/core/collections/FolderCollection';
import AnnotationModel from '@girder/large_image_annotation/models/AnnotationModel';
import ItemCollection from '@girder/core/collections/ItemCollection';
import JobStatus from '@girder/jobs/JobStatus.js';
import { parse } from '@girder/slicer_cli_web/parser';

import learningTemplate from '../../templates/body/activeLearningView.pug';
import ActiveLearningContainer from '../vue/components/ActiveLearning/ActiveLearningContainer.vue';
import ActiveLearningSetupContainer from '../vue/components/ActiveLearningSetup/ActiveLearningSetupContainer.vue';

import '../../stylesheets/body/learning.styl';

const activeLearningSteps = {
    SuperpixelSegmentation: 0,
    InitialLabeling: 1,
    GuidedLabeling: 2
};

const epochRegex = /epoch (\d+)/i;

const ActiveLearningView = View.extend({
    initialize(settings) {
        this.render();
        router.setQuery(); // Ensure we can get the folder from the router
        this.trainingDataFolderId = router.getQuery('folder');
        // TODO create a plugin-level settings for these
        this.activeLearningJobUrl = 'dsarchive_superpixel_latest/SuperpixelClassification';
        this.activeLearningJobType = 'dsarchive/superpixel:latest#SuperpixelClassification';
        this.imageItemsById = {};
        this.annotationsByImageId = {};
        this.sortedSuperpixelIndices = [];
        this._isSaving = false;
        this._saveAnnotationsForIds = new Set();

        this.getHistomicsYamlConfig();
        // this.fetchFoldersAndItems();
    },

    getHistomicsYamlConfig() {
        restRequest({
            url: `folder/${this.trainingDataFolderId}/yaml_config/.histomicsui_config.yaml`
        }).done((config) => {
            this.configAnnotationGroups = (!!config && !!config.annotationGroups)
                ? config.annotationGroups
                : {};
            // save the config, since we might want to edit it
            this.histomicsUIConfig = config;
            console.log(this.configAnnotationGroups);
            console.log(this.histomicsUIConfig);
            return this.fetchFoldersAndItems();
        });
    },

    fetchFoldersAndItems() {
        this.childFolders = new FolderCollection();
        this.childFolders.fetch({
            parentType: 'folder',
            parentId: this.trainingDataFolderId
        }).done(() => {
            this.childItems = new ItemCollection();
            this.childItems.fetch({ folderId: this.trainingDataFolderId }).done(() => {
                this.checkJobs();
            });
        });
    },

    checkJobs() {
        restRequest({
            url: 'job/all',
            data: {
                types: `["${this.activeLearningJobType}"]`,
                sort: 'updated'
            }
        }).done((jobs) => {
            const previousJobs = _.filter(jobs, (job) => {
                const kwargs = job.kwargs || {};
                const containerArgs = kwargs.container_args || [];
                const runningOrSuccess = job.status === JobStatus.SUCCESS || job.status === JobStatus.RUNNING;
                return runningOrSuccess && containerArgs.includes(this.trainingDataFolderId);
            });
            if (previousJobs[0]) {
                this.lastRunJobId = previousJobs[0]._id || '';
            }

            if (!previousJobs[0] || previousJobs[0].status !== JobStatus.RUNNING) {
                this.getAnnotations();
            } else {
                // There is a job running
                this.waitForJobCompletion(previousJobs[0]._id);
            }
        });
    },

    startActiveLearning() {
        if (this.activeLearningStep === activeLearningSteps.SuperpixelSegmentation) {
            this.getJobXmlUrl();
        } else {
            this.mountVueComponent();
        }
    },

    mountVueComponent() {
        if (this.vueApp) {
            this.vueApp.$destroy();
        }
        const el = this.$('.h-active-learning-container').get(0);
        // eslint-disable-next-line
        const root = (__webpack_public_path__ || '/status/built').replace(/\/$/, '');
        const geojsUrl = root + '/plugins/large_image/extra/geojs.js';
        $.ajax({
            url: geojsUrl,
            dataType: 'script',
            cache: true
        }).done((resp) => {
            let vm;
            if (this.activeLearningStep >= activeLearningSteps.GuidedLabeling) {
                vm = new ActiveLearningContainer({
                    el,
                    propsData: {
                        router,
                        trainingDataFolderId: this.trainingDataFolderId,
                        annotationsByImageId: this.annotationsByImageId,
                        annotationBaseName: this.annotationBaseName,
                        sortedSuperpixelIndices: this.sortedSuperpixelIndices,
                        apiRoot: getApiRoot(),
                        backboneParent: this,
                        currentAverageCertainty: this.currentAverageCertainty
                    }
                });
            } else {
                const imageNamesById = {};
                _.forEach(Object.keys(this.imageItemsById), (imageId) => {
                    imageNamesById[imageId] = this.imageItemsById[imageId].name;
                });
                const categories = this.getInitialCategories();
                console.log(categories);
                vm = new ActiveLearningSetupContainer({
                    el,
                    propsData: {
                        backboneParent: this,
                        imageNamesById,
                        annotationsByImageId: this.annotationsByImageId,
                        activeLearningStep: this.activeLearningStep,
                        certaintyMetrics: this.certaintyMetrics
                    }
                });
            }
            this.vueApp = vm;
        });
    },

    render() {
        this.$el.html(learningTemplate());
        return this;
    },

    /**
     * Updates param "categories" to include any categories included on the superpixel annotation
     * not already present.
     *
     * @param {object} pixelmap pixelmap annotation element
     * @param {object} categories Should be an object whose keys are group labels (ids) and values are the group objects
     *  {
     *      default: { label: 'default', fillColor: ..., lineColor: ..., ...},
     *      ...
     *  }
     */
    _updateCategoriesWithPixelmap(pixelmap, categories) {
        console.log(Object.keys(categories).length);
        const pixelmapCategories = pixelmap.categories;
        _.forEach(pixelmapCategories, (category) => {
            categories[category.label] = _.clone(category);
        });
        console.log(Object.keys(categories).length);
    },

    _updateLabelAnnotationWithCategories(annotation, categories) {
        console.log(annotation, categories);
    },

    /**
     * Reconciles the differences between the groups defined in the
     * .histomicsui_config.yaml file and in the annotations that already
     * exist for the training.
     *
     * @returns list of groups to use for labelling superpixels
     */
    getInitialCategories() {
        const categories = {};
        _.forEach(this.configAnnotationGroups.groups, (group) => {
            if (!categories[group.id]) {
                categories[group.id] = {
                    label: group.id,
                    fillColor: group.fillColor,
                    strokeColor: group.lineColor
                };
            }
        });
        _.forEach(Object.keys(this.annotationsByImageId), (imageId) => {
            const pixelmapElement = this.annotationsByImageId[imageId].labels.get('annotation').elements[0];
            this._updateCategoriesWithPixelmap(pixelmapElement, categories);
        });
        // _.forEach(Object.keys(this.annotationsByImageId), (imageId) => {
        // this._updateLabelAnnotationWithCategories(this.annotationsByImageId[imageId].labels, categories);
        // });
        return categories;
    },

    getAnnotationsForItemPromise(item, annotationsToFetchByImage) {
        return restRequest({
            url: 'annotation',
            data: {
                itemId: item._id,
                sort: 'created',
                sortdir: -1
            }
        }).done((annotations) => {
            // Find the current epoch of training by looking at annotation names.
            // Start by assuming no annotations exist for training. Since running the
            // algorithm once generates annotations for Epoch 0, represent the initial
            // state as epoch -1
            if (!this.epoch) {
                this.epoch = -1;
            }
            _.forEach(annotations, (annotation) => {
                const matches = epochRegex.exec(annotation.annotation.name);
                if (matches) {
                    this.epoch = Math.max(this.epoch, parseInt(matches[1]));
                }
            });
            this.activeLearningStep = Math.min(this.epoch + 1, 2);
            // TODO: refine name checking
            const predictionsAnnotations = _.filter(annotations, (annotation) => {
                return this.annotationIsValid(annotation) && annotation.annotation.name.includes('Predictions');
            });
            const superpixelAnnotations = _.filter(annotations, (annotation) => {
                return this.annotationIsValid(annotation) && !annotation.annotation.name.includes('Predictions');
            });
            const predictions = predictionsAnnotations[0] ? predictionsAnnotations[0]._id : null;
            const superpixels = superpixelAnnotations[superpixelAnnotations.length - 1] ? superpixelAnnotations[superpixelAnnotations.length - 1]._id : null;
            const labels = superpixelAnnotations[0] ? superpixelAnnotations[0]._id : null;
            annotationsToFetchByImage[item._id] = {
                predictions,
                superpixels,
                labels
            };
        });
    },

    waitForPromises(promises, functionToExecute, params) {
        $.when(...promises).then(() => {
            return functionToExecute.call(this, params);
        });
    },

    getAnnotations() {
        const annotationsToFetchByImage = {};
        const promises = [];
        restRequest({
            url: 'item',
            data: {
                folderId: this.trainingDataFolderId
            }
        }).then((items) => {
            _.forEach(items, (item) => {
                if (item.largeImage) {
                    this.imageItemsById[item._id] = item;
                    this.annotationsByImageId[item._id] = {};
                    promises.push(this.getAnnotationsForItemPromise(item, annotationsToFetchByImage));
                }
            });
            return this.waitForPromises(promises, this.fetchAnnotations, annotationsToFetchByImage);
        });
    },

    annotationIsValid(annotation) {
        // TODO: harden filtering of annotations
        return annotation.annotation.name.includes('Superpixel');
    },

    fetchAnnotations(annotationsToFetchByImage) {
        const promises = [];
        _.forEach(Object.keys(annotationsToFetchByImage), (imageId) => {
            _.forEach(['predictions', 'superpixels', 'labels'], (key) => {
                const annotationId = annotationsToFetchByImage[imageId][key];
                if (annotationId) {
                    const backboneModel = new AnnotationModel({ _id: annotationId });
                    promises.push(backboneModel.fetch().done(() => {
                        this.annotationsByImageId[imageId][key] = backboneModel;
                        if (key === 'predictions') {
                            this.computeAverageCertainty(backboneModel);
                        }
                    }));
                }
            });
        });
        $.when(...promises).then(() => {
            // TODO: synchronize styles in histomics config yaml with annotation categories here
            if (this.activeLearningStep === activeLearningSteps.GuidedLabeling) {
                this.getSortedSuperpixelIndices();
            }
            return this.startActiveLearning();
        });
    },

    computeAverageCertainty(annotation) {
        const certaintyArray = annotation.get('annotation').elements[0].user.certainty;
        const sum = _.reduce(certaintyArray, (sum, num) => sum + num, 0);
        this.currentAverageCertainty = sum / certaintyArray.length;
    },

    getAgreeChoice(index, predictionPixelmapElement, labelPixelmapElement) {
        const label = labelPixelmapElement.values[index];
        const labelCategories = labelPixelmapElement.categories;
        if (labelCategories[label].label === 'default') {
            // Label is default, so no choice has been made
            // Once we use the config file, we can use the default
            // category specified there insted of the raw string
            return undefined;
        }
        const predictionCategories = predictionPixelmapElement.categories;
        const prediction = predictionPixelmapElement.values[index];
        return predictionCategories[prediction].label === labelCategories[label].label ? 'Yes' : 'No';
    },

    getSortedSuperpixelIndices() {
        const superpixelPredictionsData = [];
        _.forEach(Object.keys(this.annotationsByImageId), (imageId) => {
            const annotation = this.annotationsByImageId[imageId].predictions.get('annotation');
            const labels = this.annotationsByImageId[imageId].labels.get('annotation');
            const labelValues = labels.elements[0].values;
            const userData = annotation.elements[0].user;
            const pixelmapValues = annotation.elements[0].values;
            const superpixelImageId = annotation.elements[0].girderId;
            const superpixelCategories = annotation.elements[0].categories;
            const boundaries = annotation.elements[0].boundaries;
            const scale = annotation.elements[0].transform.matrix[0][0];
            _.forEach(userData.certainty, (score, index) => {
                const bbox = userData.bbox.slice(index * 4, index * 4 + 4);
                const agreeChoice = this.getAgreeChoice(index, annotation.elements[0], labels.elements[0]);
                const prediction = {
                    index,
                    confidence: userData.confidence[index],
                    certainty: score,
                    imageId,
                    superpixelImageId,
                    boundaries,
                    scale,
                    bbox,
                    prediction: pixelmapValues[index],
                    predictionCategories: superpixelCategories,
                    labelCategories: labels.elements[0].categories,
                    agreeChoice,
                    selectedCategory: labelValues[index]
                };
                superpixelPredictionsData.push(prediction);
            });
        });
        this.sortedSuperpixelIndices = _.sortBy(superpixelPredictionsData, 'certainty');
    },

    getJobXmlUrl() {
        restRequest({
            url: 'slicer_cli_web/docker_image'
        }).then((dockerImages) => {
            const imageAndJob = this.activeLearningJobType.split('#');
            const image = imageAndJob[0].split(':')[0];
            const version = imageAndJob[0].split(':')[1];
            const jobInfo = ((dockerImages[image] || {})[version] || {})[imageAndJob[1]];
            if (!jobInfo) {
                throw new Error('Unable to find specified superpixel classification image.');
            }
            return this.getJobCertaintyChoices(jobInfo.xmlspec);
        });
    },

    /**
     * Flattens a slicer XML spec gui as parsed by girder/slicer_cli_spec to
     * make it easier to quickly extract parameters.
     *
     * @param {object} gui An object returned by parsing a slicer XML spec
     * as returned by the imported `parse` function
     */
    flattenParse(gui) {
        const result = { parameters: {} };
        _.forEach(Object.keys(gui), (key) => {
            if (key !== 'panels') {
                result[key] = gui[key];
            }
        });
        _.forEach(gui.panels, (panel, panelIndex) => {
            _.forEach(panel.groups, (group, groupIndex) => {
                _.forEach(group.parameters, (parameter) => {
                    const param = Object.assign({}, parameter);
                    param.group = {
                        panelIndex,
                        groupIndex
                    };
                    _.forEach(Object.keys(group), (key) => {
                        if (key !== 'parameters') {
                            result.parameters[param.id] = param;
                        }
                    });
                });
            });
        });
        return result;
    },

    getJobCertaintyChoices(xmlUrl) {
        restRequest({
            url: xmlUrl
        }).then((xmlSpec) => {
            const gui = parse(xmlSpec);
            const flattenedSpec = this.flattenParse(gui);
            const hasCertaintyMetrics = (
                flattenedSpec.parameters.certainty &&
                flattenedSpec.parameters.certainty.values &&
                flattenedSpec.parameters.certainty.values.length
            );
            this.certaintyMetrics = hasCertaintyMetrics ? flattenedSpec.parameters.certainty.values : null;
            return this.mountVueComponent();
        });
    },

    /*****************************************************************
     * Functions in this section should be called by child components
     * (vue components) when they need to perform some kind of rest
     * request or run a job.
     ****************************************************************/

    /**
     * Save the label annotations that are queued to be saved.
     * Prevent multiple save requests from being sent to the server
     * simultaneously.
     * @param {string[]} imageIds
     */
    saveLabelAnnotations(imageIds) {
        _.forEach(imageIds, (id) => {
            this._saveAnnotationsForIds.add(id);
        });
        if (this._isSaving) {
            return;
        }
        this._isSaving = true;
        const promises = [];
        _.forEach(Array.from(this._saveAnnotationsForIds), (imageId) => {
            const labelAnnotation = this.annotationsByImageId[imageId].labels;
            const promise = labelAnnotation.save();
            promises.push(promise);
        });
        this._saveAnnotationsForIds = new Set();
        $.when(...promises).then(() => {
            this._isSaving = false;
            if (this._saveAnnotationsForIds.size > 0) {
                this.saveLabelAnnotations([]);
            }
            return true;
        });
    },

    retrain(goToNextStep) {
        restRequest({
            method: 'POST',
            url: `slicer_cli_web/${this.activeLearningJobUrl}/rerun`,
            data: {
                jobId: this.lastRunJobId,
                randominput: false
            }
        }).done((job) => {
            this.waitForJobCompletion(job._id, goToNextStep);
        });
    },

    triggerJob(data, goToNextStep) {
        restRequest({
            method: 'POST',
            url: `slicer_cli_web/${this.activeLearningJobUrl}/run`,
            data
        }).done((response) => {
            const newJobId = response._id;
            this.waitForJobCompletion(newJobId, goToNextStep);
        });
    },

    generateInitialSuperpixels(radius, magnification, certaintyMetric) {
        // get the folders to store annotations, models, features
        const folders = this.childFolders.models;
        const annotationsFolderId = _.filter(folders, (folder) => folder.get('name') === 'Annotations')[0].get('_id');
        const featuresFolderId = _.filter(folders, (folder) => folder.get('name') === 'Features')[0].get('_id');
        const modelsFolderId = _.filter(folders, (folder) => folder.get('name') === 'Models')[0].get('_id');
        const data = {
            images: this.trainingDataFolderId,
            annotationDir: annotationsFolderId,
            features: featuresFolderId,
            magnification,
            radius,
            labels: JSON.stringify([]),
            modeldir: modelsFolderId,
            girderApiUrl: '',
            girderToken: '',
            certainty: certaintyMetric
        };
        this.triggerJob(data, true);
    },

    /****************************************************************
     * Functions related to disabling the UI while a job is running.
     ***************************************************************/

    showSpinner() {
        $('.h-active-learning-container').append(
            '<div class="g-hui-loading-overlay"><div>' +
            '<i class="icon-spin4 animate-spin"><i>' +
            '</div></div>'
        );
    },

    hideSpinner() {
        $('.g-hui-loading-overlay').remove();
    },

    waitForJobCompletion(jobId, goToNextStep) {
        this.showSpinner();
        const poll = setInterval(() => {
            if (!this.$('.h-active-learning-container').get(0)) {
                clearInterval(poll);
            }
            restRequest({
                url: `job/${jobId}`
            }).done((update) => {
                if (update.status === JobStatus.SUCCESS) {
                    clearInterval(poll);
                    this.hideSpinner();
                    if (goToNextStep) {
                        // We might need to go back to the server for more data
                        this.checkJobs();
                    }
                    this.lastRunJobId = jobId;
                    this.getAnnotations();
                }
                // TODO handle job failure
            });
        }, 2000);
    }
});

export default ActiveLearningView;
