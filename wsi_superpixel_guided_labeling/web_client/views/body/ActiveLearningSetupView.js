/* global $, __webpack_public_path__ */
import View from '@girder/core/views/View';
import { restRequest } from '@girder/core/rest';
import ItemCollection from '@girder/core/collections/ItemCollection';
import FolderCollection from '@girder/core/collections/FolderCollection';
import AnnotationCollection from '@girder/large_image_annotation/collections/AnnotationCollection';
import _ from 'underscore';

import router from '@girder/histomicsui/router';

import setupTemplate from '../../templates/body/activeLearningSetupView.pug';
import ActiveLearningSetupContainer from '../vue/components/ActiveLearningSetup/ActiveLearningSetupContainer.vue';

import '../../stylesheets/body/learning.styl';

var ActiveLearningSetupView = View.extend({
    initialize(settings) {
        this.render();
        router.setQuery();
        this.trainingDataFolderId = router.getQuery('folder');
        // Perhaps this could come from a plugin setting in the future
        this.activeLearningJobUrl = 'dsarchive_superpixel_latest/SuperpixelClassification';
        this.activeLearningJobType = 'dsarchive/superpixel:latest#SuperpixelClassification';
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
            })
        });
    },

    checkJobs() {
        // Check to see where we are in the process
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
                const runningOrSuccess = job.status === 3 || job.status === 2;
                return runningOrSuccess && containerArgs.includes(this.trainingDataFolderId);
            });
            const initialTrainingDone = previousJobs.length > 2;
            if (initialTrainingDone) {
                return;
            }
            const lastRunJob = previousJobs[0];
            if (lastRunJob) {
                if (lastRunJob.status === 2) {
                    this.waitForJobCompletion(lastRunJob._id);
                } else {
                    this.initialJob = lastRunJob;
                    this.getAnnotation();
                }
            } else {
                this.mountVueComponent();
            }
        });
    },

    getAnnotation() {
        /**
         * get the first large_image item and annotation
         * re-render the vue component with more props
         **/
        this.firstLargeImageItem = _.filter(this.childItems.models, (item) => item.get('largeImage'))[0];
        const annotations = new AnnotationCollection();
        annotations.fetch({ itemId: this.firstLargeImageItem.get('_id') }).done(() => {
            this.annotation = _.filter(annotations.models, (annotationModel) => {
                const annotationObject = annotationModel.get('annotation');
                const isSuperPixel = annotationObject['name'].includes('Superpixel');
                return isSuperPixel;
            })[0];
            this.mountVueComponent();
        });
    },

    mountVueComponent() {
        if (this.vueApp) {
            this.vueApp.$destroy();
        }
        const el = this.$('.h-active-learning-setup-container').get(0);
        // eslint-disable-next-line
        const root = (__webpack_public_path__ || '/status/built').replace(/\/$/, '');
        const geojsUrl = root + '/plugins/large_image/extra/geojs.js';
        $.ajax({
            url: geojsUrl,
            dataType: 'script',
            cache: true
        }).done((resp) => {
            this.vueApp = new ActiveLearningSetupContainer({
                el,
                propsData: {
                    backboneParent: this,
                    superpixelAnnotation: this.annotation,
                    largeImageItem: this.firstLargeImageItem,
                }
            });
        });
    },

    render() {
        this.$el.html(setupTemplate());
        return this;
    },

    triggerJob(data) {
        restRequest({
            method: 'POST',
            url: `slicer_cli_web/${this.activeLearningJobUrl}/run`,
            data: data
        }).done((response) => {
            const newJobId = response._id;
            this.waitForJobCompletion(newJobId);
        });
    },

    _saveAnnotation() {
        this.annotation.save();
    },

    debounceSaveAnnotation() {
        _.debounce(this._saveAnnotation, 250);
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
        this.triggerJob(data);
    },


    showSpinner() {
        $('.h-active-learning-setup-container').append(
            '<div class="g-hui-loading-overlay"><div>' +
            '<i class="icon-spin4 animate-spin"><i>' +
            '</div></div>'
        );
    },

    hideSpinner() {
        $('.g-hui-loading-overlay').remove();
    },

    waitForJobCompletion(jobId) {
        this.showSpinner();
        const poll = setInterval(() => {
            restRequest({
                url: `job/${jobId}`
            }).done((update) => {
                if (!update || update.status === 3) {
                    clearInterval(poll);
                    this.hideSpinner();
                    this.getAnnotation();
                }
                // TODO better handle job failed case
            });
        }, 2000);
    }
});

export default ActiveLearningSetupView;
