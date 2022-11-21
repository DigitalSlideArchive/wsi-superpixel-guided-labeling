/* global $, __webpack_public_path__ */
import View from '@girder/core/views/View';
import { restRequest, getApiRoot } from '@girder/core/rest';
import _ from 'underscore';

import router from '@girder/histomicsui/router';
import AnnotationModel from '@girder/large_image_annotation/models/AnnotationModel';

import learningTemplate from '../../templates/body/activeLearningView.pug';
import ActiveLearningContainer from '../vue/components/ActiveLearning/ActiveLearningContainer.vue';

import '../../stylesheets/body/learning.styl';

var ActiveLearningView = View.extend({
    initialize(settings) {
        this.render();
        router.setQuery(); // I don't think I should need to do this, but it doesn't work otherwise
        this.trainingDataFolderId = router.getQuery('folder');
        this.imageItemsById = {};
        this.annotationsByImageId = {};
        this.sortedSuperpixelIndices = [];
        this.debounceSaveLabelAnnotations = _.debounce(this.saveLabelAnnotations, 500);

        restRequest({
            url: `folder/${this.trainingDataFolderId}`
        }).then((response) => {
            this.annotationBaseName = response.meta['active_learning_annotation_name'];
            this.activeLearningJobUrl = response.meta['active_learning_job_url'] || 'dsarchive_superpixel_latest/SuperpixelClassification';
            this.activeLearningJobType = response.meta['active_learning_job_type'] || 'dsarchive/superpixel:latest#SuperpixelClassification';

            return restRequest({
                url: 'job/all',
                data: {
                    types: `["${this.activeLearningJobType}"]`,
                    sort: 'updated'
                }
            }).done((jobs) => {
                const lastRunJob = _.filter(jobs, (job) => {
                    const kwargs = job.kwargs || {};
                    const containerArgs = kwargs.container_args;
                    return containerArgs && containerArgs.includes(this.trainingDataFolderId);
                })[0];
                this.lastRunJobId = lastRunJob._id;
                if (lastRunJob.status === 2) {
                    this.showSpinner();
                    const poll = setInterval(() => {
                        restRequest({
                            url: `job/${lastRunJob._id}`
                        }).done((update) => {
                            if (update.status === 3) {
                                clearInterval(poll);
                                this.hideSpinner();
                                this.getAnnotations();
                            }
                        });
                    }, 5000);
                } else {
                    this.getAnnotations();
                }
            });
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
        $.ajax({
            url: geojsUrl,
            dataType: 'script',
            cache: true
        }).done((resp) => {
            const vm = new ActiveLearningContainer({
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
            this.vueApp = vm;
        });
    },

    render() {
        this.$el.html(learningTemplate());
        return this;
    },

    getAnnotations() {
        const annotationsToFetchByImage = {};
        restRequest({
            url: 'item',
            data: {
                folderId: this.trainingDataFolderId
            }
        }).then((response) => {
            return _.forEach(response, (item) => {
                if (item.largeImage) {
                    this.imageItemsById[item._id] = item;
                    this.annotationsByImageId[item._id] = {};

                    restRequest({
                        url: 'annotation',
                        data: {
                            itemId: item._id,
                            sort: 'created',
                            sortdir: -1
                        }
                    }).then((response) => {
                        // TODO: refine name checking
                        const predictionsAnnotations = _.filter(response, (annotation) => {
                            return this.annotationIsValid(annotation) && annotation.annotation.name.includes('Predictions');
                        });
                        const superpixelAnnotations = _.filter(response, (annotation) => {
                            return this.annotationIsValid(annotation) && !annotation.annotation.name.includes('Predictions');
                        });
                        annotationsToFetchByImage[item._id] = {
                            predictions: predictionsAnnotations[0]._id,
                            superpixels: superpixelAnnotations[superpixelAnnotations.length - 1]._id, // epoch 0 should have no human labels
                            labels: superpixelAnnotations[0]._id
                        };
                        return this.fetchAnnotations(annotationsToFetchByImage);
                    });
                }
            });
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
                const backboneModel = new AnnotationModel({ _id: annotationId });
                promises.push(backboneModel.fetch().done(() => {
                    this.annotationsByImageId[imageId][key] = backboneModel;
                    if (key === 'predictions') {
                        this.computeAverageCertainty(backboneModel);
                    }
                }));
            });
        });
        $.when(...promises).then(() => {
            this.getSortedSuperpixelIndices();
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
        this.sortedSuperpixelIndices = _.sortBy(superPixelConfidenceData, 'confidence');
    },

    saveLabelAnnotations() {
        _.forEach(Object.keys(this.annotationsByImageId), (imageId) => {
            const labelAnnotation = this.annotationsByImageId[imageId].labels;
            labelAnnotation.save();
        });
    },

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

    retrain() {
        restRequest({
            method: 'POST',
            url: `slicer_cli_web/${this.activeLearningJobUrl}/rerun`,
            data: {
                jobId: this.lastRunJobId,
                randominput: false
            }
        }).done((res) => {
            const newJobId = res._id;
            this.showSpinner();
            const poll = setInterval(() => {
                restRequest({
                    url: `job/${newJobId}`
                }).done((update) => {
                    if (!update || update.status === 3) {
                        clearInterval(poll);
                        this.hideSpinner();
                        this.getAnnotations();
                    }
                });
            }, 2000);
        });
    }
});

export default ActiveLearningView;
