<script>
/* global geo */ // eslint-disable-line no-unused-vars
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';

import { comboHotkeys, boundaryColor } from '../constants.js';
import { store, updatePixelmapLayerStyle } from '../store.js';
import { getFillColor } from '../utils.js';

export default Vue.extend({
    data() {
        return {
            hasLoaded: false,

            // keep track of the current image and annotation to edit
            superpixelAnnotation: null,
            superpixelElement: null,

            // data to track the viewer widget/map/layers if needed
            viewerWidget: null,
            pixelmapPaintValue: null
        };
    },
    computed: {
        pixelmapPaintBrush() {
            return store.pixelmapPaintBrush;
        },
        currentImageId() {
            return store.currentImageId;
        },
        overlayLayer() {
            return store.overlayLayers[0];
        },
        categoryIndex() {
            return store.categoryIndex;
        }
    },
    watch: {
        categoryIndex(index) {
            if (index < 0 || index >= store.categoriesAndIndices.length) {
                store.categoryIndex = 0;
            }
        },
        currentImageId() {
            this.superpixelAnnotation = store.annotationsByImageId[store.currentImageId].labels;
            this.setupViewer();
        },
        pixelmapPaintBrush() {
            this.updateActionModifiers();
        }
    },
    mounted() {
        window.addEventListener('keydown', this.keydownListener);
        store.overlayLayers = [];
        if (store.currentImageId) {
            this.superpixelAnnotation = store.annotationsByImageId[store.currentImageId].labels;
            this.setupViewer();
            this.createCategories();
        }
    },
    destroyed() {
        window.removeEventListener('keydown', this.keydownListener);
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
            }).done(() => {
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
            this.viewerWidget.on('g:imageRendered', this.drawPixelmapAnnotation);
            this.viewerWidget.on('g:drawOverlayAnnotation', (element, layer) => {
                if (element.type === 'pixelmap') {
                    store.overlayLayers = [layer];
                    this.superpixelElement = element;
                    this.onPixelmapRendered();
                }
            });
        },
        drawPixelmapAnnotation() {
            if (!this.superpixelAnnotation) {
                return;
            }
            this.viewerWidget.drawAnnotation(this.superpixelAnnotation);
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
            this.synchronizeCategories();
        },
        parseUserHotkeys(event) {
            // Combine the list of selected keys
            const pressed = _.filter(comboHotkeys, (key) => event[`${key}Key`]);
            if (!(event.key in pressed)) pressed.push(event.key);
            return pressed;
        },
        keydownListener(event) {
            if (event.target.type === 'text') {
                // User is typing, not using a hot key selector
                return;
            }

            const userHotkeys = this.parseUserHotkeys(event);
            const idx = store.hotkeys.get(userHotkeys.join('+'));
            if (!_.isUndefined(idx)) {
                event.preventDefault();
                store.categoryIndex = idx - 1;
            }
        },
        /**
         * Parse existing label annotations to populate the categories used for labeling.
         */
        createCategories() {
            const cats = _.chain([...this.categoryMap.values()])
                .filter((cat) => cat.label !== 'default')
                .map((category) => { return { category, indices: {} }; })
                .value();
            this.categories = _.uniq([...cats, ...this.categories], (cat) => cat.category.label);
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
            const data = this.overlayLayer.data();
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
            this.overlayLayer.indexModified(index, index + offset).draw();

            this.saveNewPixelmapData(boundaries, _.clone(data));
            this.updateRunningLabelCounts(boundaries, index, newLabel, previousLabel);
        },
        saveNewPixelmapData(boundaries, data) {
            const annotation = this.superpixelAnnotation.get('annotation');
            const superpixelElement = annotation.elements[0];
            if (boundaries) {
                data = _.filter(data, (d, i) => i % 2 === 0);
            }
            superpixelElement.values = data;
            this.saveAnnotations();
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
        synchronizeCategories() {
            if (store.currentCategoryFormValid) {
                _.forEach(Object.values(store.annotationsByImageId), (annotations) => {
                    if (_.has(annotations, 'labels')) {
                        const superpixelElement = annotations.labels.get('annotation').elements[0];
                        if (superpixelElement) {
                            superpixelElement.categories = JSON.parse(JSON.stringify(store.categories));
                        }
                    }
                });
                this.saveAnnotations(true);
                updatePixelmapLayerStyle();
                this.updateConfig();
            }
        },
        updateActionModifiers() {
            // Panning is typically by with left-click and continuous painting
            // by shift+left-click. When the paint brush is enabled swap these
            // interactions.
            const interactor = this.viewerWidget.viewer.interactor();
            const actions = interactor.options().actions;
            _.map(actions, (action) => {
                if (action.action === 'geo_action_pan') {
                    action.modifiers.shift = store.pixelmapPaintBrush;
                }
            });
        },
        combineCategoriesHandler() {
            this.drawPixelmapAnnotation();
            this.saveAnnotations(true);
            this.updateConfig();
        },
        /**********************************
         * USE BACKBONE CONTAINER METHODS *
         **********************************/
        saveAnnotations(saveAll) {
            const idsToSave = saveAll ? Object.keys(store.annotationsByImageId) : [store.currentImageId];
            store.backboneParent.saveLabelAnnotations(idsToSave);
        },
        updateConfig: _.debounce(function () {
            store.backboneParent.updateHistomicsYamlConfig(store.categories);
        }, 500)
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
