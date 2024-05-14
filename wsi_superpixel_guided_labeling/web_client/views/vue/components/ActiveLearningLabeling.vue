<script>
import Vue from 'vue';
import _ from 'underscore';

import { confirm } from '@girder/core/dialog';
import ColorPickerInput from '@girder/histomicsui/vue/components/ColorPickerInput.vue';

import { store, assignHotkey, nextCard, previousCard } from './store.js';
import { boundaryColor, comboHotkeys, viewMode, activeLearningSteps } from './constants.js';
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
            editingLabel: -1,
            checkedCategories: [],
            currentCategoryLabel: 'New Category',
            currentCategoryFillColor: getFillColor(0),
            newImagesAvailable: false,
            selectedImageId: store.currentImageId,
            editingHotkey: -1,
            currentHotkeyInput: []
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
            return !_.isNull(store.labelsOverlayLayer);
        },
        activeLearningStep() {
            return store.activeLearningStep;
        },
        nonDefaultCategories() {
            return _.filter(store.categories, (category) => {
                return category.label !== 'default';
            });
        },
        editingText() {
            return this.currentHotkeyInput.join(',');
        },
        activeLearningSteps() {
            return activeLearningSteps;
        }
    },
    watch: {
        editingLabel() {
            store.categoryIndex = this.editingLabel;
            if (this.editingLabel === -1) {
                this.synchronizeCategories();
                return;
            } else {
                store.categoryIndex = this.editingLabel;
            }
            this.$nextTick(() => document.getElementById('category-label').focus());
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
            if (this.editingLabel !== -1) {
                // Keep prediction names in sync with label name changes
                _.forEach(Object.values(store.annotationsByImageId), (annotations) => {
                    if (!_.has(annotations, 'predictions')) {
                        return;
                    }
                    const pixelmapElement = annotations.predictions.get('annotation').elements[0];
                    _.forEach(pixelmapElement.categories, (prediction) => {
                        if (prediction.label === oldLabel) {
                            prediction.label = newLabel;
                        }
                    });
                });
            }
            this.synchronizeCategories();
        },
        currentCategoryFillColor(newColor, oldColor) {
            if (newColor === oldColor || !colorPattern.test(newColor)) {
                return;
            }
            store.categoriesAndIndices[store.categoryIndex].category.fillColor = this.currentCategoryFillColor;
            // Keep prediction colors in sync with label color changes
            _.forEach(Object.values(store.annotationsByImageId), (annotations) => {
                const pixelmapElement = annotations.predictions.get('annotation').elements[0];
                if (!_.has(annotations, 'predictions')) {
                    return;
                }
                _.forEach(pixelmapElement.categories, (prediction) => {
                    if (prediction.label === this.currentCategoryLabel) {
                        prediction.fillColor = newColor;
                    }
                });
            });
            this.synchronizeCategories();
        },
        categoryIndex(index) {
            if (index < 0 || index >= store.categoriesAndIndices.length) {
                return;
            }
            this.currentCategoryLabel = store.categoriesAndIndices[store.categoryIndex].category.label;
            this.currentCategoryFillColor = store.categoriesAndIndices[store.categoryIndex].category.fillColor;
        },
        availableImages() {
            this.newImagesAvailable = true;
        },
        selectedImageId(newImageId) {
            store.currentImageId = newImageId;
        },
        checkedCategories() {
            store.selectedLabels = this.selectedLabels;
        },
        mode: {
            handler() {
                if (store.mode === viewMode.Guided) {
                    store.lastCategorySelected = null;
                } else {
                    store.lastCategorySelected = null;
                }
            },
            immediate: true
        },
        editingHotkey(newIndex, oldIndex) {
            if (newIndex !== oldIndex && oldIndex !== -1) {
                // We were previously editing a different key, save what we were working on
                this.commitHotkeyChange();
                this.currentHotkeyInput = [];
                if (this.editingHotkey !== -1) {
                    const el = document.getElementById('category-hotkey');
                    this.$nextTick(() => el.focus());
                }
            }
        }
    },
    mounted() {
        window.addEventListener('keydown', this.keydownListener);
    },
    destroyed() {
        window.removeEventListener('keydown', this.keydownListener);
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
                const idx = store.categoriesAndIndices.length || 0;
                newFillColor = getFillColor(idx);
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
            // Separate the removed categories from the remaining
            const [oldCats, newCats] = _.partition(store.categoriesAndIndices,
                (_, i) => indices.includes(i));
            store.categoriesAndIndices = [...newCats];

            _.forEach(Object.keys(store.annotationsByImageId), (imageId) => {
                if (!_.has(store.annotationsByImageId[imageId], 'labels')) {
                    return;
                }

                // Update the label categories list
                const annotations = store.annotationsByImageId[imageId].labels;
                const pixelmapElement = annotations.get('annotation').elements[0];
                pixelmapElement.categories = [...this.allNewCategories];

                // Removing categories changes indices of the remaining categories.
                // Make sure that the values are kept in sync with these new values.
                _.forEach(newCats, (catsAndInds, newValue) => {
                    const indices = catsAndInds.indices[imageId] || new Set();
                    // The newCats list does not include the "default" category
                    // so we offset the new value by one to account for this.
                    _.forEach([...indices], (index) => {
                        pixelmapElement.values[index] = (newValue + 1);
                    });
                });

                // In the case of merging we need to make sure the old categories labeled
                // indices are now associated with the new merged category.
                const newValue = isMerge ? store.categoriesAndIndices.length : 0;
                _.forEach(oldCats, (catsAndInds) => {
                    const indices = catsAndInds.indices[imageId] || new Set();
                    _.forEach([...indices], (i) => { pixelmapElement.values[i] = newValue; });
                    if (isMerge) {
                        const mergedCategory = _.last(store.categoriesAndIndices);
                        const mergedIndices = mergedCategory.indices[imageId] || new Set();
                        mergedCategory.indices[imageId] = new Set([...mergedIndices, ...indices]);
                    }
                });
            });
            this.checkedCategories = [];
            store.categories = this.allNewCategories;
            store.categoryIndex = store.categoriesAndIndices.length - 1;
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

            // We need to determine if any of the deleted categories have predictions associated with them.
            // If they do this will automatically trigger retraining so the user needs to be warned.
            let hasPredictions = false;
            _.forEach(Object.values(store.annotationsByImageId), (annotation) => {
                if (!_.has(annotation, 'predictions')) {
                    return;
                }
                const labels = annotation.labels.get('annotation').elements[0].categories;
                const predictions = _.pluck(annotation.predictions.get('annotation').elements[0].categories, 'label');
                hasPredictions = _.some(indices, (i) => {
                    return _.contains(predictions, labels[i + 1].label);
                });
            });
            const predictionsWarning = `Deleting a category with predictions will
                                        immediately force retraining to run.`;
            const labelingWarning = `Deleting categories cannot be undone.`;
            const message = `${hasPredictions ? predictionsWarning : labelingWarning}
                            Are you sure you want to delete all ${labelCounts} labeled
                            superpixels?`;
            confirm({
                title: 'Warning',
                text: message,
                yesText: 'Delete Selected',
                confirmCallback: () => {
                    this.combineCategories(indices, false);
                    if (hasPredictions) {
                        this.beginTraining();
                    }
                }
            });
        },
        selectCategory(index) {
            store.categoryIndex = index;
        },
        synchronizeCategories() {
            store.categories = this.allNewCategories;
            this.$emit('synchronize');
        },
        keydownListener(event) {
            if (event.target.type === 'text') {
                // User is typing, not using a hot key selector
                return;
            }

            if (this.editingHotkey !== -1) {
                this.editKeydownListener(event);
            } else {
                this.categoryKeydownListener(event);
            }
        },
        commitHotkeyChange() {
            // Hotkeys should either be a single alpha-numeric value or be
            // preceded by one or more modifiers (ctrl, shift, alt)
            const okayModifiers = _.every(_.initial(this.currentHotkeyInput), (mod) => {
                return comboHotkeys.includes(mod);
            });
            const okayKey = /^[a-zA-Z0-9]$/.test(_.last(this.currentHotkeyInput));
            const validHotkey = okayModifiers && okayKey;
            if (!_.isEmpty(this.currentHotkeyInput) && validHotkey && this.editingHotkey > -1) {
                // Accept user input as finalized hotkey selection
                const newKey = this.currentHotkeyInput.join('+');
                const hotKey = this.hotkeyFromIndex(this.editingHotkey + 1);
                assignHotkey(hotKey, newKey);
                store.backboneParent.updateHistomicsYamlConfig();
                this.editingHotkey = -1;
            }
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
        togglePredictions() {
            store.predictions = !store.predictions;
        },
        toggleEdit(row, column) {
            this.editingLabel = -1;
            this.editingHotkey = -1;
            if (column === 0) {
                // This is a hotkey edit
                this.editingHotkey = row;
            } else if (column === 1) {
                // This is a label name edit
                this.editingLabel = row;
            }
            this.selectCategory(row);
        },
        parseUserHotkeys(event) {
            // Combine the list of selected keys
            const pressed = _.filter(comboHotkeys, (key) => event[`${key}Key`]);
            if (!(event.key in pressed)) pressed.push(event.key);
            return pressed;
        },
        categoryKeydownListener(event) {
            // Using hotkeys to select categories
            // In order to accommodate more than 9 categories map default and
            // user-defined hotkeys to each category index
            const userHotkeys = this.parseUserHotkeys(event);
            const idx = store.hotkeys.get(userHotkeys.join('+'));
            if (this.mode === viewMode.Labeling) {
                if (!_.isUndefined(idx)) {
                    event.preventDefault();
                    store.categoryIndex = idx - 1;
                }
            } else if (this.mode === viewMode.Guided) {
                if (!_.isUndefined(idx)) {
                    store.lastCategorySelected = idx;
                    return;
                }
                switch (event.key) {
                    case 'ArrowRight':
                        nextCard();
                        break;
                    case 'ArrowLeft':
                        previousCard();
                        break;
                }
            }
        },
        editKeydownListener(event) {
            // Using keyboard to set hotkeys
            const newKey = this.currentHotkeyInput.join('+');
            const assignedHotkeys = _.filter(store.hotkeys, (_key, idx) => {
                return idx < store.categories.length;
            });
            if (newKey in assignedHotkeys) {
                event.preventDefault();
            }
            this.currentHotkeyInput = this.parseUserHotkeys(event);
            this.commitHotkeyChange();
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
        <div>
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
                :class="{'h-selected-row': categoryIndex === index && mode === viewMode.Labeling}"
                @click="selectCategory(index)"
              >
                <td v-if="editingHotkey === index">
                  <input
                    id="category-hotkey"
                    class="form-control input-sm category-input hotkey-input"
                    :value="editingText"
                    readonly
                    @keyup.enter="editingHotkey = -1"
                    @blur="editingHotkey = -1"
                  >
                </td>
                <td v-else>
                  {{ hotkeyFromIndex(index + 1) }}
                  <div
                    v-if="mode !== viewMode.Review"
                    class="editing-icons edit-hotkey"
                  >
                    <button
                      class="btn h-table-button"
                      data-toggle="tooltip"
                      title="Edit label name"
                      @click="toggleEdit(index, 0)"
                    >
                      <i class="icon-pencil" />
                    </button>
                  </div>
                </td>
                <td
                  v-if="editingLabel === index"
                  class="table-labels"
                >
                  <input
                    id="category-label"
                    v-model="currentCategoryLabel"
                    class="form-control input-sm category-input"
                    @keyup.enter="editingLabel = -1"
                    @blur="editingLabel = -1"
                    @focus="$event.target.select()"
                  >
                  <button
                    class="btn h-table-button"
                    data-toggle="tooltip"
                    title="Accept changes"
                    @click="editingLabel = -1"
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
                    v-if="mode !== viewMode.Review"
                    class="editing-icons"
                  >
                    <button
                      class="btn h-table-button"
                      data-toggle="tooltip"
                      title="Edit label name"
                      @click="toggleEdit(index, 1)"
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
        v-if="showLabelingContainer && activeLearningStep >= activeLearningSteps.GuidedLabeling"
        class="btn btn-primary btn-block"
        title="Show or hide the most recent predictions"
        @click="togglePredictions"
      >
        Show/hide predictions
      </button>
      <button
        v-if="showLabelingContainer"
        class="btn btn-block"
        :class="[activeLearningStep < activeLearningSteps.GuidedLabeling ? 'btn-primary' : 'btn-success']"
        :disabled="!currentCategoryFormValid || !currentLabelsValid"
        @click="beginTraining"
      >
        <i class="icon-star" />
        {{ activeLearningStep < activeLearningSteps.GuidedLabeling ? 'Begin training' : 'Retrain' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.h-labeling-container {
    z-index: 100;
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
    margin-bottom: 5px;
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
    width: 225px;
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
    z-index: 100;
    position: absolute;
    top: 5px;
    left: 5px;
    width: 400px;
    border-radius: 5px;
    box-shadow: 5px 5px 5px rgba(0,0,0,.5);
    padding: 5px;
    background-color: #fff;
}

.edit-hotkey {
    display: inline-flex;
    position: absolute;
    left: 10px;
}

.hotkey-input {
    max-width: 20px;
    margin: auto;
}
</style>
