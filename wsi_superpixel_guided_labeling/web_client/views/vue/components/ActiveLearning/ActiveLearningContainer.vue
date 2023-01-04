<script>
/* global geo */
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';

import ActiveLearningFilmStrip from './ActiveLearningFilmStrip.vue';
import ActiveLearningKeyboardShortcuts from './ActiveLearningKeyboardShortcuts.vue';

import { store } from './store.js';

export default Vue.extend({
    components: {
        ActiveLearningFilmStrip,
        ActiveLearningKeyboardShortcuts,
    },
    props: [
        'router',
        'trainingDataFolderId',
        'annotationsByImageId',
        'annotationBaseName',
        'sortedSuperpixelIndices',
        'apiRoot',
        'backboneParent',
        'currentAverageConfidence'
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
            initialZoom: 1
        };
    },
    computed: {
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
        }
    },
    methods: {
        updateMapBoundsForSelection() {
            if (!this.viewerWidget) {
                return;
            }
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
            this.viewerWidget.viewer.zoom(zoom - 1.5);
            this.viewerWidget.viewer.center(center);
            this.boundingBoxFeature.data([[
                [bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]
            ]]);
            this.featureLayer.draw();
        },
        drawSuperpixels() {
            const annotation = this.annotationsByImageId[this.selectedImageId].superpixels;
            this.viewerWidget.drawAnnotation(annotation);
        },
        createImageViewer() {
            if (this.viewerWidget) {
                this.viewerWidget.destroy();
            }
            this.viewerWidget = new ViewerWidget.geojs({
                parentView: this.backboneParent,
                el: this.$refs.map,
                itemId: this.selectedImageId,
                hoverEvents: false,
                highlightFeatureSizeLimit: 5000,
                scale: { position: { bottom: 20, right: 10} }
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
                this.drawSuperpixels();
            });
        },
        saveLabelAnnotations() {
            _.forEach(Object.keys(this.annotationsByImageId), (imageId) => {
                const annotation = this.annotationsByImageId[imageId].labels;
                annotation.save();
            });
        },
    },
    watch: {
        selectedIndex() {
            const newImageId = this.superpixelsToDisplay[this.selectedIndex].imageId;
            if (newImageId !== this.selectedImageId) {
                this.selectedImageId = newImageId;
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
                const change = this.changeLog[this.changeLog.length -1];
                this.backboneParent.debounceSaveLabelAnnotations(change);
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
        store.currentAverageConfidence = this.currentAverageConfidence;

        const predictionAnnotation = this.annotationsByImageId[this.selectedImageId].predictions;
        store.categories = predictionAnnotation.get('annotation').elements[0].categories;

        const startIndex = 0;
        const endIndex = Math.min(startIndex + store.pageSize, this.sortedSuperpixelIndices.length);
        store.superpixelsToDisplay = this.sortedSuperpixelIndices.slice(startIndex, endIndex);
        restRequest({
            url: `item/${this.selectedImageId}/tiles`
        }).done((resp) => {
            this.currentImageMetadata = resp;
            this.createImageViewer();
        });
    }
});
</script>

<template>
    <div class="h-active-learning-container">
        <active-learning-keyboard-shortcuts />
        <div ref="map" class="h-active-learning-map"></div>
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

.h-superpixel-container {
    position: relative;
    height: 100px;
    width: 100px;
}

.h-wsi-region {
    position: absolute;
    left: 0px;
    top: 0px;
    z-index: 10;

}

.h-superpixel-region {
    position: absolute;
    left: 0px;
    top: 0px;
    z-index: 20;
}
</style>
