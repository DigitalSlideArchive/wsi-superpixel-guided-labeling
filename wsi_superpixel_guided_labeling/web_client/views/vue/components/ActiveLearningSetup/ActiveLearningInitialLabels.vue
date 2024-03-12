<script>
/* global geo */ // eslint-disable-line no-unused-vars
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';
import ColorPickerInput from '@girder/histomicsui/vue/components/ColorPickerInput.vue';
import { confirm } from '@girder/core/dialog';

import ActiveLearningMergeConfirmation from './ActiveLearningMergeConfirmation.vue';
import AnnotationOpacityControl from '../AnnotationOpacityControl.vue';
import MouseAndKeyboardControls from '../MouseAndKeyboardControls.vue';
import { comboHotkeys, schemeTableau10 } from '../ActiveLearning/constants.js';
import { store, updatePixelmapLayerStyle } from '../store.js';

// Define some helpful constants for adding categories
const boundaryColor = 'rgba(0, 0, 0, 1)';
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
        AnnotationOpacityControl,
        ActiveLearningMergeConfirmation
    },
    props: ['backboneParent', 'imageNamesById', 'annotationsByImageId'],
    data() {
        return {
            hasLoaded: false,
            showLabelingContainer: true,
            showInfoContainer: true,
            editing: -1,

            // data tracking current categories/currently active category
            categories: [],
            categoryIndex: 0,
            currentCategoryLabel: 'New Category',
            currentCategoryFillColor: this.getFillColor(0),
            checkedCategories: [],

            // keep track of the current image and annotation to edit
            currentImageId: '',
            superpixelAnnotation: null,
            superpixelElement: null,

            // data to track the viewer widget/map/layers if needed
            viewerWidget: null,
            overlayLayer: null,
            pixelmapRendered: false,
            pixelmapPaintValue: null,
            pixelmapPaintBrush: false
        };
    },
    computed: {
        currentFormErrors() {
            const errors = [];
            const categoryNames = _.map(this.categories, (category) => category.category.label);
            const differentCategoryNames = new Set(categoryNames);
            if (categoryNames.length !== differentCategoryNames.size) {
                errors.push('All categories must have unique names.');
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
                errors.push('You must label superpixels for at least two different categories.');
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
        selectedLabels() {
            return new Map(_.map(this.checkedCategories, (i) => {
                const label = this.categories[i].category.label;
                return [i, this.labeledSuperpixelCounts[`${i}_${label}`]];
            }));
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
        categoryIndex(index) {
            if (index < 0 || index >= this.categories.length) {
                this.categoryIndex = 0;
                return;
            }
            this.currentCategoryLabel = this.categories[this.categoryIndex].category.label;
            this.currentCategoryFillColor = this.categories[this.categoryIndex].category.fillColor;
        },
        currentImageId() {
            this.superpixelAnnotation = this.annotationsByImageId[this.currentImageId].labels;
            this.setupViewer();
        },
        pixelmapPaintBrush() {
            this.updateActionModifiers();
        },
        editing() {
            if (this.editing === -1) {
                return;
            }
            const key = `label_${this.editing}`;
            console.log('editing: ', key, this.$refs, this.$refs[key]);
            this.$nextTick(() => this.$refs[key][0].focus());
        }
    },
    mounted() {
        window.addEventListener('keydown', this.keydownListener);
        this.currentImageId = _.filter(Object.keys(this.annotationsByImageId),
            (imageId) => _.has(this.annotationsByImageId[imageId], 'labels'))[0];
        this.superpixelAnnotation = this.annotationsByImageId[this.currentImageId].labels;
        store.annotationsByImageId = this.annotationsByImageId;
        store.backboneParent = this.backboneParent;
        this.setupViewer();
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
            // TODO handle missing default, default in wrong position
            _.forEach(Object.entries(this.annotationsByImageId), ([imageId, annotations]) => {
                if (_.has(annotations, 'labels')) {
                    const pixelmapElement = annotations.labels.get('annotation').elements[0];
                    const existingCategories = _.map(this.categories, (category) => category.category.label);
                    this.createCategoriesFromPixelmapElement(pixelmapElement, imageId, existingCategories);
                }
            });
            if (this.categories.length === 0) {
                const fillColor = this.getFillColor(this.categories.length);
                this.categories.push({
                    category: {
                        label: 'New Category',
                        fillColor,
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
                    } else if (labeledSuperpixels.size) {
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
            const currentCategoryIndices = this.categories[this.categoryIndex].indices[this.currentImageId] || new Set();
            if (!currentCategoryIndices.size) {
                this.categories[this.categoryIndex].indices[this.currentImageId] = currentCategoryIndices;
            }
            if (newLabel === 0) {
                this.categories[oldLabel - 1].indices[this.currentImageId].delete(elementValueIndex);
                currentCategoryIndices.delete(elementValueIndex);
            } else if (oldLabel === 0) {
                currentCategoryIndices.add(elementValueIndex);
            } else {
                this.categories[oldLabel - 1].indices[this.currentImageId].delete(elementValueIndex);
                currentCategoryIndices.add(elementValueIndex);
            }
            // Force computed properties to update
            this.categories = [...this.categories];
        },
        /*************************
         * RESPOND TO USER INPUT *
         *************************/
        addCategory(newName, newFillColor) {
            if (_.isUndefined(newName)) {
                newName = 'New Category';
            }
            if (_.isUndefined(newFillColor)) {
                newFillColor = this.getFillColor(this.categories.length);
            }

            this.categories.push({
                category: {
                    label: this.enforceUniqueName(newName),
                    fillColor: newFillColor,
                    strokeColor: boundaryColor
                },
                indices: {}
            });
            this.categoryIndex = this.categories.length - 1;
        },
        combineCategories(indices, isMerge) {
            // Remove the selected categories
            indices = _.sortBy(indices, (i) => i).reverse();
            const oldCategories = _.map(indices, (index) => {
                return this.categories.splice(index, 1)[0];
            });

            _.forEach(Object.keys(this.annotationsByImageId), (imageId) => {
                const labels = this.annotationsByImageId[imageId].labels;
                const pixelmapElement = labels.get('annotation').elements[0];
                pixelmapElement.categories = [...this.allNewCategories];

                // Reset removed category labels to the default category
                _.forEach(oldCategories, (category, val) => {
                    const indices = category.indices[imageId] || new Set();
                    _.forEach([...indices], (index) => {
                        pixelmapElement.values[index] = 0;
                    });
                    if (isMerge) {
                        // All merged indices should be assigned to the new combined category
                        const newIndices = _.last(this.categories).indices[imageId] || new Set();
                        _.last(this.categories).indices[imageId] = new Set([...newIndices, ...indices]);
                    }
                });

                // Indices have shifted after removing the selected categories
                _.forEach(this.categories, (category, val) => {
                    const indices = category.indices[imageId] || new Set();
                    _.forEach([...indices], (index) => {
                        pixelmapElement.values[index] = val + 1;
                    });
                });
            });
            this.checkedCategories = [];
            this.drawPixelmapAnnotation();
            this.saveAnnotations(true);
            this.updateConfig();
        },
        mergeCategory(newLabel, newFillColor) {
            this.addCategory('Merged Categories', newFillColor);
            this.combineCategories(this.checkedCategories, true);
            _.last(this.categories).category.label = this.enforceUniqueName(newLabel);
        },
        deleteCategory(indices) {
            const labelCounts = _.reduce([...this.selectedLabels.values()], (acc, selected) => {
                return acc + selected.count;
            }, 0);
            if (labelCounts === 0) {
                // If nothing was labeled we don't need a warning dialog
                this.combineCategories(indices, false);
                return;
            }
            const message = `Deleting categories cannot be undone. Are you
                            sure you want to delete all ${labelCounts} labeled
                            superpixels?`;
            confirm({
                title: 'Warning',
                text: message,
                yesText: 'Delete Selected',
                confirmCallback: () => this.combineCategories(indices, false)
            });
        },
        togglePicker(event, index) {
            const picker = this.$refs.colorpicker[index];
            const colorPicker = picker.$refs.colorPicker;
            if (event.target.className === 'current-color' && colorPicker) {
                // Default to th RGBA input
                colorPicker.fieldsIndex++;
            }
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
                updatePixelmapLayerStyle([this.overlayLayer]);
                this.updateConfig();
            }
        },
        getFillColor(index) {
            const hexColor = schemeTableau10[index % 10];
            const [r, g, b] = hexColor.slice(1).match(/.{1,2}/g);
            return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, 0.5)`;
        },
        enforceUniqueName(name) {
            const existingNames = _.map(this.categories, (category) => category.category.label);
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
        }, 500),
        hotkeyFromIndex(index) {
            return _.find([...this.hotkeys], ([, v]) => v === index)[0];
        }
    }
});
</script>

<template>
  <div>
    <div :class="{'h-labeling-container': true, 'h-collapsed': !showLabelingContainer}">
      <div class="h-container-title">
        <button
          class="h-collapse-button"
          @click="showLabelingContainer = !showLabelingContainer"
        >
          <i
            v-if="showLabelingContainer"
            class="icon-angle-double-left"
            data-toggle="tooltip"
            title="Hide labeling editor"
          />
          <i
            v-else
            class="icon-angle-double-right"
            data-toggle="tooltip"
            title="Show labeling editor"
          />
        </button>
        <h4 v-if="showLabelingContainer">
          <i class="icon-tags" />
          Labeling
        </h4>
        <i
          v-else
          class="icon-tags"
        />
        <div class="btn-group">
          <button
            v-if="showLabelingContainer"
            :class="['btn btn-default', !pixelmapPaintBrush && 'active btn-primary']"
            data-toggle="tooltip"
            title="Left-click + drag to pan"
            @click="pixelmapPaintBrush = !pixelmapPaintBrush"
          >
            <i class="icon-move" />
          </button>
          <button
            v-if="showLabelingContainer"
            :class="['btn btn-default', pixelmapPaintBrush && 'active btn-primary']"
            data-toggle="tooltip"
            title="Left-click + drag to paint"
            @click="pixelmapPaintBrush = !pixelmapPaintBrush"
          >
            <i class="icon-paint-roller" />
          </button>
        </div>
      </div>
      <div
        v-if="showLabelingContainer"
        class="h-al-setup-categories"
      >
        <div v-if="pixelmapRendered">
          <div class="h-category-form">
            <div class="h-form-controls">
              <div>
                <label for="currentImage">Image</label>
                <select
                  id="currentImage"
                  v-model="currentImageId"
                  class="h-al-image-select"
                >
                  <option
                    v-for="imageId in Object.keys(imageNamesById)"
                    :key="imageId"
                    :value="imageId"
                    :disabled="!annotationsByImageId[imageId].labels"
                  >
                    {{ imageNamesById[imageId] }}
                  </option>
                </select>
              </div>
            </div>
          </div>
          <div>
            <table class="table">
              <tr>
                <th><i class="icon-keyboard" /></th>
                <th>Label</th>
                <th>Superpixels</th>
              </tr>
              <tr
                v-for="(key, index) in Object.keys(labeledSuperpixelCounts)"
                :key="index"
                :class="{'h-selected-row': categoryIndex === index}"
                @click="categoryIndex = index"
              >
                <td>{{ hotkeyFromIndex(index + 1) }}</td>
                <td
                  v-if="editing === index"
                  class="table-labels"
                >
                  <input
                    id="category-label"
                    :ref="`label_${index}`"
                    v-model="currentCategoryLabel"
                    class="form-control input-sm category-input"
                    @keyup.enter="editing = -1"
                    @blur="editing = -1"
                    @focus="$event.target.select()"
                  >
                  <button
                    class="btn h-table-button"
                    data-toggle="tooltip"
                    title="Accept changes"
                    @click="editing = -1"
                  >
                    <i class="icon-ok" />
                  </button>
                </td>
                <td
                  v-else
                  class="table-labels"
                >
                  {{ labeledSuperpixelCounts[key].label }}
                  <div class="editing-icons">
                    <button
                      class="btn h-table-button"
                      data-toggle="tooltip"
                      title="Edit label name"
                      @click="editing = index"
                    >
                      <i class="icon-pencil" />
                    </button>
                  </div>
                </td>
                <td>{{ labeledSuperpixelCounts[key].count }}</td>
                <td
                  id="colorPickerInput"
                  @click="(e) => togglePicker(e, index)"
                >
                  <color-picker-input
                    :key="key"
                    ref="colorpicker"
                    v-model="currentCategoryFillColor"
                    class="condensed-color-picker"
                    :color="labeledSuperpixelCounts[key].fillColor"
                    data-toggle="tooltip"
                    title="Change label color"
                  />
                </td>
                <td>
                  <input
                    v-model="checkedCategories"
                    type="checkbox"
                    :value="index"
                  >
                </td>
              </tr>
            </table>
            <div class="h-remove-categories">
              <button
                class="btn btn-danger btn-xs"
                :disabled="checkedCategories.length < 1"
                data-toggle="tooltip"
                title="Delete category"
                @click="() => deleteCategory(checkedCategories)"
              >
                <i class="icon-trash" />
              </button>
              <button
                class="btn btn-warning btn-xs"
                :disabled="checkedCategories.length < 2"
                data-toggle="modal"
                data-target="#mergeConfirmation"
              >
                <i
                  class="icon-merge-rows"
                  data-toggle="tooltip"
                  title="Merge selected categories"
                />
              </button>
            </div>
          </div>
          <button
            class="btn btn-info btn-block"
            :disabled="!currentCategoryFormValid"
            @click="() => addCategory()"
          >
            <i class="icon-plus" /> Add Category
          </button>
        </div>
      </div>
      <div
        v-if="!currentCategoryFormValid || !currentLabelsValid"
        class="h-error-messages"
      >
        <p class="form-validation-error">
          Please fix all errors to continue
        </p>
        <ul v-if="currentFormErrors.length > 0 || currentLabelingErrors.length > 0">
          <li
            v-for="error in currentFormErrors"
            :key="error"
            class="form-validation-error"
          >
            {{ error }}
          </li>
          <li
            v-for="error in currentLabelingErrors"
            :key="error"
            class="form-validation-error"
          >
            {{ error }}
          </li>
        </ul>
      </div>
      <hr v-if="showLabelingContainer">
      <button
        v-if="showLabelingContainer"
        class="btn btn-primary btn-block"
        :disabled="!currentCategoryFormValid || !currentLabelsValid"
        @click="beginTraining"
      >
        <i class="icon-star" /> Begin training
      </button>
    </div>
    <active-learning-merge-confirmation
      id="mergeConfirmation"
      :callback="mergeCategory"
      :category-name="currentCategoryLabel"
      :fill-color="currentCategoryFillColor"
      :selected-labels="selectedLabels"
    />
    <div
      ref="map"
      class="h-setup-categories-map"
    />
    <annotation-opacity-control
      :style="{'width': '350px', 'right': '20px'}"
      :fill-color="currentCategoryFillColor"
      :overlay-layers="[overlayLayer]"
    />
    <div :class="{'h-setup-categories-information': true, 'h-collapsed': !showInfoContainer}">
      <mouse-and-keyboard-controls
        v-if="showInfoContainer"
        :active-learning-setup="true"
        :pixelmap-paint-brush="pixelmapPaintBrush"
      />
      <i class="icon-info-circled" />
      <button
        class="h-collapse-button"
        @click="showInfoContainer = !showInfoContainer"
      >
        <i
          v-if="showInfoContainer"
          class="icon-angle-double-right"
          data-toggle="tooltip"
          title="Hide info panel"
        />
        <i
          v-else
          class="icon-angle-double-left"
          data-toggle="tooltip"
          title="Show info panel"
        />
      </button>
    </div>
  </div>
</template>

<style scoped>
.h-labeling-container {
    z-index: 1000;
    position: absolute;
    top: 5px;
    left: 5px;
    width: 400px;
    display: flex;
    flex-direction: column;
    background-color: #fff;
    border-radius: 5px;
    box-shadow: 5px 5px 5px rgba(0, 0, 0, 0.5);
    padding: 5px;
    height: 90vh;
    justify-content: space-between;
}

.h-collapsed {
    max-width: fit-content;
    height: auto;
}

.h-collapse-button {
    border: none;
    background-color: transparent;
    width: fit-content;
    height: fit-content;
}

.h-container-title {
    display: flex;
    background-color: #f6f6f6;
    border-radius: 5px;
    align-items: center;
    min-height: 40px;
    padding-right: 5px;
}

h4 {
    margin: 10px auto;
}

.h-al-setup-categories {
    border-radius: 5px;
    height: 100%;
}

.h-al-image-select {
    width: 100%;
    padding: 5px 10px;
}

.h-setup-categories-information {
    z-index: 1000;
    position: absolute;
    top: 45px;
    right: 20px;
    width: 350px;
    display: flex;
    background-color: #fff;
    border-radius: 5px;
    box-shadow: 5px 5px 5px rgba(0, 0, 0, 0.5);
    padding: 5px;
}

.h-setup-categories-map {
    min-height: 100vh;
    border: 1px solid #f0f0f0;
}

.h-form-controls {
    max-width: 550px;
    display: flex;
    flex-direction: column;
}

.h-category-form {
   display: flex;
   flex-direction: column;
}

td, th {
    padding: 0px 2px;
    text-align: center;
}

th:nth-child(2), td:nth-child(2) {
    text-align: left;
}

tr:nth-child(even) {
    background-color: #f0f0f0;
}

tr .editing-icons {
    opacity: 0;
}

tr:hover .editing-icons {
    opacity: 1;
}

.table {
    margin-bottom: 5px;
}

.table-labels {
    display: flex;
    justify-content: space-between;
    min-width: 100%;
}

.h-selected-row {
    font-weight: bold;
}

.h-error-messages {
    padding-top: 25px;
    height: 100%;
}

.form-validation-error {
    color: red;
}

.h-table-button {
    padding: 0px;
    background-color: transparent;
    color: #888;
}

.condensed-color-picker >>> .input-group-addon {
    padding: 0px;
    border: none;
    background-color: transparent;
}

.condensed-color-picker >>> .form-control {
    display: none;
}

.category-input {
    height: 20px;
    padding: 0px 5px;
}

.h-remove-categories {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 5px;
}

</style>
