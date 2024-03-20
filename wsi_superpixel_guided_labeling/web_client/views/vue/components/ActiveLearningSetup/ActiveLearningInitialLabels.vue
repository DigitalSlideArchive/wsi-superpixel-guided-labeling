<script>
/* global geo */ // eslint-disable-line no-unused-vars
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';

import ActiveLearningLabeling from './ActiveLearningLabeling.vue';
import AnnotationOpacityControl from '../AnnotationOpacityControl.vue';
import MouseAndKeyboardControls from '../MouseAndKeyboardControls.vue';
import { comboHotkeys, boundaryColor } from '../constants.js';
import { store, updatePixelmapLayerStyle, getFillColor } from '../store.js';

// Define some helpful constants for adding categories
const defaultCategory = {
    label: 'default',
    fillColor: 'rgba(0, 0, 0, 0)',
    strokeColor: 'rgba(0, 0, 0, 1)'
};

export default Vue.extend({
    components: {
        MouseAndKeyboardControls,
        AnnotationOpacityControl,
        ActiveLearningLabeling
    },
    props: ['backboneParent', 'imageNamesById', 'annotationsByImageId', 'availableImages', 'categoryMap'],
    data() {
        return {
            hasLoaded: false,

            // data tracking current categories/currently active category
            categoryIndex: 0,

            // keep track of the current image and annotation to edit
            superpixelAnnotation: null,
            superpixelElement: null,

            // data to track the viewer widget/map/layers if needed
            viewerWidget: null,
            overlayLayer: null,
            pixelmapRendered: false,
            pixelmapPaintValue: null
        };
    },
    computed: {
        categoriesAndIndices() {
            return store.categoriesAndIndices;
        },
        currentFormErrors() {
            const errors = [];
            const categoryNames = _.map(this.categoriesAndIndices, (category) => category.category.label);
            const differentCategoryNames = new Set(categoryNames);
            if (categoryNames.length !== differentCategoryNames.size) {
                errors.push('All categories must have unique names.');
            }
            return errors;
        },
        currentCategoryFormValid() {
            return this.currentFormErrors.length === 0;
        },
        usingBoundaries() {
            return this.superpixelElement.boundaries;
        },
        allNewCategories() {
            const activeLearningCategories = _.map(this.categoriesAndIndices, (category) => category.category);
            return [defaultCategory, ...activeLearningCategories];
        },
        labeledSuperpixelCounts() {
            const counts = {};
            _.forEach(this.categoriesAndIndices, (categoryAndIndices, index) => {
                const label = categoryAndIndices.category.label;
                const fillColor = categoryAndIndices.category.fillColor;
                const key = `${index}_${label}`;
                counts[key] = {
                    count: 0,
                    label,
                    fillColor
                };
                if (label !== 'default') {
                    const indicesByImage = categoryAndIndices.indices;
                    _.forEach(Object.values(indicesByImage), (indicesSet) => {
                        counts[key].count += indicesSet.size;
                    });
                }
            });
            return counts;
        },
        hotkeys() {
            return store.hotkeys;
        },
        pixelmapPaintBrush() {
            return store.pixelmapPaintBrush;
        },
        currentImageId() {
            return store.currentImageId;
        }
    },
    watch: {
        categoryIndex(index) {
            if (index < 0 || index >= this.categoriesAndIndices.length) {
                this.categoryIndex = 0;
            }
        },
        currentImageId() {
            this.superpixelAnnotation = this.annotationsByImageId[this.currentImageId].labels;
            this.setupViewer();
        },
        pixelmapPaintBrush() {
            this.updateActionModifiers();
        }
    },
    mounted() {
        window.addEventListener('keydown', this.keydownListener);
        store.currentImageId = Object.keys(this.imageNamesById)[0];
        this.superpixelAnnotation = this.annotationsByImageId[store.currentImageId].labels;
        store.annotationsByImageId = this.annotationsByImageId;
        store.backboneParent = this.backboneParent;
        this.setupViewer();
        this.createCategories();
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
                url: `item/${this.currentImageId}/tiles`
            }).done(() => {
                this.drawBaseImageLayer();
            });
        },
        drawBaseImageLayer() {
            if (this.viewerWidget) {
                this.viewerWidget.destroy();
            }
            this.viewerWidget = new ViewerWidget.geojs({ // eslint-disable-line new-cap
                parentView: this.backboneParent,
                el: this.$refs.map,
                itemId: this.currentImageId
            });
            this.viewerWidget.setUnclampBoundsForOverlay(false);
            this.viewerWidget.on('g:imageRendered', this.drawPixelmapAnnotation);
            this.viewerWidget.on('g:drawOverlayAnnotation', (element, layer) => {
                if (element.type === 'pixelmap') {
                    this.overlayLayer = layer;
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
            this.pixelmapRendered = true;
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
            const idx = this.hotkeys.get(userHotkeys.join('+'));
            if (!_.isUndefined(idx)) {
                event.preventDefault();
                this.categoryIndex = idx - 1;
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
            _.forEach(Object.entries(this.annotationsByImageId), ([imageId, annotations]) => {
                if (_.has(annotations, 'labels')) {
                    const pixelmapElement = annotations.labels.get('annotation').elements[0];
                    const existingCategories = _.map(this.categoriesAndIndices, (category) => category.category.label);
                    this.createCategoriesFromPixelmapElement(pixelmapElement, imageId, existingCategories);
                }
            });
            if (this.categoriesAndIndices.length === 0) {
                const fillColor = getFillColor(this.categoriesAndIndices.length);
                store.categoriesAndIndices.push({
                    category: {
                        label: 'New Category',
                        fillColor,
                        strokeColor: boundaryColor
                    },
                    indices: {}
                });
            }
            this.categoryIndex = 0;
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
                        indices[this.currentImageId] = labeledSuperpixels;
                        store.categoriesAndIndices.push({
                            category,
                            indices
                        });
                    } else if (labeledSuperpixels.size) {
                        const categoryToUpdateIndex = _.findIndex(this.categoriesAndIndices, (categoryAndIndices) => categoryAndIndices.category.label === category.label);
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
                !this.currentCategoryFormValid || // no valid category selected
                (this.pixelmapPaintBrush && event.mouse.modifiers.shift)
            ) {
                return;
            }
            this.updatePixelmapData(overlayElement, event);
        },
        handleMouseOverPixelmap(overlayElement, overlayLayer, event) {
            if (
                overlayElement.get('type') !== 'pixelmap' ||
                !event.mouse.buttons.left ||
                (!this.pixelmapPaintBrush && !event.mouse.modifiers.shift) ||
                !this.currentCategoryFormValid
            ) {
                return;
            }
            this.updatePixelmapData(overlayElement, event);
        },
        handleMouseDownPixelmap(overlayElement, overlayLayer, event) {
            if (
                overlayElement.get('type') !== 'pixelmap' ||
                !event.mouse.buttons.left ||
                (!this.pixelmapPaintBrush && !event.mouse.modifiers.shift) ||
                !this.currentCategoryFormValid
            ) {
                return;
            }
            // For shift + click painting, we can either start painting with the selected category,
            // or paint the default category
            if (this.pixelmapPaintValue === null) {
                this.pixelmapPaintValue = event.data === this.categoryIndex + 1 ? 0 : this.categoryIndex + 1;
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
                newLabel = (previousLabel === this.categoryIndex + 1) ? 0 : this.categoryIndex + 1;
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
            const currentCategoryIndices = this.categoriesAndIndices[this.categoryIndex].indices[this.currentImageId] || new Set();
            if (!currentCategoryIndices.size) {
                store.categoriesAndIndices[this.categoryIndex].indices[this.currentImageId] = currentCategoryIndices;
            }
            if (newLabel === 0) {
                store.categoriesAndIndices[oldLabel - 1].indices[this.currentImageId].delete(elementValueIndex);
                currentCategoryIndices.delete(elementValueIndex);
            } else if (oldLabel === 0) {
                currentCategoryIndices.add(elementValueIndex);
            } else {
                store.categoriesAndIndices[oldLabel - 1].indices[this.currentImageId].delete(elementValueIndex);
                currentCategoryIndices.add(elementValueIndex);
            }
            // Force computed properties to update
            store.categoriesAndIndices = [...this.categoriesAndIndices];
        },
        /***********
         * UTILITY *
         ***********/
        synchronizeCategories() {
            if (this.currentCategoryFormValid) {
                store.categories = this.allNewCategories;
                _.forEach(Object.values(this.annotationsByImageId), (annotations) => {
                    if (_.has(annotations, 'labels')) {
                        const superpixelElement = annotations.labels.get('annotation').elements[0];
                        if (superpixelElement) {
                            superpixelElement.categories = JSON.parse(JSON.stringify(this.allNewCategories));
                        }
                    }
                });
                this.saveAnnotations(true);
                if (this.overlayLayer) {
                    updatePixelmapLayerStyle([this.overlayLayer]);
                }
                this.updateConfig();
            }
        },
        enforceUniqueName(name) {
            const existingNames = _.map(this.categoriesAndIndices, (category) => category.category.label);
            let count = 1;
            let uniqueName = name;
            while (_.some(existingNames, (en) => en.includes(uniqueName)) && count < 50) {
                uniqueName = `${name} (${count++})`;
            }
            return uniqueName;
        },
        updateActionModifiers() {
            // Panning is typically by with left-click and continuous painting
            // by shift+left-click. When the paint brush is enabled swap these
            // interactions.
            const interactor = this.viewerWidget.viewer.interactor();
            const actions = interactor.options().actions;
            _.map(actions, (action) => {
                if (action.action === 'geo_action_pan') {
                    action.modifiers.shift = this.pixelmapPaintBrush;
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
        beginTraining() {
            this.backboneParent.retrain(true);
        },
        saveAnnotations(saveAll) {
            const idsToSave = saveAll ? Object.keys(this.annotationsByImageId) : [this.currentImageId];
            this.backboneParent.saveLabelAnnotations(idsToSave);
        },
        updateConfig: _.debounce(function () {
            this.backboneParent.updateHistomicsYamlConfig(store.categories);
        }, 500)
    }
});
</script>

<template>
  <div>
    <!-- Labeling Dialog -->
    <active-learning-labeling
      :image-names-by-id="imageNamesById"
      :labeled-superpixel-counts="labeledSuperpixelCounts"
      :current-form-errors="currentFormErrors"
      :category-index="categoryIndex"
      :pixelmap-rendered="pixelmapRendered"
      :available-images="availableImages"
      @combine-categories="combineCategoriesHandler"
      @update="synchronizeCategories"
    />
    <!-- Slide Image -->
    <div
      ref="map"
      class="h-setup-categories-map"
    />
    <!-- Opacity Slider -->
    <annotation-opacity-control
      :style="{'width': '350px', 'right': '20px'}"
      :category-index="categoryIndex"
      :overlay-layers="[overlayLayer]"
      :disabled="!overlayLayer"
    />
    <!-- Information Panel -->
    <mouse-and-keyboard-controls
      :pixelmap-paint-brush="pixelmapPaintBrush"
    />
  </div>
</template>

<style scoped>
.h-setup-categories-map {
    min-height: 100vh;
    border: 1px solid #f0f0f0;
}
</style>
