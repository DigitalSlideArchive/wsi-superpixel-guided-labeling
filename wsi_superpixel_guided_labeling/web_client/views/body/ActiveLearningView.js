/* global $, __webpack_public_path__ */
import View from '@girder/core/views/View';
import { restRequest, getApiRoot } from '@girder/core/rest';
import _ from 'underscore';

import router from '@girder/histomicsui/router';
import FolderCollection from '@girder/core/collections/FolderCollection';
import AnnotationModel from '@girder/large_image_annotation/models/AnnotationModel';
import ItemCollection from '@girder/core/collections/ItemCollection';
import JobStatus from '@girder/jobs/JobStatus.js';

import learningTemplate from '../../templates/body/activeLearningView.pug';
import ActiveLearningContainer from '../vue/components/ActiveLearning/ActiveLearningContainer.vue';
import ActiveLearningSetupContainer from '../vue/components/ActiveLearningSetup/ActiveLearningSetupContainer.vue';

import '../../stylesheets/body/learning.styl';

const activeLearningSteps = {
    SuperpixelSegmentation: 0,
    InitialLabeling: 1,
    GuidedLabeling: 2
};

var ActiveLearningView = View.extend({
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
        this.debounceSaveLabelAnnotations = _.debounce(this.saveLabelAnnotations, 500);

        this.fetchFoldersAndItems();
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
            this.activeLearningStep = Math.min(previousJobs.length, 2);
            if (previousJobs[0]) {
                this.lastRunJobId = previousJobs[0]._id || '';
            }

            if (!previousJobs[0] || previousJobs[0].status !== JobStatus.RUNNING) {
                this.startActiveLearning();
            } else {
                // There is a job running
                this.waitForJobCompletion(previousJobs[0]._id);
            }
        });
    },

    startActiveLearning() {
        if (this.activeLearningStep === activeLearningSteps.SuperpixelSegmentation) {
            this.mountVueComponent();
        } else {
            this.getAnnotations();
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
                        router: router,
                        trainingDataFolderId: this.trainingDataFolderId,
                        annotationsByImageId: this.annotationsByImageId,
                        annotationBaseName: this.annotationBaseName,
                        sortedSuperpixelIndices: this.sortedSuperpixelIndices,
                        apiRoot: getApiRoot(),
                        backboneParent: this,
                        currentAverageConfidence: this.currentAverageConfidence
                    }
                });
            } else {
                const imageNamesById = {};
                _.forEach(Object.keys(this.imageItemsById), (imageId) => {
                    imageNamesById[imageId] = this.imageItemsById[imageId].name;
                });
                vm = new ActiveLearningSetupContainer({
                    el,
                    propsData: {
                        backboneParent: this,
                        imageNamesById: imageNamesById,
                        annotationsByImageId: this.annotationsByImageId,
                        activeLearningStep: this.activeLearningStep
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

    getAllAnnotationsForItemPromise(item, annotationsToFetchByImage) {
        return restRequest({
            url: 'annotation',
            data: {
                itemId: item._id,
                sort: 'created',
                sortdir: -1
            }
        }).done((annotations) => {
            // TODO: refine name checking
            const predictionsAnnotations = _.filter(annotations, (annotation) => {
                return this.annotationIsValid(annotation) && annotation.annotation.name.includes('Predictions');
            });
            const superpixelAnnotations = _.filter(annotations, (annotation) => {
                return this.annotationIsValid(annotation) && !annotation.annotation.name.includes('Predictions');
            });
            annotationsToFetchByImage[item._id] = {
                predictions: predictionsAnnotations[0]._id,
                superpixels: superpixelAnnotations[superpixelAnnotations.length - 1]._id, // epoch 0 should have no human labels
                labels: superpixelAnnotations[0]._id
            };
        });
    },

    getLabelAnnotationForItemPromise(item, annotationsToFetchByImage) {
        return restRequest({
            url: 'annotation',
            data: {
                itemId: item._id,
                sort: 'created',
                sortdir: -1
            }
        }).done((annotations) => {
            const labelAnnotation = _.filter(annotations, (annotation) => {
                return this.annotationIsValid && !annotation.annotation.name.includes('Predicitions');
            })[0];
            if (labelAnnotation) {
                annotationsToFetchByImage[item._id] = {
                    labels: labelAnnotation._id
                };
            }
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
                    const promiseFunction = this.activeLearningStep === activeLearningSteps.GuidedLabeling
                        ? this.getAllAnnotationsForItemPromise
                        : this.getLabelAnnotationForItemPromise;
                    promises.push(promiseFunction.apply(this, [item, annotationsToFetchByImage]));
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
            if (this.activeLearningStep === activeLearningSteps.GuidedLabeling) {
                this.getSortedSuperpixelIndices();
            }
            return this.mountVueComponent();
        });
    },

    computeAverageCertainty(annotation) {
        const confidenceArray = annotation.get('annotation').elements[0].user.confidence;
        const sum = _.reduce(confidenceArray, (sum, num) => sum + num, 0);
        this.currentAverageConfidence = sum / confidenceArray.length;
    },

    getSortedSuperpixelIndices() {
        const superPixelConfidenceData = [];
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
            _.forEach(userData.confidence, (score, index) => {
                const bbox = userData.bbox.slice(index * 4, index * 4 + 4);
                const agreeChoice = (labelValues[index] === 0) ? undefined : (labelValues[index] === pixelmapValues[index]) ? 'Yes' : 'No';
                const selectedCategory = (labelValues[index] === 0) ? undefined : labelValues[index];
                superPixelConfidenceData.push({
                    index: index,
                    confidence: score,
                    certainty: score,
                    imageId: imageId,
                    superpixelImageId: superpixelImageId,
                    boundaries: boundaries,
                    scale: scale,
                    bbox: bbox,
                    prediction: pixelmapValues[index],
                    categories: superpixelCategories,
                    agreeChoice: agreeChoice,
                    selectedCategory: selectedCategory
                });
            });
        });
        this.sortedSuperpixelIndices = _.sortBy(superPixelConfidenceData, 'certainty');
    },

    /*****************************************************************
     * Functions in this section should be called by child components
     * (vue components) when they need to perform some kind of rest
     * request or run a job.
     ****************************************************************/

    saveLabelAnnotations() {
        _.forEach(Object.keys(this.annotationsByImageId), (imageId) => {
            const labelAnnotation = this.annotationsByImageId[imageId].labels;
            labelAnnotation.save();
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
            data: data
        }).done((response) => {
            const newJobId = response._id;
            this.waitForJobCompletion(newJobId, goToNextStep);
        });
    },

    generateInitialSuperpixels(radius, magnification) {
        // get the folders to store annotations, models, features
        const folders = this.childFolders.models;
        const annotationsFolderId = _.filter(folders, (folder) => folder.get('name') === 'Annotations')[0].get('_id');
        const featuresFolderId = _.filter(folders, (folder) => folder.get('name') === 'Features')[0].get('_id');
        const modelsFolderId = _.filter(folders, (folder) => folder.get('name') === 'Models')[0].get('_id');
        const data = {
            images: this.trainingDataFolderId,
            annotationDir: annotationsFolderId,
            features: featuresFolderId,
            magnification: magnification,
            radius: radius,
            labels: JSON.stringify([]),
            modeldir: modelsFolderId,
            girderApiUrl: '',
            girderToken: ''
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
                    this.startActiveLearning();
                }
                // TODO handle job failure
            });
        }, 2000);
    }
});

export default ActiveLearningView;
