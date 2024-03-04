<script>
/* global geo */ // eslint-disable-line no-unused-vars
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';

import ActiveLearningFilmStrip from './ActiveLearningFilmStrip.vue';
import ActiveLearningKeyboardShortcuts from './ActiveLearningKeyboardShortcuts.vue';
import AnnotationOpacityControl from '../AnnotationOpacityControl.vue';

import { store, updatePixelmapLayerStyle } from '../store.js';

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
        'currentAverageCertainty',
        'categoryMap'
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
            overlayLayers: [],
            windowResize: false
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
            this.updateSelectedCard();
        },
        page(newPage, oldPage) {
            this.updateSelectedPage(newPage, oldPage);
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
                this.backboneParent.saveLabelAnnotations([change.imageId]);
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
        store.categories = [...this.categoryMap.values()];
        window.addEventListener('resize', this.updatePageSize);

        this.updateConfig();
        const startIndex = 0;
        const endIndex = Math.min(startIndex + store.pageSize, this.sortedSuperpixelIndices.length);
        store.superpixelsToDisplay = this.sortedSuperpixelIndices.slice(startIndex, endIndex);
        restRequest({
            url: `item/${this.selectedImageId}/tiles`
        }).done((resp) => {
            this.currentImageMetadata = resp;
            this.createImageViewer();
            this.updatePageSize();
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
                if (element.type === 'pixelmap') {
                    // There can be multiple overlays present, track all of them
                    this.overlayLayers.push(layer);
                    updatePixelmapLayerStyle(this.overlayLayers);
                }
            });
            this.viewerWidget.on('g:removeOverlayAnnotation', (element, layer) => {
                if (element.type === 'pixelmap') {
                    // Drop the reference to any overlays that have been removed
                    const index = _.findIndex(this.overlayLayers, (overlay) => {
                        return overlay.id() === layer.id();
                    });
                    this.overlayLayers.splice(index, 1);
                    updatePixelmapLayerStyle(this.overlayLayers);
                }
            });
        },
        updateConfig: _.debounce(function () {
            this.backboneParent.updateHistomicsYamlConfig();
        }, 500),
        updateSelectedCard() {
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
        updateSelectedPage(newPage, oldPage) {
            const startIndex = newPage * store.pageSize;
            const endIndex = Math.min(startIndex + store.pageSize, this.sortedSuperpixelIndices.length);
            store.superpixelsToDisplay = this.sortedSuperpixelIndices.slice(startIndex, endIndex);
            const oldIndex = this.selectedIndex;
            if (!this.windowResize) {
                // Only reset the selected index if the user has changed the page
                // and the page has not been changed because of window resize.
                store.selectedIndex = (newPage > oldPage) ? 0 : store.pageSize - 1;
            }
            this.windowResize = false;
            if (oldIndex === this.selectedIndex) {
                // Force the update
                this.updateSelectedCard();
            }
        },
        updatePageSize() {
            this.windowResize = true;
            // compute how many cards to show
            const el = document.getElementById('filmstrip-cards');
            const card = el.firstElementChild.clientWidth;
            const paddingOffset = 20;
            // update page
            const currentIndex = this.page * store.pageSize + this.selectedIndex;
            const oldPageSize = store.pageSize;
            store.pageSize = Math.max(Math.floor(el.clientWidth / (card + paddingOffset)), 1);
            const oldPage = this.page;
            store.page = Math.floor(currentIndex / store.pageSize);
            store.selectedIndex = currentIndex - (store.pageSize * store.page);
            store.maxPage = Math.ceil(this.sortedSuperpixelIndices.length / store.pageSize);
            if (oldPageSize !== store.pageSize && oldPage === this.page) {
                // Force an update
                this.updateSelectedPage(this.page, oldPage);
            }
        }
    }
});
</script>

<template>
  <div class="h-active-learning-container">
    <active-learning-keyboard-shortcuts />
    <annotation-opacity-control
      :overlay-layers="overlayLayers"
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
