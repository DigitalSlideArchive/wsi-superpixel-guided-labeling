<script>
import Vue from 'vue';
import _ from 'underscore';

import { confirm } from '@girder/core/dialog';
import ColorPickerInput from '@girder/histomicsui/vue/components/ColorPickerInput.vue';

import { store, assignHotkey, nextCard, previousCard, updatePixelmapLayerStyle } from './store.js';
import { boundaryColor, comboHotkeys, viewMode, activeLearningSteps } from './constants.js';
import { updateMetadata, getFillColor, debounce } from './utils.js';

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
    data() {
        return {
            showLabelingContainer: true,
            editingLabel: -1,
            checkedCategories: [],
            currentCategoryLabel: 'New Label',
            currentCategoryFillColor: getFillColor(0),
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
                const label = store.categories[i].label;
                // Offset by one; labeledSuperpixelCounts does not include the default category
                return [i - 1, this.labeledSuperpixelCounts[`${i - 1}_${label}`]];
            }));
        },
        currentLabelingErrors() {
            const errors = [];
            const counts = _.map(Object.keys(this.labeledSuperpixelCounts), (entry) => this.labeledSuperpixelCounts[entry].count);
            if (_.filter(counts, (count) => count > 0).length < 2) {
                errors.push('You must label superpixels for at least two different labels.');
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
        },
        exclusions() {
            return store.exclusions;
        },
        blockingJobRunning() {
            return store.blockingJobRunning;
        }
    },
    watch: {
        editingLabel() {
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
            if (newLabel === oldLabel || _.isEmpty(newLabel)) {
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
        },
        currentCategoryFillColor(newColor, oldColor) {
            if (newColor === oldColor || !colorPattern.test(newColor)) {
                return;
            }
            store.categoriesAndIndices[store.categoryIndex].category.fillColor = this.currentCategoryFillColor;
            // Keep prediction colors in sync with label color changes
            _.forEach(Object.values(store.annotationsByImageId), (annotations) => {
                if (!_.has(annotations, 'predictions')) {
                    return;
                }
                const pixelmapElement = annotations.predictions.get('annotation').elements[0];
                _.forEach(pixelmapElement.categories, (prediction) => {
                    if (prediction.label === this.currentCategoryLabel && prediction.fillColor !== newColor) {
                        prediction.fillColor = newColor;
                        updatePixelmapLayerStyle();
                        store.backboneParent.saveAnnotations(Object.keys(store.annotationsByImageId));
                    }
                });
            });
        },
        categoryIndex(index) {
            if (index < 0 || index >= store.categoriesAndIndices.length) {
                return;
            }
            this.currentCategoryLabel = store.categoriesAndIndices[store.categoryIndex].category.label;
            this.currentCategoryFillColor = store.categoriesAndIndices[store.categoryIndex].category.fillColor;
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
        },
        exclusions() {
            store.backboneParent.updateHistomicsYamlConfig();
        }
    },
    mounted() {
        if (store.mode === viewMode.Review) return;
        window.addEventListener('keydown', this.keydownListener);
    },
    methods: {
        /*************************
         * RESPOND TO USER INPUT *
         *************************/
        addCategory(newName, newFillColor) {
            if (_.isUndefined(newName)) {
                newName = 'New Label';
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
            this.synchronizeCategories();
        },
        combineCategories(isMerge) {
            // Separate the removed categories from the remaining
            const newCats = store.categories.filter((_, i) => !this.checkedCategories.includes(i));

            // Map old values to new
            const newValues = store.categories.map((category) => {
                const index = _.findIndex(newCats, (cat) => cat.label === category.label);
                if (index === -1) {
                    return isMerge ? newCats.length - 1 : 0;
                }
                return index;
            });

            // Grab the indices we need
            const labelIndices = {};
            store.categoriesAndIndices.map((catAndIdxs) => {
                return Object.keys(catAndIdxs.indices).forEach((imageId) => {
                    const oldIndices = labelIndices[imageId] || new Set();
                    const newIndices = catAndIdxs.indices[imageId] || new Set();
                    labelIndices[imageId] = new Set([...oldIndices, ...newIndices]);
                });
            });
            const [catsAndInds, oldCatsAndInds] = _.partition(store.categoriesAndIndices,
                (_, i) => !this.checkedCategories.includes(i + 1));
            store.categoriesAndIndices = catsAndInds;

            // Update the exclusions list
            store.exclusions = store.exclusions.filter((ex) => this.checkedCategories.includes(ex - 1));

            // Map superpixels by index and image id for faster lookup
            const superpixelMap = new Map(store.sortedSuperpixelIndices.map((sp) => [`${sp.imageId}_${sp.index}`, sp]));

            Object.keys(store.annotationsByImageId).forEach((imageId) => {
                if (!('labels' in store.annotationsByImageId[imageId])) {
                    return;
                }

                // Update the label categories list
                const annotations = store.annotationsByImageId[imageId].labels;
                const pixelmapElement = annotations.get('annotation').elements[0];
                pixelmapElement.categories = [...newCats];

                // Update the metadata
                const meta = annotations.get('annotation').attributes.metadata;
                const metaIndices = Object.entries(meta).filter(([, v]) => !!v.reviewValue).map(([k]) => Number(k));

                const allIndices = new Set([...labelIndices[imageId], ...metaIndices]);
                allIndices.forEach((index) => {
                    const oldValue = pixelmapElement.values[index];
                    const newValue = newValues[oldValue];

                    let superpixel = superpixelMap.get(`${imageId}_${index}`);
                    if (!superpixel) {
                        // If we can't find the superpixel, build our own.
                        superpixel = { imageId, selectedCategory: newValue, index };
                    }
                    if (labelIndices[imageId].has(index)) {
                        // A label is affected, update the value and the metadata
                        pixelmapElement.values[index] = newValue;
                        updateMetadata(superpixel, newValue, false);
                    }

                    if (meta[index] && meta[index].reviewValue === oldValue) {
                        // A review is affected, update the metadata
                        const newValue = newValues[index];
                        updateMetadata(superpixel, newValue, true);
                    }
                });

                if (isMerge) {
                    const mergedCategory = store.categoriesAndIndices[store.categoriesAndIndices.length - 1];
                    oldCatsAndInds.forEach((catAndInd) => {
                        const mergedIndices = mergedCategory.indices[imageId] || new Set();
                        const indices = catAndInd.indices[imageId] || new Set();
                        mergedCategory.indices[imageId] = new Set([...mergedIndices, ...indices]);
                    });
                }
            });

            this.checkedCategories = [];
            store.categories = [...newCats];
            store.categoryIndex = store.categoriesAndIndices.length - 1;
            // Force computed values to update
            store.categoriesAndIndices = [...store.categoriesAndIndices];
            this.$emit('combine');
        },
        mergeCategory(newLabel, newFillColor) {
            this.addCategory('Merged Labels', newFillColor);
            store.categories = this.allNewCategories;
            this.combineCategories(true);
            _.last(store.categoriesAndIndices).category.label = this.enforceUniqueName(newLabel);
        },
        deleteCategory() {
            const labelCounts = _.reduce([...this.selectedLabels.values()], (acc, selected) => {
                return acc + selected.count;
            }, 0);
            if (labelCounts === 0) {
                // If nothing was labeled we don't need a warning dialog
                this.combineCategories(false);
                return;
            }

            // We need to determine if any of the deleted categories have predictions associated with them.
            // If they do this will automatically trigger retraining so the user needs to be warned.
            const hasPredictions = this.checkedCategories.some((i) => store.predictionCounts[i - 1] > 0);
            const predictionsWarning = `Deleting a label with predictions will
                                        immediately force retraining to run.`;
            const labelingWarning = `Deleting labels cannot be undone.`;
            const message = `${hasPredictions ? predictionsWarning : labelingWarning}
                            Are you sure you want to delete all ${labelCounts} labeled
                            superpixels?`;
            confirm({
                title: 'Warning',
                text: message,
                yesText: `Delete Selected${hasPredictions ? ' and Retrain' : ''}`,
                confirmCallback: () => {
                    this.combineCategories(false);
                    if (hasPredictions) {
                        this.beginTraining();
                    }
                }
            });
        },
        selectCategory(index) {
            store.categoryIndex = index;
        },
        synchronizeCategories: debounce(function () {
            store.categories = this.allNewCategories;
            if (store.currentCategoryFormValid) {
                _.forEach(Object.values(store.annotationsByImageId), (annotations) => {
                    if (_.has(annotations, 'labels')) {
                        const superpixelElement = annotations.labels.get('annotation').elements[0];
                        if (superpixelElement) {
                            const updatedCategories = JSON.parse(JSON.stringify(store.categories));
                            superpixelElement.categories = updatedCategories;
                        }
                    }
                });
                store.backboneParent.updateHistomicsYamlConfig();
                store.backboneParent.saveAnnotations(Object.keys(store.annotationsByImageId));
            }
        }),
        keydownListener(event) {
            if (event.target.type === 'text' && event.target.id !== 'category-hotkey') {
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
        toggleLabels() {
            store.labels = !store.labels;
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
        updateExclusions(index) {
            if (store.exclusions.includes(index)) {
                const pos = store.exclusions.indexOf(index);
                store.exclusions.splice(pos, 1);
            } else {
                store.exclusions.push(index);
            }
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
    <div
      :class="{'h-labeling-container': mode !== viewMode.Review, 'h-collapsed': !showLabelingContainer}"
    >
      <div
        v-if="mode !== viewMode.Review"
        class="h-container-title"
      >
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
                :style="[exclusions.includes(index) && {'color': 'red', 'font-weight': 'bold'}]"
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
                  <div class="editing-icons edit-hotkey">
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
                  :style="[mode === viewMode.Review && {'width': 'auto'}]"
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
                  :style="[mode === viewMode.Review && {'width': 'auto'}]"
                >
                  {{ labeledSuperpixelCounts[key].label }}
                  <div class="editing-icons">
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
                <td>
                  <div :class="[!exclusions.includes(index) && 'editing-icons']">
                    <button
                      class="btn btn-xs"
                      :style="{'background-color': 'transparent'}"
                      data-toggle="tooltip"
                      :title="exclusions.includes(index) ? 'Excluded from training' : 'Exclude from training'"
                      @click="updateExclusions(index)"
                    >
                      <i
                        class="icon-block"
                        :style="[exclusions.includes(index) && {'color': 'red'}]"
                      />
                    </button>
                  </div>
                </td>
                <td v-if="mode === viewMode.Labeling">
                  <input
                    v-model="checkedCategories"
                    type="checkbox"
                    :value="index + 1"
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
                title="Delete label"
                @click="() => deleteCategory()"
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
            <i class="icon-plus" /> Add Label
          </button>
        </div>
      </div>
      <div
        v-if="!currentCategoryFormValid || !currentLabelsValid"
        class="h-error-messages"
      >
        <ul
          v-if="currentFormErrors.length > 0 || currentLabelingErrors.length > 0"
          :style="{'padding-left': '10px'}"
        >
          <li
            v-for="error in currentFormErrors"
            :key="error"
            class="form-validation-error text-primary"
          >
            <span><i class="icon-attention" /></span>
            {{ error }}
          </li>
          <li
            v-for="error in currentLabelingErrors"
            :key="error"
            class="form-validation-error text-primary"
          >
            <span><i class="icon-attention" /></span>
            {{ error }}
          </li>
        </ul>
      </div>
      <button
        v-if="showLabelingContainer && activeLearningStep >= activeLearningSteps.GuidedLabeling"
        :disabled="mode === viewMode.Labeling"
        class="btn btn-primary btn-block"
        title="Show or hide labels"
        @click="toggleLabels"
      >
        Toggle Labels Visibility
      </button>
      <button
        v-if="showLabelingContainer && activeLearningStep >= activeLearningSteps.GuidedLabeling"
        class="btn btn-primary btn-block"
        title="Show or hide the most recent predictions"
        @click="togglePredictions"
      >
        Toggle Predictions Visibility
      </button>
      <button
        v-if="showLabelingContainer"
        class="btn btn-block"
        :class="[activeLearningStep < activeLearningSteps.GuidedLabeling ? 'btn-primary' : 'btn-success']"
        :disabled="!currentCategoryFormValid || !currentLabelsValid || blockingJobRunning"
        data-toggle="tooltip"
        :title="blockingJobRunning ? 'Training in progress' : ''"
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
    width: 415px;
    display: flex;
    flex-direction: column;
    background-color: #fff;
    border-radius: 5px;
    box-shadow: 3px 3px 5px 2px rgba(0,0,0,.5);
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
    height: 100%;
}

.form-validation-error {
    list-style: none;
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
