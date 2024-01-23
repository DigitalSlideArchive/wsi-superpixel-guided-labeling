<script>
/* global geo */ // eslint-disable-line no-unused-vars
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';

import ActiveLearningFilmStrip from './ActiveLearningFilmStrip.vue';
import ActiveLearningKeyboardShortcuts from './ActiveLearningKeyboardShortcuts.vue';
import AnnotationOpacityControl from '../AnnotationOpacityControl.vue';

import { store } from '../store.js';

export default Vue.extend({
    components: {
        ActiveLearningFilmStrip,
        ActiveLearningKeyboardShortcuts,
        AnnotationOpacityControl
    },
    props: [
        'router',
        'trainingDataFolderId',
        'annotationsByImageId',
        'annotationBaseName',
        'sortedSuperpixelIndices',
        'apiRoot',
        'backboneParent',
        'currentAverageCertainty'
    ],
    data() {
        return {
            pageSize: 8,
            currentImageId: '',
            imageItemsById: {},
            annotationsByImage: {},
            currentImageMetadata: {},
            map: null,
            featureLayer: null,
            boundingBoxFeature: null,
            selectedImageId: this.sortedSuperpixelIndices[0].imageId,
            viewerWidget: null,
            initialZoom: 1,
            overlayLayer: null
        };
    },
    computed: {
        // For computed properties that just return store values, it probably just makes more sense
        // to use store.<prop> instead of this.<computedProp> for readability
        superpixelsToDisplay() {
            return store.superpixelsToDisplay;
        },
        selectedIndex() {
            return store.selectedIndex;
        },
        page() {
            return store.page;
        },
        changeLog() {
            return store.changeLog;
        },
        predictions() {
            return store.predictions;
        },
        categories() {
            return store.categories;
        }
    },
    watch: {
        selectedIndex() {
            const newImageId = this.superpixelsToDisplay[this.selectedIndex].imageId;
            if (newImageId !== this.selectedImageId) {
                this.selectedImageId = newImageId;
                // TODO: consider caching image metadata for each image the first time this request gets made
                restRequest({
                    url: `item/${this.selectedImageId}/tiles`
                }).done((resp) => {
                    this.currentImageMetadata = resp;
                    this.createImageViewer();
                });
            } else {
                this.updateMapBoundsForSelection();
            }
        },
        page(newPage, oldPage) {
            const startIndex = newPage * store.pageSize;
            const endIndex = Math.min(startIndex + store.pageSize, this.sortedSuperpixelIndices.length);
            store.superpixelsToDisplay = this.sortedSuperpixelIndices.slice(startIndex, endIndex);
            const oldIndex = this.selectedIndex;
            store.selectedIndex = (newPage > oldPage) ? 0 : store.pageSize - 1;
            if (oldIndex === this.selectedIndex) {
                this.updateMapBoundsForSelection();
            }
        },
        predictions() {
            const annotation = this.annotationsByImageId[this.selectedImageId].predictions;
            if (this.predictions) {
                this.viewerWidget.drawAnnotation(annotation);
            } else {
                this.viewerWidget.removeAnnotation(annotation);
            }
        },
        changeLog: {
            handler() {
                if (!this.changeLog.length) {
                    return;
                }
                const change = this.changeLog.pop();
                this.saveAnnotations(change.imageId);
                this.drawLabels();
            },
            deep: true
        }
    },
    mounted() {
        // set store
        store.apiRoot = this.apiRoot;
        store.annotationsByImageId = this.annotationsByImageId;
        store.backboneParent = this.backboneParent;
        store.page = 0;
        store.maxPage = this.sortedSuperpixelIndices.length / this.pageSize;
        store.pageSize = this.pageSize;
        store.selectedIndex = 0;
        store.predictions = false;
        store.currentAverageCertainty = this.currentAverageCertainty;

        const predictionAnnotation = this.annotationsByImageId[this.selectedImageId].predictions;
        const predictionCategories = predictionAnnotation.get('annotation').elements[0].categories;
        // ensure the default category is at index 0.
        // Once the config yaml is used, the store categories should be taken from that.
        const nonDefaultPredictionsCategories = _.filter(predictionCategories, (category) => category.label !== 'default');
        store.categories = [
            {
                label: 'default',
                fillColor: 'rgba(0, 0, 0, 0)',
                strokeColor: 'rgb(0, 0, 0, 1)'
            },
            ...nonDefaultPredictionsCategories
        ];

        const startIndex = 0;
        const endIndex = Math.min(startIndex + store.pageSize, this.sortedSuperpixelIndices.length);
        store.superpixelsToDisplay = this.sortedSuperpixelIndices.slice(startIndex, endIndex);
        restRequest({
            url: `item/${this.selectedImageId}/tiles`
        }).done((resp) => {
            this.currentImageMetadata = resp;
            this.createImageViewer();
        });
    },
    methods: {
        updateMapBoundsForSelection() {
            if (!this.viewerWidget) {
                return;
            }
            // Center the selected superpixel
            const superpixel = this.superpixelsToDisplay[this.selectedIndex];
            const bbox = superpixel.bbox;
            const bboxWidth = bbox[2] - bbox[0];
            const bboxHeight = bbox[3] - bbox[1];
            const scaleX = Math.abs((2 * bboxWidth) / this.currentImageMetadata.sizeX);
            const scaleY = Math.abs((2 * bboxHeight) / this.currentImageMetadata.sizeY);
            const zoom = this.initialZoom - Math.log2(Math.max(scaleX, scaleY));
            const center = {
                x: (bbox[0] + bbox[2]) / 2,
                y: (bbox[1] + bbox[3]) / 2
            };
            // Draw bounding box around selected superpixel
            this.viewerWidget.viewer.zoom(zoom - 1.5);
            this.viewerWidget.viewer.center(center);
            this.boundingBoxFeature.data([[
                [bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]
            ]]);
            this.featureLayer.draw();
        },
        drawLabels() {
            const annotation = this.annotationsByImageId[this.selectedImageId].labels;
            this.viewerWidget.drawAnnotation(annotation);
        },
        createImageViewer() {
            if (this.viewerWidget) {
                this.viewerWidget.destroy();
            }
            this.viewerWidget = new ViewerWidget.geojs({ // eslint-disable-line new-cap
                parentView: this.backboneParent,
                el: this.$refs.map,
                itemId: this.selectedImageId,
                hoverEvents: false,
                highlightFeatureSizeLimit: 5000,
                scale: { position: { bottom: 20, right: 10 } }
            });
            this.viewerWidget.on('g:imageRendered', () => {
                this.featureLayer = this.viewerWidget.viewer.createLayer('feature', { features: ['polygon'] });
                this.boundingBoxFeature = this.featureLayer.createFeature('polygon');
                this.boundingBoxFeature.style({
                    fillOpacity: 0,
                    stroke: true,
                    strokeWidth: 4,
                    strokeColor: { r: 255, g: 255, b: 0 }
                });
                this.initialZoom = this.viewerWidget.viewer.zoom();
                this.viewerWidget.viewer.clampBoundsX(false);
                this.viewerWidget.viewer.clampBoundsY(false);

                // Remove keyboard actions
                const interactor = this.viewerWidget.viewer.interactor();
                interactor.keyboard({});

                this.updateMapBoundsForSelection();
                this.drawLabels();
            });
            this.viewerWidget.on('g:drawOverlayAnnotation', (element, layer) => {
                if (element.type === 'pixelmap') this.overlayLayer = layer;
            });
        },
        updatePixelmapLayerStyle() {
            _.forEach(this.overlayLayer.features(), (feature) => {
                feature.style('color', (d, i) => {
                    if (d < 0 || d >= this.categories.length) {
                        console.warn(`No category found at index ${d} in the category map.`);
                        return 'rgba(0, 0, 0, 0)';
                    }
                    const category = this.categories[d];
                    return (i % 2 === 0) ? category.fillColor : category.strokeColor;
                });
            });
            this.overlayLayer.draw();
        },
        saveAnnotations(imageId) {
            // If we dont specify an image, save all images
            const idsToSave = imageId ? [imageId] : Object.keys(this.annotationsByImageId);
            this.backboneParent.saveLabelAnnotations(idsToSave);
        },
        synchronizeCategories() {
            _.forEach(Object.values(this.annotationsByImageId), (annotations) => {
                const superpixelElement = annotations.labels.get('annotation').elements[0];
                if (superpixelElement) {
                    superpixelElement.categories = JSON.parse(JSON.stringify(this.categories));
                }
            });
            this.saveAnnotations(this.selectedImageId);
            this.updatePixelmapLayerStyle();
        }
    }
});
</script>

<template>
  <div class="h-active-learning-container">
    <active-learning-keyboard-shortcuts />
    <annotation-opacity-control
      :active-learning-setup="false"
      :categories="categories"
      :update="synchronizeCategories"
    />
    <div
      ref="map"
      class="h-active-learning-map"
    />
    <active-learning-film-strip />
  </div>
</template>

<style scoped>
.h-active-learning-container {
    width: 100%;
    height: calc(100vh - 52px);
    position: absolute;
}

.h-active-learning-map {
    width: 100%;
    height: 100%;
}
</style>
