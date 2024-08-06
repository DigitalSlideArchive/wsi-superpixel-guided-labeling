<script>
import Vue from 'vue';
import _ from 'underscore';

import ActiveLearningReviewCard from './ActiveLearningReviewCard.vue';
import ActiveLearningLabeling from '../ActiveLearningLabeling.vue';
import { store } from '../store.js';
import { groupByOptions, sortByOptions } from '../constants';

export default Vue.extend({
    components: {
        ActiveLearningReviewCard,
        ActiveLearningLabeling
    },
    data() {
        return {
            viewerWidget: null,
            selectedSuperpixel: null,
            sortAscending: true,
            categoriesPanelCollapsed: false,
            filtersPanelCollapsed: false,
            viewPanelCollapsed: false,
            bulkPanelCollapsed: false,
            overviewPanelCollapsed: false,
            isResizing: false,
            dataSelectMenu: false,
            sliceValue: 1,
            selectingSuperpixels: false,
            summaryTable: true
        };
    },
    computed: {
        groupByOptions() {
            return groupByOptions;
        },
        sortByOptions() {
            return sortByOptions;
        },
        backboneParent() {
            return store.backboneParent;
        },
        predictionsData() {
            if (store.backboneParent) {
                return store.backboneParent.superpixelPredictionsData;
            }
            return [];
        },
        superpixelsForReview() {
            return _.filter(this.predictionsData, (superpixel) => {
                return superpixel.selectedCategory !== 0;
            });
        },
        annotationsByImageId() {
            return store.annotationsByImageId;
        },
        categories() {
            return store.categories;
        },
        predictionCategoryLabels() {
            return _.rest(_.pluck(store.categories, 'label'));
        },
        selectedReviewSuperpixels: {
            get() {
                return store.selectedReviewSuperpixels;
            },
            set(selections) {
                store.selectedReviewSuperpixels = selections;
            }
        },
        filterOptions() {
            const categories = _.pluck(_.filter(this.categories,
                (cat) => cat.label !== 'default'), 'label');
            const slides = _.map(Object.keys(this.annotationsByImageId), (imageId) => {
                return this.imageItemsById[imageId].name;
            });
            return {
                Slide: slides,
                Label: categories,
                Prediction: ['agree', 'disagree']
            };
        },
        imageItemsById() {
            if (store.backboneParent) {
                return store.backboneParent.imageItemsById;
            }
            return {};
        },
        mode() {
            return store.mode;
        },
        filteredSortedGroupedSuperpixels() {
            let data = this.filterSuperpixels(this.superpixelsForReview);
            data = this.groupSuperpixels(data);
            return _.mapObject(data, (value, key) => this.sortSuperpixels(value));
        },
        groupBy: {
            get() { return store.groupBy; },
            set(value) { store.groupBy = value; }
        },
        sortBy: {
            get() { return store.sortBy; },
            set(value) { store.sortBy = value; }
        },
        filterBy: {
            get() { return store.filterBy; },
            set(value) { store.filterBy = value; }
        },
        previewSize: {
            get() { return store.previewSize; },
            set(value) { store.previewSize = value; }
        },
        cardDetails: {
            get() { return store.cardDetails; },
            set(value) { store.cardDetails = value; }
        }
    },
    watch: {
        selectedSuperpixel() {
            store.reviewSuperpixel = this.selectedSuperpixel;
        },
        filteredSortedGroupedSuperpixels(data) {
            const filteredContainsSelected = _.findWhere(data, this.selectedSuperpixel);
            if (!filteredContainsSelected) {
                // If the selected superpixel has been filtered out fall back to the first available
                this.selectedSuperpixel = _.values(data)[0][0];
            }
        }
    },
    mounted() {
        // Support infinite scrolling
        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const target = entry.target;
                    this.sliceValue += 10;
                    // Stop watching the current superpixel chip and start watching the new last chip
                    observer.unobserve(target);
                    observer.observe(document.querySelector('.panel-content-cards').lastChild);
                }
            });
        }, {
            root: document.getElementById('chipsContainer'),
            rootMargin: '0px',
            threshold: 0.1
        });
        observer.observe(document.querySelector('.h-superpixel-card'));

        // Make sure menus are always visible when opened
        const menuObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                const parent = entry.target.closest('.dropdown-dropup');
                if (parent) {
                    if (entry.isIntersecting) {
                        const hidden = entry.rootBounds.bottom < entry.boundingClientRect.bottom;
                        hidden ? parent.classList.add('dropup') : parent.classList.add('dropdown');
                    } else {
                        parent.classList.remove('dropdown', 'dropup');
                    }
                }
            });
        });
        _.forEach(document.getElementsByClassName('dropdown-menu'), (element) => {
            menuObserver.observe(element);
        });

        this.selectedSuperpixel = this.filteredSortedGroupedSuperpixels.data[0];
        this.$nextTick(() => {
            const resizeHandle = document.querySelector('.resize-handle');
            resizeHandle.addEventListener('mousedown', () => { this.isResizing = true; });
            document.addEventListener('mousemove', this.mouseMove);
            document.addEventListener('mouseup', () => { this.isResizing = false; });
        });
    },
    destroyed() {
        const resizeHandle = document.querySelector('.resize-handle');
        resizeHandle.removeEventListener('mousedown', () => { this.isResizing = true; });
        document.removeEventListener('mousemove', this.mouseMove);
        document.removeEventListener('mouseup', () => { this.isResizing = false; });
    },
    methods: {
        sortSuperpixels(sorted) {
            switch (store.sortBy) {
                case 1:
                    sorted = _.sortBy(sorted, (superpixel) => {
                        return this.imageItemsById[superpixel.imageId].name;
                    });
                    break;
                case 2:
                    sorted = _.sortBy(sorted, 'selectedCategory');
                    break;
                case 3:
                    sorted = _.sortBy(sorted, (superpixel) => {
                        const selected = superpixel.labelCategories[superpixel.selectedCategory];
                        const predicted = superpixel.predictionCategories[superpixel.prediction];
                        return selected.label === predicted.label;
                    });
                    break;
                case 4:
                    sorted = _.sortBy(sorted, 'confidence');
                    break;
                case 5:
                    sorted = _.sortBy(sorted, 'certainty');
                    break;
                default:
                    sorted = _.sortBy(sorted, 'index');
            }

            if (!this.sortAscending) {
                sorted = sorted.reverse();
            }
            return sorted;
        },
        filterSuperpixels(data) {
            const results = [];
            // Filter by selections that agree with the prediction
            if (store.filterBy.includes('agree')) {
                results.push(_.filter(data, (superpixel) => {
                    const { selectedCategory, prediction } = superpixel;
                    const selection = superpixel.labelCategories[selectedCategory].label;
                    const predicted = superpixel.predictionCategories[prediction].label;
                    return selection === predicted;
                }));
            }
            // Filter by selections that disagree with the prediction
            if (store.filterBy.includes('disagree')) {
                results.push(_.filter(data, (superpixel) => {
                    const { selectedCategory, prediction } = superpixel;
                    const selection = superpixel.labelCategories[selectedCategory].label;
                    const predicted = superpixel.predictionCategories[prediction].label;
                    return selection !== predicted;
                }));
            }
            // Filter by selected slide(s)
            const slideNames = _.pluck(this.imageItemsById, 'name');
            if (_.some(slideNames, (name) => store.filterBy.includes(name))) {
                results.push(_.filter(data, (superpixel) => {
                    const name = this.imageItemsById[superpixel.imageId].name;
                    return store.filterBy.includes(name);
                }));
            }
            // Filter by selected category(ies)
            const labels = _.map(this.categories, (category) => {
                if (category.label !== 'default') {
                    return category.label;
                }
            });
            if (_.some(labels, (label) => store.filterBy.includes(label))) {
                results.push(_.filter(data, (superpixel) => {
                    const { selectedCategory, labelCategories } = superpixel;
                    const label = labelCategories[selectedCategory].label;
                    return store.filterBy.includes(label);
                }));
            }
            return results.length ? _.intersection(...results) : data;
        },
        groupSuperpixels(data) {
            switch (store.groupBy) {
                case 1:
                    return _.groupBy(data, (superpixel) => {
                        return this.imageItemsById[superpixel.imageId].name;
                    });
                case 2:
                    return _.groupBy(data, (superpixel) => {
                        return store.categories[superpixel.selectedCategory].label;
                    });
                case 3:
                    return _.groupBy(data, (superpixel) => {
                        const { selectedCategory, prediction } = superpixel;
                        const selection = superpixel.labelCategories[selectedCategory].label;
                        const predicted = superpixel.predictionCategories[prediction].label;
                        return selection === predicted ? 'Agree' : 'Disagree';
                    });
                default:
                    return { data };
            }
        },
        categoryColor(superpixel) {
            return store.categories[superpixel.selectedCategory].fillColor;
        },
        triggerRetrain() {
            this.backboneParent.retrain();
        },
        mouseMove(event) {
            if (!this.isResizing) {
                return;
            }
            const container = document.getElementById('activeLearningContainer');
            const bounds = container.getBoundingClientRect();
            const resizableContainer = document.getElementById('resizable');
            resizableContainer.style.height = `${bounds.height - event.clientY}px`;
        },
        handleMenuSelection(event) {
            if (event.ctrlKey || event.shiftKey) {
                event.stopImmediatePropagation();
            }
        },
        selectAll() {
            this.selectedReviewSuperpixels = _.union(..._.values(this.filteredSortedGroupedSuperpixels));
        }
    }
});
</script>

<template>
  <div
    id="resizable"
    class="v-row review-container"
  >
    <div class="resize-handle" />
    <div
      id="settingsPanel"
      class="col-sm-3 settings-panel"
    >
      <div class="panel panel-info">
        <div
          class="panel-heading collapsible"
          data-toggle="collapse"
          href="#overview"
          @click="overviewPanelCollapsed = !overviewPanelCollapsed"
        >
          Superpixel Overview
          <i
            v-if="overviewPanelCollapsed"
            class="icon-angle-down"
          />
          <i
            v-else
            class="icon-angle-up"
          />
        </div>
        <div
          id="overview"
          class="panel-body collapse in"
          :style="[selectedSuperpixel && {'padding-bottom': '0px'}]"
        >
          <div v-if="selectedSuperpixel">
            <div
              class="panel-heading collapsible"
              @click="summaryTable = !summaryTable"
            >
              <label for="summaryTable">Summary</label>
              <i
                v-if="summaryTable"
                class="icon-angle-down"
              />
              <i
                v-else
                class="icon-angle-up"
              />
            </div>
            <table
              v-if="summaryTable"
              id="summaryTable"
              class="table table-striped"
            >
              <tbody>
                <tr>
                  <td>Slide</td>
                  <td
                    data-toggle="tooltip"
                    :title="imageItemsById[selectedSuperpixel.imageId].name"
                  >
                    {{ imageItemsById[selectedSuperpixel.imageId].name }}
                  </td>
                </tr>
                <tr>
                  <td>Predicted</td>
                  <td>{{ selectedSuperpixel.predictionCategories[selectedSuperpixel.prediction].label }}</td>
                </tr>
                <tr>
                  <td>Selected</td>
                  <td>{{ selectedSuperpixel.labelCategories[selectedSuperpixel.selectedCategory].label }}</td>
                </tr>
                <tr>
                  <td>Certainty</td>
                  <td>{{ selectedSuperpixel.certainty }}</td>
                </tr>
                <tr>
                  <td>Confidence</td>
                  <td>{{ selectedSuperpixel.confidence }}</td>
                </tr>
              </tbody>
            </table>
            <div
              class="panel-heading collapsible"
            >
              <label>Review History</label>
            </div>
          </div>
          <div v-else>
            <h5>No superpixel selected</h5>
          </div>
        </div>
      </div>
      <div class="panel panel-info">
        <div
          class="panel-heading collapsible"
          data-toggle="collapse"
          href="#categories"
          @click="categoriesPanelCollapsed = !categoriesPanelCollapsed"
        >
          Categories
          <i
            v-if="categoriesPanelCollapsed"
            class="icon-angle-down"
          />
          <i
            v-else
            class="icon-angle-up"
          />
        </div>
        <div
          id="categories"
          class="panel-body collapse in"
        >
          <active-learning-labeling />
        </div>
      </div>
      <div class="panel panel-info">
        <div
          class="panel-heading collapsible"
          data-toggle="collapse"
          href="#filters"
          @click="filtersPanelCollapsed = !filtersPanelCollapsed"
        >
          Filters
          <i
            v-if="filtersPanelCollapsed"
            class="icon-angle-down"
          />
          <i
            v-else
            class="icon-angle-up"
          />
        </div>
        <div
          id="filters"
          class="panel-body collapse in"
        >
          <div>
            <label for="groupby">Group By</label>
            <div
              id="groupby"
              class="dropdown-dropup"
            >
              <button
                class="btn btn-block btn-default dropdown-toggle drop-down-button"
                type="button"
                data-toggle="dropdown"
              >
                {{ groupByOptions[groupBy] }}
                <span class="caret" />
              </button>
              <ul class="dropdown-menu">
                <li
                  v-for="[key, value] in Object.entries(groupByOptions)"
                  :key="key"
                >
                  <div class="radio">
                    <label class="options">
                      <input
                        v-model="groupBy"
                        type="radio"
                        :value="parseInt(key)"
                        class="hidden-radio"
                      >
                      {{ value }}
                    </label>
                  </div>
                </li>
              </ul>
            </div>
          </div>
          <div>
            <label for="sortby">Sort By</label>
            <div
              id="sortby"
              class="dropdown-dropup sort-by-selector"
            >
              <button
                class="btn btn-block btn-default dropdown-toggle drop-down-button"
                type="button"
                data-toggle="dropdown"
              >
                {{ sortByOptions[sortBy] }}
                <span class="caret" />
              </button>
              <ul class="dropdown-menu">
                <li
                  v-for="[key, value] in Object.entries(sortByOptions)"
                  :key="key"
                >
                  <div class="radio">
                    <label class="options">
                      <input
                        v-model="sortBy"
                        type="radio"
                        :value="parseInt(key)"
                        class="hidden-radio"
                      >
                      {{ value }}
                    </label>
                  </div>
                </li>
              </ul>
              <button @click="sortAscending = !sortAscending">
                <i
                  v-if="sortAscending"
                  class="icon-sort-alt-up"
                  data-toggle="tooltip"
                  title="Sort descending"
                />
                <i
                  v-else
                  class="icon-sort-alt-down"
                  data-toggle="tooltip"
                  title="Sort ascending"
                />
              </button>
            </div>
          </div>
          <div>
            <label for="filterby">Filter By</label>
            <i
              class="icon-help-circled text-info"
              data-toggle="tooltip"
              title="Use ctrl+left-click to de-select an item."
            />
            <div
              id="filterby"
              :style="{'position': 'relative'}"
              class="dropdown-dropup sort-by-selector"
            >
              <button
                class="btn btn-default dropdown-toggle drop-down-button"
                type="button"
                data-toggle="dropdown"
                :style="{'width': 'calc(100% - 36px)'}"
              >
                <span
                  class="filter-text"
                  data-toggle="tooltip"
                  :title="filterBy.join(',') || '(None)'"
                >
                  {{ filterBy.join(',') || '(None)' }}
                </span>
                <span class="caret" />
              </button>
              <select
                v-model="filterBy"
                class="dropdown-menu dropdown-menu-block form-control input-sm"
                multiple
                @click="handleMenuSelection"
              >
                <optgroup
                  v-for="label in Object.keys(filterOptions)"
                  :key="label"
                  :label="label"
                >
                  <option
                    v-for="item, index in filterOptions[label]"
                    :key="`${index}_${label}`"
                    :value="item"
                  >
                    {{ item }}
                  </option>
                </optgroup>
              </select>
              <button
                @click="filterBy = []"
                :style="{'width': '36px'}"
              >
                <i
                  class="icon-ccw"
                  data-toggle="tooltip"
                  title="Clear all filters"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="panel panel-info">
        <div
          class="panel-heading collapsible"
          data-toggle="collapse"
          href="#view"
          @click="viewPanelCollapsed = !viewPanelCollapsed"
        >
          View
          <i
            v-if="viewPanelCollapsed"
            class="icon-angle-down"
          />
          <i
            v-else
            class="icon-angle-up"
          />
        </div>
        <div
          id="view"
          class="panel-body collapse in"
        >
          <div class="preview-size-selector">
            <label for="sizeSelector">Preview Size</label>
            <input
              id="sizeSelector"
              v-model="previewSize"
              type="range"
              name="sizeSelector"
              list="markers"
              :step="0.25"
              :min="0.25"
              :max="1.0"
            >
            <datalist id="markers">
              <option :value="0.25" />
              <option :value="0.50" />
              <option :value="0.75" />
              <option :value="1.00" />
            </datalist>
          </div>
          <div>
            <div
              class="btn btn-primary btn-block"
              @click="dataSelectMenu = !dataSelectMenu"
            >
              <span class="multiselect-dropdown-label">
                Superpixel Data
                <span class="caret" />
              </span>
            </div>
            <ul
              class="multiselect-dropdown-items"
              :style="[dataSelectMenu ? {'display': 'flex'} : {'display': 'none'}]"
            >
              <li>
                <input
                  v-model="cardDetails"
                  type="checkbox"
                  value="selectedCategory"
                >Class Name
              </li>
              <li>
                <input
                  v-model="cardDetails"
                  type="checkbox"
                  value="confidence"
                >Confidence
              </li>
              <li>
                <input
                  v-model="cardDetails"
                  type="checkbox"
                  value="certainty"
                >Certainty
              </li>
              <li>
                <input
                  v-model="cardDetails"
                  type="checkbox"
                  value="prediction"
                >Prediction
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="panel panel-info">
        <div
          class="panel-heading collapsible"
          data-toggle="collapse"
          href="#bulk"
          @click="bulkPanelCollapsed = !bulkPanelCollapsed"
        >
          Bulk Actions
          <i
            v-if="bulkPanelCollapsed"
            class="icon-angle-down"
          />
          <i
            v-else
            class="icon-angle-up"
          />
        </div>
        <div
          id="bulk"
          class="panel-body collapse in"
        >
          <div class="bulk-buttons">
            <button
              type="button"
              class="btn btn-primary btn-group-three"
              @click="selectingSuperpixels = !selectingSuperpixels"
            >
              Bulk Review
            </button>
            <button
              type="button"
              class="btn btn-success btn-group-three"
              :disabled="!selectingSuperpixels"
              @click="selectAll"
            >
              Select All
            </button>
            <button
              type="button"
              class="btn btn-warning btn-group-three"
              :disabled="!selectingSuperpixels"
              @click="selectedReviewSuperpixels = []"
            >
              Clear Selections
            </button>
          </div>
          <div class="bulk-buttons">
            <button
              type="button"
              class="btn btn-success btn-group-two"
              :disabled="selectedReviewSuperpixels.length < 1"
            >
              Approve
            </button>
            <div class="dropdown-dropup btn-group-two">
              <button
                class="btn btn-primary dropdown-toggle btn-block"
                :style="{'text-wrap': 'pretty'}"
                type="button"
                data-toggle="dropdown"
                :disabled="selectedReviewSuperpixels.length < 1"
              >
                Change Class
                <span class="caret" />
              </button>
              <ul
                class="dropdown-menu"
                :style="{'min-width': 'auto'}"
              >
                <li>
                  <div class="radio">
                    <label class="options">
                      <input
                        type="radio"
                        class="hidden-radio"
                      >
                      Clear Review
                    </label>
                  </div>
                </li>
                <li
                  v-for="category, index in predictionCategoryLabels"
                  :key="index"
                >
                  <div class="radio">
                    <label class="options">
                      <input
                        type="radio"
                        class="hidden-radio"
                      >
                      {{ category }}
                    </label>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div
      id="chipsContainer"
      class="col-sm-9 chips-container"
    >
      <div id="superpixelChips">
        <div
          v-for="[key, value] in Object.entries(filteredSortedGroupedSuperpixels)"
          :key="key"
        >
          <h4
            v-if="groupBy !== 0"
            :class="[groupBy === 2 && 'group-header']"
            :style="[{'margin-left': '5px'}]"
          >
            {{ key }} ({{ value.length }})
            <i
              v-if="groupBy === 2"
              class="icon-blank"
              :class="[groupBy === 2 && 'group-icon']"
              :style="{'background-color': categoryColor(value[0])}"
            />
          </h4>
          <hr v-if="groupBy !== 0">
          <div class="panel-content-cards">
            <div
              v-for="superpixel, index in value.slice(0, sliceValue)"
              :key="index"
              :class="[
                'h-superpixel-card',
                groupBy === 2 ? 'grouped' : 'ungrouped',
                superpixel === selectedSuperpixel && 'selected-superpixel',
                cardDetails.length > 0 && 'h-superpixel-card-detailed'
              ]"
              :style="[groupBy !== 2 && {'border-color': categoryColor(superpixel)}]"
            >
              <active-learning-review-card
                :style="{'position': 'relative'}"
                :superpixel="superpixel"
                :preview-size="parseFloat(previewSize)"
                :card-details="cardDetails"
                data-toggle="modal"
                data-target="#context"
                @click.native="selectedSuperpixel = superpixel"
              />
              <div
                v-if="!!superpixel.reviewCategory"
                class="flag chip-overlay"
                :style="{'left': '-2px'}"
              >
                <i
                  class="icon-user"
                  :style="{'color': 'white'}"
                />
              </div>
              <input
                v-show="selectingSuperpixels"
                v-model="selectedReviewSuperpixels"
                type="checkbox"
                class="chip-overlay"
                :style="{'right': '0px'}"
                :value="superpixel"
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review-container {
  position: absolute;
  bottom: 0px;
  right: 0px;
  left: 0px;
  height: 80%;
  width: 100%;
  z-index: 100;
  background-color: #fff;
  display: flex;
  max-height: 95vh;
  min-height: 10vh;
}

.settings-panel {
  padding: 5px;
  border-right: solid 1px lightgray;
  overflow-y: scroll;
}

.dropdown-menu {
  width: 100%;
  top: auto;
}

.dropdown-menu-block {
  padding-left: 10px;
  min-height: 150px;
}

.panel-content-cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-evenly;
  align-content: flex-start;
  height: 100%;
}

.group-header {
  display: flex;
  align-items: center;
}

.group-icon {
  height: 20px;
  width: 20px;
  margin-left: 5px;
}

.sort-by-selector {
  display: flex;
  align-items: stretch;
}

.drop-down-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filter-text {
  text-overflow: ellipsis;
  overflow: hidden;
}

.bulk-buttons {
  margin-bottom: 5px;
  display: flex;
  justify-content: space-between;
}

.btn-group-two {
  width: 49.5%;
}

.btn-group-three {
  width: 33%;
}

.preview-size-selector {
  margin-bottom: 5px;
}

.chips-container {
  overflow-y: auto;
  padding: 5px;
}

.resize-handle {
  height: 10px;
  width: 100%;
  background: #d9edf7;
  position: absolute;
  top: -5px;
  left: 0;
  cursor: row-resize;
  z-index: 10;
  opacity: 0;
}

.resize-handle:hover {
  animation: fade-in 0.3s linear;
  opacity: 1;
}

.collapsible {
  padding: 5px;
  display: flex;
  justify-content: space-between;
}

.multiselect-dropdown-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.multiselect-dropdown-items {
  padding: 5px;
  border: 1px solid #ccc;
  position: absolute;
  background: white;
  color: black;
  flex-direction: column;
  align-items: flex-start;
  left: 20px;
  width: 90%;
  z-index: 1;
}

.multiselect-dropdown-items li {
  list-style: none;
}

.grouped {
  border: none !important;
}

.ungrouped {
  margin: 1px;
  border-style: solid;
}

.selected-superpixel {
  box-shadow: 0 0 5px 2px rgb(255 255 0);
}

.options {
  cursor: pointer;
  width: 100%;
}

.radio {
  margin-top: auto;
  margin-bottom: auto;
  padding-top: 5px;
  padding-bottom: 5px;
}

.radio:hover {
  color: #333;
  background-color: #e6e6e6;
  border-color: #adadad;
}

.hidden-radio {
  display: none;
}

#summaryTable {
  table-layout: fixed;
}

#summaryTable td:nth-child(2) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#summaryTable td:first-child {
  width: 100px;
}

.text-info {
  opacity: 50%;
}

.chip-overlay {
  position: absolute;
  z-index: 100;
  top: -4px;
}

.flag {
    background-color: #337ab7;
    padding: 3px 3px 20px;
    clip-path: polygon(0 0, 100% 0, 100% 50%, 50% 65%, 0 50%);
    border-radius: 2px;
    float: left;
    width: 25px;
    top: -2px;
}

.h-superpixel-card {
    display: flex;
    flex-direction: column;
    background-color: white;
    border-style: solid;
    justify-content: center;
    box-sizing: content-box;
    border-width: 2px;
    margin-bottom: 3px;
    position: relative;
}

.h-superpixel-card-detailed {
    width: 150px;
    padding: 5px;
    margin-bottom: 5px;
}
</style>
