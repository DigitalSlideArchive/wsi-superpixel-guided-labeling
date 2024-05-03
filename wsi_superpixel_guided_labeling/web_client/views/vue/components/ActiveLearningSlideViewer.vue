<script>
/* global geo */ // eslint-disable-line no-unused-vars
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';

import { boundaryColor, viewMode } from './constants.js';
import { store, updatePixelmapLayerStyle } from './store.js';
import { getFillColor } from './utils.js';

export default Vue.extend({
    props: ['availableImages'],
    data() {
        return {
            hasLoaded: false,
            currentImageMetadata: {},

            // keep track of the current image and annotation to edit
            superpixelElement: null,
            map: null,

            // data to track the viewer widget/map/layers if needed
            viewerWidget: null,
            pixelmapPaintValue: null,
            featureLayer: null,
            initialZoom: 1,
            boundingBoxFeature: null
        };
    },
    computed: {
        pixelmapPaintBrush() {
            return store.pixelmapPaintBrush;
        },
        currentImageId() {
            return store.currentImageId;
        },
        categoryIndex() {
            return store.categoryIndex;
        },
        predictions() {
            return store.predictions;
        },
        mode() {
            return store.mode;
        },
        page() {
            return store.page;
        },
        selectedIndex() {
            return store.selectedIndex;
        },
        changeLog() {
            return store.changeLog;
        },
        superpixelsToDisplay() {
            return store.superpixelsToDisplay;
        },
        reviewSuperpixel() {
            return store.reviewSuperpixel;
        }
    },
    watch: {
        mode: {
            handler(newMode, oldMode) {
                if (newMode === oldMode) {
                    return;
                }
                store.reviewSuperpixel = null;
                if (store.mode === viewMode.Labeling) {
                    if (this.boundingBoxFeature) {
                        this.boundingBoxFeature.visible(false);
                        this.featureLayer.draw();
                    }
                } else if (store.mode === viewMode.Guided) {
                    if (this.boundingBoxFeature) {
                        this.boundingBoxFeature.visible(true);
                    }
                    this.updateMapBoundsForSelection();
                }
                this.updateActionModifiers();
            },
            immediate: true
        },
        categoryIndex(index) {
            if (index < 0 || index >= store.categoriesAndIndices.length) {
                store.categoryIndex = 0;
            }
        },
        currentImageId() {
            this.setupViewer();
        },
        pixelmapPaintBrush() {
            this.updateActionModifiers();
        },
        predictions() {
            const annotation = store.annotationsByImageId[store.currentImageId].predictions;
            if (store.predictions) {
                this.viewerWidget.drawAnnotation(annotation);
            } else {
                this.viewerWidget.removeAnnotation(annotation);
            }
        },
        superpixelsToDisplay() {
            this.updateMapBoundsForSelection();
        },
        selectedIndex() {
            this.updateMapBoundsForSelection();
        },
        page() {
            this.updateMapBoundsForSelection();
        },
        changeLog: {
            handler() {
                if (!store.changeLog.length) {
                    return;
                }
                const change = store.changeLog.pop();
                store.backboneParent.saveAnnotations([change.imageId]);
                this.drawPixelmapAnnotation();
            },
            deep: true
        },
        availableImages(newAvail, oldAvail) {
            const newImage = _.difference(newAvail, oldAvail)[0];
            if (newImage === store.currentImageId) {
                // Update image with annotations
                this.setupViewer();
            }
        },
        reviewSuperpixel(superpixel) {
            if (_.isNull(superpixel)) {
                return;
            }
            this.updateMapBoundsForSelection();
        }
    },
    mounted() {
        if (store.currentImageId) {
            this.setupViewer();
            this.createCategories();
        }
    },
    methods: {
        /***********************************
         * IMAGE VIEWER AND CATEGORY SETUP *
         ***********************************/
        clearPixelmapPaintValue() {
            this.pixelmapPaintValue = null;
        },
        setupViewer() {
            restRequest({
                url: `item/${store.currentImageId}/tiles`
            }).done((resp) => {
                // TODO: consider caching image metadata for each image the first time this request gets made
                this.currentImageMetadata = resp;
                this.drawBaseImageLayer();
            });
        },
        drawBaseImageLayer() {
            if (this.viewerWidget) {
                this.viewerWidget.destroy();
            }
            this.viewerWidget = new ViewerWidget.geojs({ // eslint-disable-line new-cap
                parentView: store.backboneParent,
                el: this.$refs.map,
                itemId: store.currentImageId
            });
            this.viewerWidget.setUnclampBoundsForOverlay(false);
            this.viewerWidget.on('g:imageRendered', () => {
                store.labelsOverlayLayer = null;
                store.predictionsOverlayLayer = null;

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

                if (store.mode === viewMode.Guided) {
                    this.updateMapBoundsForSelection();
                }
                this.drawPixelmapAnnotation();
            });
            this.viewerWidget.on('g:drawOverlayAnnotation', (element, layer) => {
                if (element.type === 'pixelmap') {
                    const elementCategories = _.pluck(element.categories, 'label');
                    const categories = _.pluck(store.categories, 'label');
                    if (_.isEqual(elementCategories, categories)) {
                        store.labelsOverlayLayer = layer;
                        this.superpixelElement = element;
                        this.onPixelmapRendered();
                    } else {
                        // Predictions do not include the default category so
                        // they will not have the same number of categories
                        // as the labels overlay layer
                        store.predictionsOverlayLayer = layer;
                    }
                }
            });
            this.viewerWidget.on('g:removeOverlayAnnotation', (element, layer) => {
                if (element.type === 'pixelmap') {
                    // Drop the reference to any overlays that have been removed
                    const overlays = ['labelsOverlayLayer', 'predictionsOverlayLayer'];
                    _.forEach(overlays, (overlay) => {
                        if (store[overlay].id() === layer.id()) {
                            store[overlay] = null;
                        }
                    });
                    updatePixelmapLayerStyle();
                }
            });
        },
        drawPixelmapAnnotation() {
            const superpixelAnnotation = store.annotationsByImageId[store.currentImageId].labels;
            if (!superpixelAnnotation) {
                return;
            }
            this.viewerWidget.drawAnnotation(superpixelAnnotation);
            if (store.predictions) {
                const predictionsAnnotation = store.annotationsByImageId[store.currentImageId].predictions;
                this.viewerWidget.drawAnnotation(predictionsAnnotation);
            }
        },
        onPixelmapRendered() {
            if (!this.hasLoaded) {
                this.createCategories();
                this.updateConfig();
                this.hasLoaded = true;
            }
            this.viewerWidget.on('g:mouseClickAnnotationOverlay', this.handlePixelmapClicked);
            this.viewerWidget.on('g:mouseOverAnnotationOverlay', this.handleMouseOverPixelmap);
            this.viewerWidget.on('g:mouseDownAnnotationOverlay', this.handleMouseDownPixelmap);
            this.viewerWidget.on('g:mouseUpAnnotationOverlay', this.clearPixelmapPaintValue);
            this.viewerWidget.viewer.interactor().removeAction(geo.geo_action.zoomselect);
            this.updateActionModifiers();
            this.$emit('synchronize');
        },
        updateMapBoundsForSelection() {
            if (!this.viewerWidget || !this.viewerWidget.viewer || !store.superpixelsToDisplay.length) {
                return;
            }
            let superpixel = store.superpixelsToDisplay[store.selectedIndex];
            if (store.mode === viewMode.Review) {
                superpixel = store.reviewSuperpixel;
            }
            if (store.currentImageId !== superpixel.imageId) {
                store.currentImageId = superpixel.imageId;
                return;
            }
            // Center the selected superpixel
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
            if (store.mode === viewMode.Review) {
                // Offset the center to fit in the visible image section
                const { height } = this.viewerWidget.viewer.bounds();
                const el = document.getElementById('resizable');
                const parent = document.getElementById('activeLearningContainer');
                const offset = Math.abs(0.5 - ((el.offsetTop / parent.clientHeight) / 2));
                center.y += offset * height;
                this.viewerWidget.viewer.center(center);
            }
            this.boundingBoxFeature.data([[
                [bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]
            ]]);
            this.featureLayer.draw();
        },
        /**
         * Parse existing label annotations to populate the categories used for labeling.
         */
        createCategories() {
            if (!store.categoriesAndIndices.length) {
                // If there are no pre-existing annotations build the initial list from the
                // categories defined in the config yaml, if it exists
                store.categoriesAndIndices = _.map(_.rest(store.categories), (category) => {
                    return { category, indices: new Set() };
                });
            }
            // TODO handle missing default, default in wrong position
            _.forEach(Object.entries(store.annotationsByImageId), ([imageId, annotations]) => {
                if (_.has(annotations, 'labels')) {
                    const pixelmapElement = annotations.labels.get('annotation').elements[0];
                    const existingCategories = _.map(store.categoriesAndIndices, (category) => category.category.label);
                    this.createCategoriesFromPixelmapElement(pixelmapElement, imageId, existingCategories);
                }
            });
            if (store.categoriesAndIndices.length === 0) {
                const fillColor = getFillColor(store.categoriesAndIndices.length);
                store.categoriesAndIndices.push({
                    category: {
                        label: 'New Category',
                        fillColor,
                        strokeColor: boundaryColor
                    },
                    indices: {}
                });
            }
            store.categoryIndex = 0;
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
                    if (!existingCategories.includes(category.label)) {
                        const indices = {};
                        indices[store.currentImageId] = labeledSuperpixels;
                        store.categoriesAndIndices.push({
                            category,
                            indices
                        });
                    } else if (labeledSuperpixels.size) {
                        const categoryToUpdateIndex = _.findIndex(store.categoriesAndIndices, (categoryAndIndices) => categoryAndIndices.category.label === category.label);
                        store.categoriesAndIndices[categoryToUpdateIndex].indices[imageId] = labeledSuperpixels;
                    }
                }
            });
        },
        /************************
         * PIXELMAP INTERACTION *
         ************************/
        /**
         * Ensure that the label annotation is drawn correctly by keeping the geojs layer
         * up to date with the most recent category list
         */
        handlePixelmapClicked(overlayElement, overlayLayer, event) {
            if (
                store.mode !== viewMode.Labeling || // We can only paint in labeling mode
                overlayElement.get('type') !== 'pixelmap' || // Not a pixelmap event
                !event.mouse.buttonsDown.left || // Not a left click
                !store.currentCategoryFormValid || // no valid category selected
                (store.pixelmapPaintBrush && event.mouse.modifiers.shift)
            ) {
                return;
            }
            this.updatePixelmapData(overlayElement, event);
        },
        handleMouseOverPixelmap(overlayElement, overlayLayer, event) {
            if (
                store.mode !== viewMode.Labeling || // We can only paint in labeling mode
                overlayElement.get('type') !== 'pixelmap' ||
                !event.mouse.buttons.left ||
                (!store.pixelmapPaintBrush && !event.mouse.modifiers.shift) ||
                !store.currentCategoryFormValid
            ) {
                return;
            }
            this.updatePixelmapData(overlayElement, event);
        },
        handleMouseDownPixelmap(overlayElement, overlayLayer, event) {
            if (
                store.mode !== viewMode.Labeling || // We can only paint in labeling mode
                overlayElement.get('type') !== 'pixelmap' ||
                !event.mouse.buttons.left ||
                (!store.pixelmapPaintBrush && !event.mouse.modifiers.shift) ||
                !store.currentCategoryFormValid
            ) {
                return;
            }
            // For shift + click painting, we can either start painting with the selected category,
            // or paint the default category
            if (this.pixelmapPaintValue === null) {
                this.pixelmapPaintValue = event.data === store.categoryIndex + 1 ? 0 : store.categoryIndex + 1;
            }
            this.updatePixelmapData(overlayElement, event);
        },
        updatePixelmapData(overlayElement, event) {
            const boundaries = overlayElement.get('boundaries');
            if (boundaries && event.index % 2 !== 0) {
                return;
            }
            const index = boundaries ? (event.index - event.index % 2) : event.index;
            const data = store.labelsOverlayLayer.data();
            let newLabel = 0;
            const previousLabel = data[index];
            // the +1 accounts for the default, reset to default if already labeled with the selected category
            if ((event.event === geo.event.feature.mouseover || event.event === geo.event.feature.mousedown)) {
                newLabel = this.pixelmapPaintValue;
            } else if (event.event === geo.event.feature.mouseclick) {
                newLabel = (previousLabel === store.categoryIndex + 1) ? 0 : store.categoryIndex + 1;
            }
            if (newLabel === previousLabel) {
                return;
            }
            const offset = boundaries ? 1 : 0;
            data[index] = data[index + offset] = newLabel;
            store.labelsOverlayLayer.indexModified(index, index + offset).draw();

            this.saveNewPixelmapData(boundaries, _.clone(data));
            this.updateRunningLabelCounts(boundaries, index, newLabel, previousLabel);
        },
        saveNewPixelmapData(boundaries, data) {
            const annotation = store.annotationsByImageId[store.currentImageId];
            const superpixelElement = annotation.labels.get('annotation').elements[0];
            if (boundaries) {
                data = _.filter(data, (d, i) => i % 2 === 0);
            }
            superpixelElement.values = data;
            this.$emit('save-annotations');
        },
        updateRunningLabelCounts(boundaries, index, newLabel, oldLabel) {
            const elementValueIndex = boundaries ? index / 2 : index;
            const currentCategoryIndices = store.categoriesAndIndices[store.categoryIndex].indices[store.currentImageId] || new Set();
            if (!currentCategoryIndices.size) {
                store.categoriesAndIndices[store.categoryIndex].indices[store.currentImageId] = currentCategoryIndices;
            }
            if (newLabel === 0) {
                store.categoriesAndIndices[oldLabel - 1].indices[store.currentImageId].delete(elementValueIndex);
                currentCategoryIndices.delete(elementValueIndex);
            } else if (oldLabel === 0) {
                currentCategoryIndices.add(elementValueIndex);
            } else {
                store.categoriesAndIndices[oldLabel - 1].indices[store.currentImageId].delete(elementValueIndex);
                currentCategoryIndices.add(elementValueIndex);
            }
            // Force computed properties to update
            store.categoriesAndIndices = [...store.categoriesAndIndices];
        },
        /***********
         * UTILITY *
         ***********/
        updateActionModifiers() {
            if (!this.viewerWidget || !this.viewerWidget.viewer) {
                return;
            }
            // Panning is typically by with left-click and continuous painting
            // by shift+left-click. When the paint brush is enabled swap these
            // interactions.
            const interactor = this.viewerWidget.viewer.interactor();
            const actions = interactor.options().actions;
            _.map(actions, (action) => {
                if (action.action === 'geo_action_pan') {
                    const state = store.pixelmapPaintBrush && store.mode === viewMode.Labeling;
                    action.modifiers.shift = state;
                }
            });
        },
        combineCategoriesHandler() {
            this.drawPixelmapAnnotation();
            this.$emit('save-annotations', true);
            this.updateConfig();
            store.backboneParent.getSortedSuperpixelIndices();
        },
        /**********************************
         * USE BACKBONE CONTAINER METHODS *
         **********************************/
        updateConfig() {
            store.backboneParent.updateHistomicsYamlConfig();
        }
    }
});
</script>

<template>
  <div>
    <!-- Slide Image -->
    <div
      ref="map"
      class="h-setup-categories-map"
    />
  </div>
</template>

<style scoped>
.h-setup-categories-map {
    min-height: 100vh;
    border: 1px solid #f0f0f0;
}
</style>
