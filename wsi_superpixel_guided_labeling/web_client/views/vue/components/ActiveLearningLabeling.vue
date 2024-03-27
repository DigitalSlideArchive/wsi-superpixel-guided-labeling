<script>
import Vue from 'vue';
import _ from 'underscore';

import { confirm } from '@girder/core/dialog';
import ColorPickerInput from '@girder/histomicsui/vue/components/ColorPickerInput.vue';

import { store } from './store.js';
import { boundaryColor, viewMode } from './constants.js';
import { getFillColor } from './utils.js';

// Define some helpful constants for adding categories
const defaultCategory = {
    label: 'default',
    fillColor: 'rgba(0, 0, 0, 0)',
    strokeColor: 'rgba(0, 0, 0, 1)'
};
const colorPattern = /^(#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgb\(\d+,\s*\d+,\s*\d+\)|rgba\(\d+,\s*\d+,\s*\d+,\s*(\d?\.|)\d+\))$/;

export default Vue.extend({
    components: {
        ColorPickerInput
    },
    props: ['imageNamesById', 'availableImages'],
    data() {
        return {
            showLabelingContainer: true,
            editing: -1,
            checkedCategories: [],
            currentCategoryLabel: 'New Category',
            currentCategoryFillColor: getFillColor(0),
            newImagesAvailable: false,
            selectedImageId: store.currentImageId
        };
    },
    computed: {
        pixelmapPaintBrush() {
            return store.pixelmapPaintBrush;
        },
        categoryIndex() {
            return store.categoryIndex;
        },
        annotationsByImageId() {
            return store.annotationsByImageId;
        },
        selectedLabels() {
            return new Map(_.map(this.checkedCategories, (i) => {
                const label = store.categoriesAndIndices[i].category.label;
                return [i, this.labeledSuperpixelCounts[`${i}_${label}`]];
            }));
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
        allNewCategories() {
            const activeLearningCategories = _.pluck(store.categoriesAndIndices, 'category');
            return [defaultCategory, ...activeLearningCategories];
        },
        mode() {
            return store.mode;
        },
        viewMode() {
            return viewMode;
        },
        currentFormErrors() {
            const errors = [];
            const categoryNames = _.map(store.categoriesAndIndices, (category) => category.category.label);
            const differentCategoryNames = new Set(categoryNames);
            if (categoryNames.length !== differentCategoryNames.size) {
                errors.push('All categories must have unique names.');
            }
            return errors;
        },
        currentCategoryFormValid() {
            store.currentCategoryFormValid = this.currentFormErrors.length === 0;
            return store.currentCategoryFormValid;
        },
        labeledSuperpixelCounts() {
            const counts = {};
            _.forEach(store.categoriesAndIndices, (categoryAndIndices, index) => {
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
        pixelmapRendered() {
            return store.overlayLayers.length > 0;
        }
    },
    watch: {
        editing() {
            if (this.editing === -1) {
                return;
            }
            const key = `label_${this.editing}`;
            this.$nextTick(() => this.$refs[key][0].focus());
        },
        categories: {
            handler() {
                this.currentCategoryLabel = store.categoriesAndIndices[0].category.label;
                this.currentCategoryFillColor = store.categoriesAndIndices[0].category.fillColor;
            },
            deep: true
        },
        currentCategoryLabel(newLabel, oldLabel) {
            if (newLabel === oldLabel) {
                return;
            }
            store.categoriesAndIndices[store.categoryIndex].category.label = this.currentCategoryLabel;
            this.synchronizeCategories();
        },
        currentCategoryFillColor(newColor, oldColor) {
            if (newColor === oldColor || !colorPattern.test(newColor)) {
                return;
            }
            store.categoriesAndIndices[store.categoryIndex].category.fillColor = this.currentCategoryFillColor;
            this.synchronizeCategories();
        },
        categoryIndex(index) {
            if (index < 0 || index >= store.categoriesAndIndices.length) {
                return;
            }
            this.currentCategoryLabel = store.categoriesAndIndices[store.categoryIndex].category.label;
            this.currentCategoryFillColor = store.categoriesAndIndices[store.categoryIndex].category.fillColor;
        },
        availableImages(newAvail, oldAvail) {
            const newImage = _.difference(newAvail, oldAvail)[0];
            if (newImage === store.currentImageId) {
                // Update image with annotations
                this.superpixelAnnotation = this.annotationsByImageId[this.currentImageId].labels;
                this.setupViewer();
            }
            this.newImagesAvailable = true;
        },
        selectedImageId(newImageId) {
            store.currentImageId = newImageId;
        },
        checkedCategories() {
            store.selectedLabels = this.selectedLabels;
        }
    },
    methods: {
        /*************************
         * RESPOND TO USER INPUT *
         *************************/
        addCategory(newName, newFillColor) {
            if (_.isUndefined(newName)) {
                newName = 'New Category';
            }
            if (_.isUndefined(newFillColor)) {
                newFillColor = getFillColor(store.categoriesAndIndices.length);
            }

            store.categoriesAndIndices.push({
                category: {
                    label: this.enforceUniqueName(newName),
                    fillColor: newFillColor,
                    strokeColor: boundaryColor
                },
                indices: {}
            });
            store.categoryIndex = store.categoriesAndIndices.length - 1;
        },
        combineCategories(indices, isMerge) {
            // Remove the selected categories
            indices = _.sortBy(indices, (i) => i).reverse();
            const oldCategories = _.map(indices, (index) => {
                return store.categoriesAndIndices.splice(index, 1)[0];
            });

            _.forEach(Object.keys(store.annotationsByImageId), (imageId) => {
                const labels = store.annotationsByImageId[imageId].labels;
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
                        const newIndices = _.last(store.categoriesAndIndices).indices[imageId] || new Set();
                        _.last(store.categoriesAndIndices).indices[imageId] = new Set([...newIndices, ...indices]);
                    }
                });

                // Indices have shifted after removing the selected categories
                _.forEach(store.categoriesAndIndices, (category, val) => {
                    const indices = category.indices[imageId] || new Set();
                    _.forEach([...indices], (index) => {
                        pixelmapElement.values[index] = val + 1;
                    });
                });
            });
            this.checkedCategories = [];
            store.categories = this.allNewCategories;
            this.$emit('combine');
        },
        mergeCategory(newLabel, newFillColor) {
            this.addCategory('Merged Categories', newFillColor);
            this.combineCategories(this.checkedCategories, true);
            _.last(store.categoriesAndIndices).category.label = this.enforceUniqueName(newLabel);
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
        selectCategory(index) {
            store.categoryIndex = index;
        },
        synchronizeCategories() {
            store.categories = this.allNewCategories;
            this.$emit('synchronize');
        },
        /***********
         * UTILITY *
         ***********/
        hotkeyFromIndex(index) {
            return _.find([...store.hotkeys], ([, v]) => v === index)[0];
        },
        togglePicker(event, index) {
            const picker = this.$refs.colorpicker[index];
            const colorPicker = picker.$refs.colorPicker;
            if (event.target.className === 'current-color' && colorPicker) {
                // Default to th RGBA input
                colorPicker.fieldsIndex++;
            }
        },
        enforceUniqueName(name) {
            const existingNames = _.map(store.categoriesAndIndices, (category) => category.category.label);
            let count = 1;
            let uniqueName = name;
            while (_.some(existingNames, (en) => en.includes(uniqueName)) && count < 50) {
                uniqueName = `${name} (${count++})`;
            }
            return uniqueName;
        },
        tooglePixelmapPaintBrush() {
            store.pixelmapPaintBrush = !store.pixelmapPaintBrush;
        },
        /**********************************
         * USE BACKBONE CONTAINER METHODS *
         **********************************/
        beginTraining() {
            store.backboneParent.retrain(true);
        }
    }
});
</script>

<template>
  <div>
    <div class="h-category-form slide-name-container">
      <div class="h-form-controls">
        <label
          for="currentImage"
          :style="[{'margin-right': '5px'}]"
        >
          Image
        </label>
        <select
          v-if="mode === viewMode.Labeling"
          id="currentImage"
          v-model="selectedImageId"
          data-toggle="tooltip"
          :title="imageNamesById[selectedImageId]"
          :class="['h-al-image-select', newImagesAvailable && 'h-al-image-select-new']"
          :style="[!availableImages.includes(selectedImageId) && {'font-style': 'italic'}]"
          @click="newImagesAvailable = false"
        >
          <option
            v-for="imageId in Object.keys(imageNamesById)"
            :key="imageId"
            :value="imageId"
            :disabled="!annotationsByImageId[imageId] || !annotationsByImageId[imageId].labels"
            :style="[!availableImages.includes(imageId) ? {'font-style': 'italic'} : {'font-style': 'normal'}]"
          >
            {{ imageNamesById[imageId] }}
          </option>
        </select>
        <div
          v-else
          class="slide-name"
          data-toggle="tooltip"
          :title="imageNamesById[selectedImageId]"
        >
          {{ imageNamesById[selectedImageId] }}
        </div>
      </div>
    </div>
    <div
      :class="{'h-labeling-container': true, 'h-collapsed': !showLabelingContainer}"
      :style="[mode !== viewMode.Labeling && {'height': 'auto'}]"
    >
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
        <div
          v-if="mode === viewMode.Labeling"
          class="btn-group"
        >
          <button
            v-if="showLabelingContainer"
            :class="['btn btn-default', !pixelmapPaintBrush && 'active btn-primary']"
            data-toggle="tooltip"
            title="Left-click + drag to pan"
            @click="tooglePixelmapPaintBrush"
          >
            <i class="icon-move" />
          </button>
          <button
            v-if="showLabelingContainer"
            :class="['btn btn-default', pixelmapPaintBrush && 'active btn-primary']"
            data-toggle="tooltip"
            title="Left-click + drag to paint"
            @click="tooglePixelmapPaintBrush"
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
                :disabled="mode === viewMode.Labeling"
                @click="selectCategory(index)"
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
                  <div
                    v-if="mode === viewMode.Labeling"
                    class="editing-icons"
                  >
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
                  :disabled="mode === viewMode.Labeling"
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
                <td v-if="mode === viewMode.Labeling">
                  <input
                    v-model="checkedCategories"
                    type="checkbox"
                    :value="index"
                  >
                </td>
              </tr>
            </table>
            <div
              v-if="mode === viewMode.Labeling"
              class="h-remove-categories"
            >
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
            v-if="mode === viewMode.Labeling"
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
      <button
        v-if="showLabelingContainer && mode === viewMode.Labeling"
        class="btn btn-primary btn-block"
        :disabled="!currentCategoryFormValid || !currentLabelsValid"
        @click="beginTraining"
      >
        <i class="icon-star" /> Begin training
      </button>
    </div>
  </div>
</template>

<style scoped>
.h-labeling-container {
    z-index: 1000;
    position: absolute;
    top: 60px;
    left: 5px;
    width: 400px;
    display: flex;
    flex-direction: column;
    background-color: #fff;
    border-radius: 5px;
    box-shadow: 5px 5px 5px rgba(0, 0, 0, 0.5);
    padding: 5px;
    height: 85vh;
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

.h-al-image-select-new {
    box-shadow: 0px 0px 5px 1px rgba(0, 127, 0, 0.5);
}

.h-form-controls {
    display: flex;
    align-items: baseline;
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

.slide-name {
    text-overflow: ellipsis;
    text-wrap: nowrap;
    overflow: hidden;
}

.slide-name-container {
    z-index: 1000;
    position: absolute;
    top: 5px;
    left: 5px;
    width: 400px;
    border-radius: 5px;
    box-shadow: 5px 5px 5px rgba(0,0,0,.5);
    padding: 5px;
    background-color: #fff;
}
</style>