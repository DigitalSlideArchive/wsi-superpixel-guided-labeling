/* global $, __webpack_public_path__ */
import View from '@girder/core/views/View';
import { restRequest, getApiRoot } from '@girder/core/rest';
import { confirm } from '@girder/core/dialog';
import _ from 'underscore';

import router from '@girder/histomicsui/router';
import FolderCollection from '@girder/core/collections/FolderCollection';
import AnnotationModel from '@girder/large_image_annotation/models/AnnotationModel';
import ItemCollection from '@girder/core/collections/ItemCollection';
import JobStatus from '@girder/jobs/JobStatus.js';
import { parse } from '@girder/slicer_cli_web/parser';

import learningTemplate from '../../templates/body/activeLearningView.pug';
import ActiveLearningGlobalContainer from '../vue/components/ActiveLearningGlobalContainer.vue';
import ActiveLearningToolBar from '../vue/components/ActiveLearningToolBar.vue';
import { store, assignHotkey } from '../vue/components/store.js';
import { activeLearningSteps } from '../vue/components/constants.js';
import { debounce, isValidNumber } from '../vue/components/utils.js';

import '../../stylesheets/body/learning.styl';

const yaml = require('js-yaml');
// Only necessary until we have native support for Promises with es6.
// Used for Promise.all() and Promise.resolve() support.
const Promise = require('bluebird');

const epochRegex = /epoch (\d+)/i;

const defaultAnnotationGroups = {
    replaceGroups: true,
    defaultGroup: 'default',
    groups: [
        {
            id: 'default',
            fillColor: 'rgba(0, 0, 0, 0)',
            lineColor: 'rgba(0, 0, 0, 1)',
            lineWidth: 2
        }
    ],
    exclusions: []
};

/**
 * This view acts as a container for Vue components used to control the active learning workflow.
 * It is reponsible for fetching all of the data needed for the active learning components.
 *
 * Note that in the future, it would likely be better to add endpoints to the plugin to get all of the
 * data in one trip to the server. Additionally, the endpoint could run custom mongo pipelines to provide
 * a paginated view of the predictions for the most recent epoch. This approach would scale better as more
 * images are added to active learning folders. Right now, the client is probably doing too much work.
 */
const ActiveLearningView = View.extend({
    initialize(settings) {
        this.render();
        router.setQuery(); // Ensure we can get the folder from the router
        this.trainingDataFolderId = router.getQuery('folder');
        // TODO create a plugin-level settings for these
        this.activeLearningJobUrl = 'dsarchive_superpixel_latest/SuperpixelClassification';
        this.activeLearningJobType = 'dsarchive/superpixel:latest#SuperpixelClassification';
        this.imageItemsById = {};
        this.availableImages = [];
        this.annotationsByImageId = {};
        this._isSaving = false;
        this._saveAnnotationsForIds = new Set();
        // Use a map to preserve insertion order
        this.categoryMap = new Map();
        this.histomicsUIConfig = {};

        this.mountToolbarComponent();
        this.getCurrentUser();
        this.getHistomicsYamlConfig();
    },

    mountToolbarComponent() {
        if (this.vueAppToolbar) {
            this.vueAppToolbar.$destroy();
        }
        const el = document.getElementById('active-learning-toolbar');
        this.vueAppToolbar = new ActiveLearningToolBar({ el });
    },

    getHistomicsYamlConfig() {
        restRequest({
            url: `folder/${this.trainingDataFolderId}/yaml_config/.histomicsui_config.yaml`
        }).done((config) => {
            // save the config, since we might want to edit it
            this.histomicsUIConfig = config || {};
            this.configAnnotationGroups = (!!config && !!config.annotationGroups)
                ? config.annotationGroups
                : undefined;
            if (!this.configAnnotationGroups) {
                this.configAnnotationGroups = JSON.parse(JSON.stringify(defaultAnnotationGroups));
            }
            this.histomicsUIConfig.annotationGroups = this.configAnnotationGroups;

            const defaultIndex = _.findIndex(this.configAnnotationGroups.groups,
                (group) => group.id === this.configAnnotationGroups.defaultGroup
            );
            const defaultGroup = this.configAnnotationGroups.groups[defaultIndex];
            // Make sure the default category is inserted first
            this.categoryMap.set(defaultGroup.id, {
                label: defaultGroup.id,
                fillColor: defaultGroup.fillColor,
                strokeColor: defaultGroup.lineColor
            });
            this.defaultCategory = this.categoryMap.get(defaultGroup.id);
            _.forEach(this.configAnnotationGroups.groups, (group, index) => {
                this.categoryMap.set(group.id, {
                    label: group.id,
                    fillColor: group.fillColor,
                    strokeColor: group.lineColor
                });
                const oldKey = _.find([...store.hotkeys], ([, v]) => v === index)[0];
                const newKey = JSON.parse(JSON.stringify(group.hotKey || oldKey));
                assignHotkey(oldKey, newKey);
            });

            // Create the activeLearning flag if it does not exist
            'activeLearning' in this.histomicsUIConfig || (this.histomicsUIConfig.activeLearning = true);

            // Create the guidedLabeleling object if it does not exist
            'guidedLabelingUI' in this.histomicsUIConfig || (this.histomicsUIConfig.guidedLabelingUI = {});
            store.strokeOpacity = this.histomicsUIConfig.guidedLabelingUI.borderOpacity || 1.0;

            // Map excluded label names to indices for internal use
            let excluded = this.configAnnotationGroups.exclusions || [];
            excluded = _.map(excluded, (l) => {
                const idx = _.findIndex([...this.categoryMap.values()], (c) => c.label === l);
                return idx === -1 ? null : idx - 1;
            });
            store.exclusions = _.reject(excluded, (v) => !isValidNumber(v));

            return this.fetchFoldersAndItems();
        });
    },

    updateHistomicsYamlConfig: debounce(function () {
        // Make sure the flag to enable active learning is set to true
        this.histomicsUIConfig.activeLearning = true;

        const groups = new Map();
        this.categoryMap.clear(); // Keep the internal categoryMap in sync with changes
        _.forEach(store.categories, (category, index) => {
            const key = _.find([...store.hotkeys], ([, v]) => v === index)[0];
            groups.set(category.label, {
                id: category.label,
                fillColor: category.fillColor,
                lineColor: category.strokeColor || 'rgba(0,0,0,1)',
                hotKey: `${key}`
            });
            this.categoryMap.set(category.label, category);
        });
        this.histomicsUIConfig.annotationGroups.groups = [...groups.values()];

        // Write the opacity value as a float
        this.histomicsUIConfig.guidedLabelingUI.borderOpacity = parseFloat(store.strokeOpacity);

        // Map excluded label indices to string names for readability
        const excluded = _.map(store.exclusions, (idx) => store.categories[idx + 1].label);
        this.histomicsUIConfig.annotationGroups.exclusions = excluded;

        // Update the config file
        return restRequest({
            type: 'PUT',
            url: `folder/${this.trainingDataFolderId}/yaml_config/.histomicsui_config.yaml`,
            data: yaml.dump(this.histomicsUIConfig),
            contentType: 'application/json'
        });
    }),

    /**
     * The first of many rest requests needed to get data from the girder server for
     * active learning. Get the child items and folders for the active learning folder.
     */
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

    /**
     * The second rest request. Check for previous jobs with the activeLearningJob type.
     * If there is a job still running, be sure to wait for it to finish before continuing
     * with data gathering and setup.
     */
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
                this.updateFolderMetadata({ lastRunJobId: this.lastRunJobId });
            }

            if (!previousJobs[0] || previousJobs[0].status !== JobStatus.RUNNING) {
                // Check for lastRunJobId in metadata (in case of copied project)
                restRequest({
                    url: `folder/${this.trainingDataFolderId}`
                }).done((folder) => {
                    if (folder.meta.lastRunJobId) {
                        this.lastRunJobId = folder.meta.lastRunJobId;
                    }
                });
            } else {
                // There is a job running
                store.activeLearningStep = activeLearningSteps.InitialLabeling;
                this.waitForJobCompletion(previousJobs[0]._id);
                this.watchForSuperpixels();
            }
            this.getAnnotations();
        });
    },

    startActiveLearning() {
        if (store.activeLearningStep === activeLearningSteps.SuperpixelSegmentation) {
            // Case 1: no superpixel segmentation or feature generation have been done for this
            // folder. We need to get the job XML definition to help populate the form that will
            // be used to tune the first run of the classification job.
            this.getJobXmlUrl();
        } else {
            // Case 2: superpixels/annotations already exist, so we can mount the vue component without
            // retrieving the job XML.
            this.vueComponentChanged();
        }
    },

    vueComponentChanged() {
        if (this.vueApp) {
            // We have alreay mounted the component, no need to re-create it. Just update the props.
            return this.updateVueComponent();
        }
        return this.mountVueComponent();
    },

    updateVueComponent() {
        const exceptions = ['router', 'apiRoot', 'trainingDataFolderId', 'backboneParent'];
        _.forEach(Object.keys(this.vueApp.$props), (prop) => {
            if (!exceptions.includes(prop)) {
                if (prop === 'imageNamesById') {
                    _.forEach(Object.keys(this.imageItemsById), (imageId) => {
                        this.vueApp.$props[prop][imageId] = this.imageItemsById[imageId].name;
                    });
                } else {
                    this.vueApp.$props[prop] = this[prop];
                }
            }
        });
    },
    mountVueComponent() {
        if (this.vueApp) {
            this.vueApp.$destroy();
        }
        const el = this.$('.h-active-learning-container').get(0);
        // eslint-disable-next-line
        const root = (__webpack_public_path__ || '/status/built').replace(/\/$/, '');
        const geojsUrl = root + '/plugins/large_image/extra/geojs.js';
        // Make sure geojs is available, as it required by the image viewer widgets
        $.ajax({
            url: geojsUrl,
            dataType: 'script',
            cache: true
        }).done(() => {
            const imageNamesById = {};
            _.forEach(Object.keys(this.imageItemsById), (imageId) => {
                imageNamesById[imageId] = this.imageItemsById[imageId].name;
            });
            this.vueApp = new ActiveLearningGlobalContainer({
                el,
                propsData: {
                    backboneParent: this,
                    imageNamesById,
                    annotationsByImageId: this.annotationsByImageId,
                    certaintyMetrics: this.certaintyMetrics,
                    featureShapes: this.featureShapes,
                    apiRoot: getApiRoot(),
                    currentAverageCertainty: this.currentAverageCertainty,
                    availableImages: this.availableImages,
                    categoryMap: this.categoryMap
                }
            });
        });
    },

    render() {
        this.$el.html(learningTemplate());
        return this;
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
            // Start by assuming no annotations exist for training.
            _.forEach(annotations, (annotation) => {
                const matches = epochRegex.exec(annotation.annotation.name);
                if (matches) {
                    store.epoch = Math.max(store.epoch, parseInt(matches[1]));
                }
            });
            store.activeLearningStep = Math.max(store.activeLearningStep, store.epoch + 1);
            // TODO: refine name checking
            const predictionsAnnotations = _.filter(annotations, (annotation) => {
                return this.annotationIsValid(annotation) && annotation.annotation.name.includes('Predictions');
            });
            const superpixelAnnotations = _.filter(annotations, (annotation) => {
                return this.annotationIsValid(annotation) && !annotation.annotation.name.includes('Predictions');
            });
            const predictions = predictionsAnnotations[0] ? predictionsAnnotations[0]._id : null;
            const labels = superpixelAnnotations[0] ? superpixelAnnotations[0]._id : null;
            annotationsToFetchByImage[item._id] = {
                predictions,
                labels
            };
        });
    },

    /**
     * Wait for a group of promises before moving on to the next setup step.
     *
     * @param {Promise[]} promises
     * @param {function} functionToExecute
     * @param {Object[]} params
     */
    waitForPromises(promises, functionToExecute, params) {
        $.when(...promises).then(() => {
            return functionToExecute.call(this, params);
        });
    },

    /**
     * For each item in the active learning folder, fetch the annotations
     * for that item and build the annotationsToFetchByImageId object.
     */
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

    /**
     * Determine if an annotation is relevant for active learning.
     *
     * @param {Object} annotation
     * @returns true if the given annotation is part of the
     * active learning workflow
     */
    annotationIsValid(annotation) {
        // TODO: harden filtering of annotations
        return annotation.annotation.name.includes('Superpixel');
    },

    /**
     * Create and populate backbone models for the annotations that are needed
     * for active learning.
     *
     * @param {Object} annotationsToFetchByImage an object whose keys
     * are girder large image item ids and values are objects containing
     * a prediction and a label annotation.
     */
    fetchAnnotations(annotationsToFetchByImage) {
        const promises = [];
        _.forEach(Object.keys(annotationsToFetchByImage), (imageId) => {
            _.forEach(['predictions', 'labels'], (key) => {
                const annotationId = annotationsToFetchByImage[imageId][key];
                if (annotationId) {
                    const backboneModel = new AnnotationModel({ _id: annotationId });
                    promises.push(backboneModel.fetch().done(() => {
                        this.annotationsByImageId[imageId][key] = backboneModel;
                        if (key === 'labels') {
                            const annotation = backboneModel.get('annotation');
                            if (!_.has(annotation.attributes, 'metadata')) {
                                annotation.attributes.metadata = {};
                            }
                            this.saveAnnotationMetadata(imageId);
                            if (!this.availableImages.includes(imageId)) {
                                this.availableImages.push(imageId);
                            }
                        } else {
                            // These are predictions
                            this.computeAverageCertainty(backboneModel);
                        }
                    }));
                }
            });
        });
        $.when(...promises).then(() => {
            this.synchronizeCategories();
            if (store.activeLearningStep >= activeLearningSteps.GuidedLabeling) {
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

    getAnnotationCategories(pixelmapElement) {
        _.forEach(pixelmapElement.categories, (category) => {
            if (!this.categoryMap.has(category.label)) {
                this.categoryMap.set(category.label, category);
            }
        });
    },

    updateCategoriesAndData(pixelmapElement, imageId) {
        const categories = [...this.categoryMap.values()];

        // Map old data values to category id
        const dataValuesToCategoryId = new Map();
        _.forEach(pixelmapElement.categories, (category, index) => {
            dataValuesToCategoryId.set(index, category.label);
        });

        // Map category id to new data values
        const categoryIdToNewDataValue = new Map();
        _.forEach(categories, (category, index) => {
            categoryIdToNewDataValue.set(category.label, index);
        });

        // Replace data
        _.forEach(pixelmapElement.values, (value, index) => {
            const category = dataValuesToCategoryId.get(value);
            const newValue = categoryIdToNewDataValue.get(category);
            pixelmapElement.values[index] = newValue;
            if (newValue !== 0) {
                // Offset the index since we do not need to track the indices
                // associated with the "default" (unlabeled) category
                store.categoriesAndIndices[newValue - 1].indices[imageId].add(index);
            }
        });

        // Replace categories
        pixelmapElement.categories = categories;
        this.saveAnnotations([imageId], false);
    },

    /**
     * Reconciles the differences between the groups defined in the .histomicsui_config.yaml
     * file and in the annotataions for the current epoch.
     *
     * @returns list of groups to use for labelling superpixels
     */
    synchronizeCategories() {
        const annotations = Object.values(this.annotationsByImageId);
        if (annotations.every((annotation) => _.isEmpty(annotation))) {
            // Nothing to synchronize
            return;
        }

        // Compile all the categories for the dataset
        _.forEach(Object.keys(this.annotationsByImageId), (imageId) => {
            if (this.annotationsByImageId[imageId].labels) {
                const labelPixelmapElement = this.annotationsByImageId[imageId].labels.get('annotation').elements[0];
                this.getAnnotationCategories(labelPixelmapElement);
            }
        });
        store.categoriesAndIndices = _.map(_.rest([...this.categoryMap.values()]), (category) => {
            return { category, indices: {} };
        });
        // Update pixelmap data for the dataset
        _.forEach(Object.keys(this.annotationsByImageId), (imageId) => {
            if (this.annotationsByImageId[imageId].labels) {
                const labelPixelmapElement = this.annotationsByImageId[imageId].labels.get('annotation').elements[0];
                store.categoriesAndIndices = _.forEach(store.categoriesAndIndices, (data) => {
                    data.indices[imageId] = new Set();
                });
                this.updateCategoriesAndData(labelPixelmapElement, imageId);
            }
        });
    },

    /**
     * Build an array of predictions on superpixels sorted by certainty.
     */
    getSortedSuperpixelIndices() {
        this.superpixelPredictionsData = [];
        store.predictionCounts = new Array(this.categoryMap.size - 1).fill(0);
        _.forEach(Object.keys(this.annotationsByImageId), (imageId) => {
            if (!this.annotationsByImageId[imageId].predictions) {
                // New images may not have any predictions
                return;
            }
            const annotation = this.annotationsByImageId[imageId].predictions.get('annotation');
            const labels = this.annotationsByImageId[imageId].labels.get('annotation');
            const labelValues = labels.elements[0].values;
            const userData = annotation.elements[0].user;
            const pixelmapValues = annotation.elements[0].values;
            const superpixelImageId = annotation.elements[0].girderId;
            const superpixelCategories = annotation.elements[0].categories;
            const boundaries = annotation.elements[0].boundaries;
            const scale = annotation.elements[0].transform.matrix[0][0];
            const metadata = labels.attributes.metadata;
            _.forEach(userData.certainty, (score, index) => {
                const bbox = userData.bbox.slice(index * 4, index * 4 + 4);
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
                    labelEpoch: metadata[index] ? metadata[index].labelEpoch : null,
                    selectedCategory: labelValues[index],
                    meta: metadata[index],
                    reviewValue: metadata[index] ? metadata[index].reviewValue : null
                };
                store.predictionCounts[prediction.prediction] += 1;
                this.superpixelPredictionsData.push(prediction);
            });
        });
        store.sortedSuperpixelIndices = _.sortBy(_.sortBy(this.superpixelPredictionsData, 'certainty'), 'labelEpoch');
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
            this.getJobCertaintyChoices(jobInfo.xmlspec);
            return this.getJobFeatureChoices(jobInfo.xmlspec);
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

    /**
     * Extract the certainty options from the superpixel predictions job.
     * @param {string} xmlUrl
     */
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
            return this.vueComponentChanged();
        });
    },

    /**
     * Extract the feature options from the superpixel predictions job.
     * @param {string} xmlUrl
     */
    getJobFeatureChoices(xmlUrl) {
        restRequest({
            url: xmlUrl
        }).then((xmlSpec) => {
            const gui = parse(xmlSpec);
            const flattenedSpec = this.flattenParse(gui);
            const hasFeatureShapes = (
                flattenedSpec.parameters.feature &&
                flattenedSpec.parameters.feature.values &&
                flattenedSpec.parameters.feature.values.length
            );
            this.featureShapes = hasFeatureShapes ? flattenedSpec.parameters.feature.values : null;
            return this.vueComponentChanged();
        });
    },

    /*****************************************************************
     * Functions in this section should be called by child components
     * (vue components) when they need to perform some kind of rest
     * request or run a job.
     ****************************************************************/

    /**
     * Save the annotations that are queued to be saved.
     * Prevent multiple save requests from being sent to the server
     * simultaneously.
     * @param {string[]} imageIds
     */
    saveAnnotations: debounce(function (imageIds, savePredictions) {
        // We need to keep prediction names and details in sync with the labels,
        // so typically we want to save both annotations. Default to true.
        savePredictions = _.isBoolean(savePredictions) ? savePredictions : true;

        const promises = [];
        _.forEach(imageIds, (imageId) => {
            const labelAnnotation = this.annotationsByImageId[imageId].labels;
            // Images added without re-train have no labels yet
            if (labelAnnotation) {
                promises.push(labelAnnotation.save());
            }
            const predictionAnnotation = this.annotationsByImageId[imageId].predictions;
            if (predictionAnnotation && savePredictions) {
                promises.push(predictionAnnotation.save());
            }
        });
        return Promise.all(promises);
    }, true),

    applyReviews() {
        const imageIds = [];
        _.forEach(_.values(this.annotationsByImageId), (values) => {
            if (!values.labels) {
                // Newly added images may not have labels yet
                return;
            }
            const annotation = values.labels.get('annotation');
            if (annotation) {
                _.forEach(Object.entries(annotation.attributes.metadata), ([k, v]) => {
                    if (isValidNumber(v.reviewValue) && v.reviewEpoch >= v.labelEpoch) {
                        annotation.elements[0].values[k] = v.reviewValue;
                        if (!imageIds.includes(annotation.itemId)) {
                            imageIds.push(annotation.itemId);
                        }
                    }
                });
            }
        });
        this.saveAnnotations(imageIds, false);
    },

    retrain(goToNextStep) {
        // Apply any changes from reviews before retraining
        this.applyReviews();
        // Make sure that our folder ids are up-to-date
        const data = this.generateClassificationJobData();
        data.jobId = this.lastRunJobId;
        data.randomInput = false;
        const excluded = _.map(store.exclusions, (idx) => store.categories[idx + 1].label);
        restRequest({
            method: 'POST',
            url: `slicer_cli_web/${this.activeLearningJobUrl}/rerun`,
            data: {
                jobId: this.lastRunJobId,
                randominput: false,
                train: true,
                exclude: JSON.stringify(excluded)
            }
        }).done((job) => {
            store.page = 0;
            store.selectedIndex = 0;
            this.waitForJobCompletion(job._id, goToNextStep);
        });
    },

    triggerJob(data, goToNextStep) {
        restRequest({
            method: 'POST',
            url: `slicer_cli_web/${this.activeLearningJobUrl}/run`,
            data
        }).done((response) => {
            this.lastRunJobId = response._id;
            this.waitForJobCompletion(response._id, goToNextStep);
            this.watchForSuperpixels();
        });
    },

    generateClassificationJobData() {
        // get the folders to store annotations, models, features
        const folders = this.childFolders.models;
        const annotationsFolderId = _.filter(folders, (folder) => folder.get('name') === 'Annotations')[0].get('_id');
        const featuresFolderId = _.filter(folders, (folder) => folder.get('name') === 'Features')[0].get('_id');
        const modelsFolderId = _.filter(folders, (folder) => folder.get('name') === 'Models')[0].get('_id');
        return {
            images: this.trainingDataFolderId,
            annotationDir: annotationsFolderId,
            features: featuresFolderId,
            modeldir: modelsFolderId
        };
    },

    generateInitialSuperpixels(radius, magnification, certaintyMetric, featureShape) {
        const data = this.generateClassificationJobData();
        Object.assign(data, {
            labels: JSON.stringify([]),
            magnification,
            radius,
            girderApiUrl: '',
            girderToken: '',
            certainty: certaintyMetric,
            feature: featureShape,
            train: false
        });
        store.activeLearningStep = activeLearningSteps.InitialLabeling;
        this.getAnnotations();
        this.triggerJob(data, true);
    },

    updateFolderMetadata(data) {
        restRequest({
            type: 'PUT',
            url: `folder/${this.trainingDataFolderId}/metadata`,
            data: JSON.stringify(data),
            contentType: 'application/json'
        });
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
            // If this view is no longer rendered in the tab, stop
            // polling the server.
            if (!this.$('.h-active-learning-container').get(0)) {
                clearInterval(poll);
            }
            restRequest({
                url: `job/${jobId}`
            }).done((update) => {
                if (
                    update.status === JobStatus.SUCCESS ||
                    update.status === JobStatus.ERROR ||
                    update.status === JobStatus.CANCELED
                ) {
                    clearInterval(poll);
                    this.hideSpinner();
                    if (update.status === JobStatus.SUCCESS) {
                        if (goToNextStep) {
                            // We might need to go back to the server for more data
                            this.checkJobs();
                        } else {
                            // We're all done, grab the results
                            this.lastRunJobId = jobId;
                            this.updateFolderMetadata({ lastRunJobId: jobId });
                            this.getAnnotations();
                        }
                    } else if (update.status === JobStatus.ERROR) {
                        const logUrl = `${window.location.origin}/#job/${update._id}`;
                        confirm({
                            text: 'ERROR - Job failed',
                            yesText: 'View Logs',
                            noText: 'Dismiss',
                            confirmCallback: () => { window.open(logUrl, '_blank'); }
                        });
                    }
                }
            });
        }, 2000);
    },

    watchForSuperpixels() {
        if (store.activeLearningStep !== activeLearningSteps.InitialLabeling) {
            return;
        }

        this.hideSpinner();
        const poll = setInterval(() => {
            restRequest({
                url: `annotation/folder/${this.trainingDataFolderId}`
            }).done((annotations) => {
                const hasSuperpixels = _.some(annotations, (annotation) => {
                    return epochRegex.exec(annotation.annotation.name);
                });
                if (annotations.length > this.availableImages.length && hasSuperpixels) {
                    this.availableImages = _.pluck(annotations, 'itemId');
                    this.getAnnotations();
                    const allSuperpixelsAvailable = _.every(
                        Object.keys(this.annotationsByImageId), (id) => {
                            return this.availableImages.includes(id);
                        });
                    if (allSuperpixelsAvailable) {
                        clearInterval(poll);
                    }
                }
            });
        }, 2000);
    },

    /**
     * Save the annotation metadata. Useful for when only the metadata has changed
     * and the whole annotation does not need to be saved.
     */
    saveAnnotationMetadata: debounce(function (imageId) {
        const annotation = this.annotationsByImageId[imageId].labels;
        const metadata = annotation.get('annotation').attributes.metadata;
        return restRequest({
            type: 'PUT',
            url: `annotation/${annotation.id}/metadata`,
            data: JSON.stringify({ metadata }),
            contentType: 'application/json'
        });
    }),

    /**
     * Get the currently logged in user.
     */
    getCurrentUser() {
        restRequest({
            url: 'user/me'
        }).then((user) => {
            store.currentUser = user._id;
            store.userNames[user._id] = `${user.firstName} ${user.lastName}`;
            return store.currentUser;
        });
    },

    /**
     * Get the requested user.
     * @param {string} userId
     * @returns user's first and last name
     */
    getUser(userId) {
        if (userId in store.userNames) {
            return;
        }

        restRequest({
            url: `user/${userId}`
        }).then((user) => {
            // This is the first time we've fetched this user, cache their name
            store.userNames[userId] = `${user.firstName} ${user.lastName}`;
            return store.userNames[userId];
        });
    }
});

export default ActiveLearningView;
