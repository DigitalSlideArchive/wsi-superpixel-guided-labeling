<script>
/* global geo */ // eslint-disable-line no-unused-vars
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';
import ColorPickerInput from '@girder/histomicsui/vue/components/ColorPickerInput.vue';

import AnnotationOpacityControl from '../AnnotationOpacityControl.vue';
import MouseAndKeyboardControls from '../MouseAndKeyboardControls.vue';

// Define some helpful constants for adding categories
const boundaryColor = 'rgba(0, 0, 0, 1)';
const defaultNewCategoryColor = 'rgba(255, 0, 0, 0.5)';
const defaultCategory = {
    label: 'default',
    fillColor: 'rgba(0, 0, 0, 0)',
    strokeColor: 'rgba(0, 0, 0, 1)'
};
const colorPattern = /^(#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgb\(\d+,\s*\d+,\s*\d+\)|rgba\(\d+,\s*\d+,\s*\d+,\s*(\d?\.|)\d+\))$/;

export default Vue.extend({
    components: {
        ColorPickerInput,
        MouseAndKeyboardControls,
        AnnotationOpacityControl
    },
    props: ['backboneParent', 'imageNamesById', 'annotationsByImageId'],
    data() {
        return {
            hasLoaded: false,

            // data tracking current categories/currently active category
            categories: [],
            categoryIndex: 0,
            currentCategoryLabel: 'New Category',
            currentCategoryFillColor: defaultNewCategoryColor,

            // keep track of the current image and annotation to edit
            currentImageId: '',
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
        currentFormErrors() {
            const errors = [];
            const inactiveCategories = _.filter(this.categories, (category, idx) => idx !== this.categoryIndex);
            const otherCategoryNames = _.map(inactiveCategories, (category) => category.category.label);
            if (otherCategoryNames.includes(this.currentCategoryLabel)) {
                errors.push('A category with this label already exists');
            }
            return errors;
        },
        currentCategoryFormValid() {
            return this.currentFormErrors.length === 0;
        },
        currentLabelingErrors() {
            const errors = [];
            const counts = _.map(Object.keys(this.labeledSuperpixelCounts), (entry) => this.labeledSuperpixelCounts[entry].count);
            if (_.filter(counts, (count) => count > 0).length < 2) {
                errors.push('You must label superpixels for at least two different categories');
            }
            return errors;
        },
        currentLabelsValid() {
            return this.currentLabelingErrors.length === 0;
        },
        usingBoundaries() {
            return this.superpixelElement.boundaries;
        },
        allNewCategories() {
            const activeLearningCategories = _.map(this.categories, (category) => category.category);
            return [defaultCategory, ...activeLearningCategories];
        },
        labeledSuperpixelCounts() {
            const counts = {};
            _.forEach(this.categories, (categoryAndIndices, index) => {
                const label = categoryAndIndices.category.label;
                const key = `${index}_${label}`;
                counts[key] = {
                    count: 0,
                    label
                };
                if (label !== 'default') {
                    const indicesByImage = categoryAndIndices.indices;
                    _.forEach(Object.values(indicesByImage), (indicesSet) => {
                        counts[key].count += indicesSet.size;
                    });
                }
            });
            return counts;
        }
    },
    watch: {
        currentCategoryLabel(newLabel, oldLabel) {
            if (newLabel === oldLabel) {
                return;
            }
            this.categories[this.categoryIndex].category.label = this.currentCategoryLabel;
            this.synchronizeCategories();
        },
        currentCategoryFillColor(newColor, oldColor) {
            if (newColor === oldColor || !colorPattern.test(newColor)) {
                return;
            }
            this.categories[this.categoryIndex].category.fillColor = this.currentCategoryFillColor;
            this.synchronizeCategories();
        },
        categoryIndex() {
            this.currentCategoryLabel = this.categories[this.categoryIndex].category.label;
            this.currentCategoryFillColor = this.categories[this.categoryIndex].category.fillColor;
        },
        currentImageId() {
            this.superpixelAnnotation = this.annotationsByImageId[this.currentImageId].labels;
            this.setupViewer();
        }
    },
    mounted() {
        this.currentImageId = Object.keys(this.imageNamesById)[0];
        this.superpixelAnnotation = this.annotationsByImageId[this.currentImageId].labels;
        this.setupViewer();
    },
    methods: {
        /***********************************
         * IMAGE VIEWER AND CATEGORY SETUP *
         ***********************************/
        clearPixelmapPaintValue() {
            this.pixelmapPaintValue = null;
        },
        setupViewer() {
            if (!this.superpixelAnnotation) {
                return;
            }
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
            this.viewerWidget.drawAnnotation(this.superpixelAnnotation);
        },
        onPixelmapRendered() {
            this.pixelmapRendered = true;
            if (!this.hasLoaded) {
                this.createCategories();
                this.hasLoaded = true;
            }
            this.viewerWidget.on('g:mouseClickAnnotationOverlay', this.handlePixelmapClicked);
            this.viewerWidget.on('g:mouseOverAnnotationOverlay', this.handleMouseOverPixelmap);
            this.viewerWidget.on('g:mouseDownAnnotationOverlay', this.handleMouseDownPixelmap);
            this.viewerWidget.on('g:mouseUpAnnotationOverlay', this.clearPixelmapPaintValue);
            this.viewerWidget.viewer.interactor().removeAction(geo.geo_action.zoomselect);
            this.synchronizeCategories();
        },
        /**
         * Parse existing label annotations to populate the categories used for labeling.
         */
        createCategories() {
            // TODO handle missing default, default in wrong position
            _.forEach(Object.entries(this.annotationsByImageId), ([imageId, annotations]) => {
                const pixelmapElement = annotations.labels.get('annotation').elements[0];
                const existingCategories = _.map(this.categories, (category) => category.category.label);
                this.createCategoriesFromPixelmapElement(pixelmapElement, imageId, existingCategories);
            });
            if (this.categories.length === 0) {
                this.categories.push({
                    category: {
                        label: 'New Category',
                        fillColor: defaultNewCategoryColor,
                        strokeColor: boundaryColor
                    },
                    indices: {}
                });
            }
            this.categoryIndex = 0;
            this.currentCategoryLabel = this.categories[0].category.label;
            this.currentCategoryFillColor = this.categories[0].category.fillColor;
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
                        this.categories.push({
                            category,
                            indices
                        });
                    } else if (labeledSuperpixels.length) {
                        const categoryToUpdateIndex = _.findIndex(this.categories, (categoryAndIndices) => categoryAndIndices.category.label === category.label);
                        this.categories[categoryToUpdateIndex].indices[imageId] = labeledSuperpixels;
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
        updatePixelmapLayerStyle() {
            const categoryMap = this.allNewCategories;
            const boundaries = this.usingBoundaries;
            _.forEach(this.overlayLayer.features(), (feature) => {
                feature.style('color', (d, i) => {
                    if (d < 0 || d >= categoryMap.length) {
                        console.warn(`No category found at index ${d} in the category map.`);
                        return 'rgba(0, 0, 0, 0)';
                    }
                    const category = categoryMap[d];
                    if (boundaries) {
                        return (i % 2 === 0) ? category.fillColor : category.strokeColor;
                    }
                    return category.fillColor;
                });
            });
            this.overlayLayer.draw();
        },
        handlePixelmapClicked(overlayElement, overlayLayer, event) {
            if (
                overlayElement.get('type') !== 'pixelmap' || // Not a pixelmap event
                !event.mouse.buttonsDown.left || // Not a left click
                !this.currentCategoryFormValid // no valid category selected
            ) {
                return;
            }
            this.updatePixelmapData(overlayElement, event);
        },
        handleMouseOverPixelmap(overlayElement, overlayLayer, event) {
            if (
                overlayElement.get('type') !== 'pixelmap' ||
                !event.mouse.buttons.left ||
                !event.mouse.modifiers.shift ||
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
                !event.mouse.modifiers.shift ||
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
            if (event.event === geo.event.feature.mouseover || event.event === geo.event.feature.mousedown) {
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
            const currentCategoryIndices = this.categories[this.categoryIndex].indices[this.currentImageId] || new Set();
            if (!currentCategoryIndices.size) {
                this.categories[this.categoryIndex].indices[this.currentImageId] = currentCategoryIndices;
            }
            if (newLabel === 0) {
                currentCategoryIndices.delete(elementValueIndex);
            } else if (oldLabel === 0) {
                currentCategoryIndices.add(elementValueIndex);
            } else {
                this.categories[oldLabel - 1].indices[this.currentImageId].delete(elementValueIndex);
                currentCategoryIndices.add(elementValueIndex);
            }
            // Force computed properties to update
            const newCategoryData = Object.assign({}, this.categories[this.categoryIndex]);
            this.categories.splice(this.categoryIndex, 1, newCategoryData);
        },
        /*************************
         * RESPOND TO USER INPUT *
         *************************/
        nextCategory() {
            this.categoryIndex += 1;
        },
        previousCategory() {
            this.categoryIndex -= 1;
        },
        addCategory() {
            this.categories.push({
                category: {
                    label: 'New Category',
                    fillColor: defaultNewCategoryColor,
                    strokeColor: boundaryColor
                },
                indices: {}
            });
            this.categoryIndex = this.categories.length - 1;
        },
        /***********
         * UTILITY *
         ***********/
        synchronizeCategories() {
            if (this.currentCategoryFormValid) {
                _.forEach(Object.values(this.annotationsByImageId), (annotations) => {
                    const superpixelElement = annotations.labels.get('annotation').elements[0];
                    if (superpixelElement) {
                        superpixelElement.categories = JSON.parse(JSON.stringify(this.allNewCategories));
                    }
                });
                this.saveAnnotations(true);
                this.updatePixelmapLayerStyle();
            }
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
        }
    }
});
</script>

<template>
  <div class="h-al-setup-categories">
    <div
      class="h-setup-categories-body"
    >
      <div
        v-if="pixelmapRendered"
        class="h-add-new-category"
      >
        <div class="h-category-form">
          <div class="h-form-controls">
            <div class="form-group">
              <label for="category-label">Label</label>
              <input
                id="category-label"
                v-model="currentCategoryLabel"
                class="form-control input-sm h-active-learning-input"
              >
            </div>
            <div class="form-group">
              <label for="fill-color">Fill Color</label>
              <color-picker-input
                :key="categoryIndex"
                v-model="currentCategoryFillColor"
                class="h-active-learning-input"
                :color="currentCategoryFillColor"
              />
            </div>
          </div>
          <div class="h-error-messages">
            <p
              v-if="!currentCategoryFormValid || !currentLabelsValid"
              class="form-validation-error"
            >
              Please fix all errors to continue
            </p>
            <ul v-if="currentFormErrors.length > 0">
              <li
                v-for="error in currentFormErrors"
                :key="error"
                class="form-validation-error"
              >
                {{ error }}
              </li>
            </ul>
            <ul v-if="currentLabelingErrors.length > 0">
              <li
                v-for="error in currentLabelingErrors"
                :key="error"
                class="form-validation-error"
              >
                {{ error }}
              </li>
            </ul>
          </div>
        </div>
        <button
          class="btn btn-primary h-previous-category-btn"
          :disabled="categoryIndex === 0 || !currentCategoryFormValid"
          @click="previousCategory"
        >
          Previous
        </button>
        <button
          class="btn btn-primary h-next-category-btn"
          :disabled="categoryIndex >= categories.length - 1 || !currentCategoryFormValid"
          @click="nextCategory"
        >
          Next
        </button>
        <button
          class="btn btn-primary h-add-category-btn"
          :disabled="!currentCategoryFormValid"
          @click="addCategory"
        >
          Add Category
        </button>
        <button
          class="btn btn-primary h-start-training-btn"
          :disabled="!currentCategoryFormValid || !currentLabelsValid"
          @click="beginTraining"
        >
          Begin training
        </button>
        <div class="h-al-image-selector">
          <span>Image: </span>
          <select
            v-model="currentImageId"
            class="h-al-image-select"
          >
            <option
              v-for="imageId in Object.keys(imageNamesById)"
              :key="imageId"
              :value="imageId"
            >
              {{ imageNamesById[imageId] }}
            </option>
          </select>
          <annotation-opacity-control
            :active-learning-setup="true"
            :categories="allNewCategories"
            :update="synchronizeCategories"
          />
        </div>
      </div>
      <div
        ref="map"
        class="h-setup-categories-map"
      />
    </div>
    <div class="h-setup-categories-information">
      <mouse-and-keyboard-controls :active-learning-setup="true" />
      <div class="h-category-setup-progress">
        <div
          v-for="(key, index) in Object.keys(labeledSuperpixelCounts)"
          :key="index"
        >
          {{ labeledSuperpixelCounts[key].label }}: {{ labeledSuperpixelCounts[key].count }} superpixels labeled
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.h-al-setup-categories {
    width: 100%;
    height: 100%;
    position: absolute;
    display: flex;
}
.h-setup-categories-information {
    width: 33%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.h-setup-categories-body {
    width: 67%;
}

.h-setup-categories-map {
    height: 600px;
    border: 1px solid #f0f0f0;
}
.h-al-image-selector {
    display: flex;
    padding-top: 8px;
}
.h-form-controls {
  width: 550px;
}
.h-active-learning-input {
    width: 90%;
}
.h-category-form {
  display: flex;
}
.h-error-messages {
  padding-top: 25px;
}
.form-validation-error {
    color: red;
}
</style>
