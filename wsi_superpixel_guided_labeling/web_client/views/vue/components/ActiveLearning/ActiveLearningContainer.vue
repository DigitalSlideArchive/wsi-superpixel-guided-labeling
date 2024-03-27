<script>
/* global geo */ // eslint-disable-line no-unused-vars
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';

import { store, updatePixelmapLayerStyle } from '../store.js';
import { viewMode } from '../constants.js';

export default Vue.extend({
    props: ['sortedSuperpixelIndices'],
    data() {
        return {
            pageSize: 8,
            currentImageMetadata: {},
            map: null,
            featureLayer: null,
            boundingBoxFeature: null,
            viewerWidget: null,
            initialZoom: 1,
            windowResize: false
        };
    },
    computed: {
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
    watch: {
        selectedIndex() {
            this.updateSelectedCard();
        },
        page(newPage, oldPage) {
            this.updateSelectedPage(newPage, oldPage);
        },
        predictions() {
            const annotation = store.annotationsByImageId[store.currentImageId].predictions;
            if (store.predictions) {
                this.viewerWidget.drawAnnotation(annotation);
            } else {
                this.viewerWidget.removeAnnotation(annotation);
            }
        },
        changeLog: {
            handler() {
                if (!store.changeLog.length) {
                    return;
                }
                const change = store.changeLog.pop();
                store.backboneParent.saveLabelAnnotations([change.imageId]);
                this.drawLabels();
            },
            deep: true
        }
    },
    mounted() {
        // set store
        store.overlayLayers = [];
        store.maxPage = this.sortedSuperpixelIndices.length / this.pageSize;
        store.pageSize = this.pageSize;
        window.addEventListener('resize', this.updatePageSize);

        this.updateConfig();
        const startIndex = 0;
        const endIndex = Math.min(startIndex + store.pageSize, this.sortedSuperpixelIndices.length);
        store.superpixelsToDisplay = this.sortedSuperpixelIndices.slice(startIndex, endIndex);
        store.currentImageId = store.superpixelsToDisplay[0].imageId;
        restRequest({
            url: `item/${store.currentImageId}/tiles`
        }).done((resp) => {
            this.currentImageMetadata = resp;
            this.createImageViewer();
            this.updatePageSize();
            this.createCategories();
        });
    },
    methods: {
        updateMapBoundsForSelection() {
            if (!this.viewerWidget || !this.viewerWidget.viewer) {
                return;
            }
            // Center the selected superpixel
            const superpixel = store.superpixelsToDisplay[store.selectedIndex];
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
            const annotation = store.annotationsByImageId[store.currentImageId].labels;
            this.viewerWidget.drawAnnotation(annotation);
        },
        createImageViewer() {
            if (this.viewerWidget) {
                this.viewerWidget.destroy();
            }
            this.viewerWidget = new ViewerWidget.geojs({ // eslint-disable-line new-cap
                parentView: store.backboneParent,
                el: this.$refs.map,
                itemId: store.currentImageId,
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
                    store.overlayLayers.push(layer);
                    updatePixelmapLayerStyle();
                }
            });
            this.viewerWidget.on('g:removeOverlayAnnotation', (element, layer) => {
                if (element.type === 'pixelmap') {
                    // Drop the reference to any overlays that have been removed
                    const index = _.findIndex(store.overlayLayers, (overlay) => {
                        return overlay.id() === layer.id();
                    });
                    store.overlayLayers.splice(index, 1);
                    updatePixelmapLayerStyle();
                }
            });
        },
        updateConfig: _.debounce(function () {
            store.backboneParent.updateHistomicsYamlConfig();
        }, 500),
        updateSelectedCard() {
            const newImageId = store.superpixelsToDisplay[store.selectedIndex].imageId;
            if (newImageId !== store.currentImageId) {
                store.currentImageId = newImageId;
                // TODO: consider caching image metadata for each image the first time this request gets made
                restRequest({
                    url: `item/${store.currentImageId}/tiles`
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
            const oldIndex = store.selectedIndex;
            if (!this.windowResize) {
                // Only reset the selected index if the user has changed the page
                // and the page has not been changed because of window resize.
                store.selectedIndex = (newPage > oldPage) ? 0 : store.pageSize - 1;
            }
            this.windowResize = false;
            if (oldIndex === store.selectedIndex) {
                // Force the update
                this.updateSelectedCard();
            }
        },
        updatePageSize() {
            if (store.mode !== viewMode.Guided) {
                return;
            }
            this.windowResize = true;
            // compute how many cards to show
            const el = document.getElementById('filmstrip-cards');
            const card = el.firstElementChild.clientWidth;
            const paddingOffset = 20;
            // update page
            const currentIndex = store.page * store.pageSize + store.selectedIndex;
            const oldPageSize = store.pageSize;
            store.pageSize = Math.max(Math.floor(el.clientWidth / (card + paddingOffset)), 1);
            const oldPage = store.page;
            store.page = Math.floor(currentIndex / store.pageSize);
            store.selectedIndex = currentIndex - (store.pageSize * store.page);
            store.maxPage = Math.ceil(this.sortedSuperpixelIndices.length / store.pageSize);
            if (oldPageSize !== store.pageSize && oldPage === store.page) {
                // Force an update
                this.updateSelectedPage(store.page, oldPage);
            }
        },
        /**
         * Parse existing label annotations to populate the categories used for labeling.
         */
        createCategories() {
            // FIXME: Factor this out to use in InitialLabels as well
            _.forEach(Object.entries(store.annotationsByImageId), ([imageId, annotations]) => {
                if (_.has(annotations, 'labels')) {
                    const pixelmapElement = annotations.labels.get('annotation').elements[0];
                    const existingCategories = _.map(this.categoriesAndIndices, (category) => category.category.label);
                    this.createCategoriesFromPixelmapElement(pixelmapElement, imageId, existingCategories);
                }
            });
        },
        /**
         * Given a pixelmap annotation element and a list of categories, work to populate the component's
         * `categories` data property. For each category in the annotation, add the labeled indices to that
         * object. As a side effect, also populate the `existingCategories` parameter, which is used by the calling function
         * above.
         * @param {Object} pixelmapElement
         * @param {number} imageId
         * @param {string[]} existingCategories
         */
        createCategoriesFromPixelmapElement(pixelmapElement, imageId, existingCategories) {
            // FIXME: Factor this out to use in InitialLabels as well
            _.forEach(pixelmapElement.categories, (category, categoryIndex) => {
                if (categoryIndex !== 0) {
                    // For each non-default category, get all the labeled indices
                    // for this superpixel element.
                    const labeledSuperpixels = new Set();
                    _.forEach(pixelmapElement.values, (value, index) => {
                        if (value === categoryIndex) {
                            labeledSuperpixels.add(index);
                        }
                    });
                    // Either add the category to the initial label UI,
                    // or increment the count if it already exists.
                    const categoryToUpdateIndex = _.findIndex(store.categoriesAndIndices,
                        (categoryAndIndices) => categoryAndIndices.category.label === category.label);
                    if (categoryToUpdateIndex === -1) {
                        const indices = {};
                        indices[store.currentImageId] = labeledSuperpixels;
                        store.categoriesAndIndices.push({
                            category,
                            indices
                        });
                    } else if (labeledSuperpixels.size) {
                        store.categoriesAndIndices[categoryToUpdateIndex].indices[imageId] = labeledSuperpixels;
                    }
                }
            });
        }
    }
});
</script>

<template>
  <div>
    <!-- Slide Image -->
    <div
      ref="map"
      class="h-active-learning-map"
    />
  </div>
</template>

<style scoped>
.h-active-learning-map {
    width: 100%;
    height: 100vh;
}
</style>
