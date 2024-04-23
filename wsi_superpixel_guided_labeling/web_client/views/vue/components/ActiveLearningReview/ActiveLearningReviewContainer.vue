<script>
import Vue from 'vue';
import _ from 'underscore';

import ActiveLearningReviewCard from './ActiveLearningReviewCard.vue';
import ActiveLearningLabeling from '../ActiveLearningLabeling.vue';
import { store } from '../store.js';
import { viewMode } from '../constants';

const filterDefault = '-----';

export default Vue.extend({
    components: {
        ActiveLearningReviewCard,
        ActiveLearningLabeling
    },
    data() {
        return {
            groupedSuperpixels: [],
            groupBy: 0,
            sortBy: 0,
            filterBy: [filterDefault],
            previewSize: 0.5,
            viewerWidget: null,
            selectedSuperpixel: null,
            sortAscending: true,
            cardDetails: [],
            numChips: 450,
            categoriesPanelCollapsed: false,
            filtersPanelCollapsed: false,
            viewPanelCollapsed: false,
            bulkPanelCollapsed: false
        };
    },
    computed: {
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
            }).slice(0, this.numChips);
        },
        annotationsByImageId() {
            return store.annotationsByImageId;
        },
        categories() {
            return store.categories;
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
        }
    },
    watch: {
        groupBy(selection) {
            const sfr = this.superpixelsForReview;
            switch (selection) {
                case 1:
                    this.groupedSuperpixels = _.groupBy(sfr, (superpixel) => {
                        return this.imageItemsById[superpixel.imageId].name;
                    });
                    break;
                case 2:
                    this.groupedSuperpixels = _.groupBy(sfr, (superpixel) => {
                        return this.categories[superpixel.selectedCategory].label;
                    });
                    break;
                case 3:
                    this.groupedSuperpixels = _.groupBy(sfr, (superpixel) => {
                        const { selectedCategory, prediction } = superpixel;
                        return selectedCategory === prediction ? 'Agree' : 'Disagree';
                    });
                    break;
                default:
                    this.groupedSuperpixels = [];
            }
        },
        filterBy() {
            if (
                (this.filterBy.includes(filterDefault) && this.filterBy.length > 1) ||
                this.filterBy.length === 0
            ) {
                this.filterBy = [filterDefault];
            }
        },
        mode: {
            handler() {
                if (store.mode === viewMode.Review) {
                    this.updateDisplayedCards();
                }
            },
            immediate: true
        }
    },
    mounted() {
        const el = document.getElementById('chipsContainer');
        el.addEventListener('scroll', this.updateDisplayedCards);
        this.$nextTick(() => this.updateDisplayedCards());
    },
    methods: {
        sortSuperpixels(sorted) {
            switch (this.sortBy) {
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
                        return superpixel.selectedCategory === superpixel.prediction;
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
            if (this.filterBy.includes('agree')) {
                results.push(_.filter(data, (superpixel) => {
                    const { selectedCategory, prediction } = superpixel;
                    return selectedCategory === prediction;
                }));
            }
            // Filter by selections that disagree with the prediction
            if (this.filterBy.includes('disagree')) {
                results.push(_.filter(data, (superpixel) => {
                    const { selectedCategory, prediction } = superpixel;
                    return selectedCategory !== prediction;
                }));
            }
            // Filter by selected slide(s)
            const slideNames = _.pluck(this.imageItemsById, 'name');
            if (_.some(slideNames, (name) => this.filterBy.includes(name))) {
                results.push(_.filter(data, (superpixel) => {
                    const name = this.imageItemsById[superpixel.imageId].name;
                    return this.filterBy.includes(name);
                }));
            }
            // Filter by selected category(ies)
            const labels = _.map(this.categories, (category) => {
                if (category.label !== 'default') {
                    return category.label;
                }
            });
            if (_.some(labels, (label) => this.filterBy.includes(label))) {
                results.push(_.filter(data, (superpixel) => {
                    const { selectedCategory, predictionCategories } = superpixel;
                    const label = predictionCategories[selectedCategory].label;
                    return this.filterBy.includes(label);
                }));
            }
            return results.length ? _.intersection(...results) : data;
        },
        filterAndSort(data) {
            return this.sortSuperpixels(this.filterSuperpixels(data));
        },
        categoryColor(superpixel) {
            return this.categories[superpixel.selectedCategory].fillColor;
        },
        triggerRetrain() {
            this.backboneParent.retrain();
        },
        updateDisplayedCards() {
            // compute how many chips to show
            if (!document.getElementById('superpixelChips')) {
                return;
            }
            const { clientWidth, clientHeight } = document.getElementById('superpixelChips');
            const cardSize = 100 * this.previewSize;
            this.numChips = Math.floor(clientWidth / cardSize) * Math.floor(clientHeight / cardSize);
        }
    }
});
</script>

<template>
  <div class="v-row review-container">
    <div class="col-sm-3 settings-panel">
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
            <select
              id="groupby"
              v-model="groupBy"
              class="form-control input-sm"
            >
              <option :value="0">
                -----
              </option>
              <option :value="1">
                Slide
              </option>
              <option :value="2">
                Class
              </option>
              <option :value="3">
                Agree/Disagree
              </option>
            </select>
          </div>
          <div>
            <label for="sortby">Sort By</label>
            <div class="sort-by-selector">
              <select
                id="sortby"
                v-model="sortBy"
                class="form-control input-sm"
              >
                <option :value="0">
                  -----
                </option>
                <option :value="1">
                  Slide
                </option>
                <option :value="2">
                  Class
                </option>
                <option :value="3">
                  Agree/Disagree
                </option>
                <option :value="4">
                  Confidence
                </option>
                <option :value="5">
                  Certainty
                </option>
              </select>
              <button @click="sortAscending = !sortAscending">
                <i
                  v-if="sortAscending"
                  class="icon-sort-alt-up"
                />
                <i
                  v-else
                  class="icon-sort-alt-down"
                />
              </button>
            </div>
          </div>
          <div class="selector-group">
            <label for="filterby">Filter By</label>
            <div id="filterby">
              <button
                class="btn btn-default dropdown-toggle drop-down-button"
                type="button"
                data-toggle="dropdown"
              >
                <span
                  class="filter-text"
                  data-toggle="tooltip"
                  :title="filterBy.join(',')"
                >
                  {{ filterBy.join(',') }}
                </span>
                <span class="caret" />
              </button>
              <select
                v-model="filterBy"
                class="dropdown-menu form-control input-sm"
                multiple
              >
                <option value="-----">
                  -----
                </option>
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
            <div class="dropdown">
              <button
                class="btn btn-primary dropdown-toggle btn-block"
                type="button"
                data-toggle="dropdown"
              >
                Superpixel Data
                <span class="caret" />
              </button>
              <ul class="dropdown-menu dropdown-menu-block">
                <li class="checkbox">
                  <label><input
                    v-model="cardDetails"
                    type="checkbox"
                    :value="0"
                  >Class Name</label>
                </li>
                <li class="checkbox">
                  <label><input
                    v-model="cardDetails"
                    type="checkbox"
                    :value="1"
                  >Prediction</label>
                </li>
                <li class="checkbox">
                  <label><input
                    v-model="cardDetails"
                    type="checkbox"
                    :value="2"
                  >Selection</label>
                </li>
                <li class="checkbox">
                  <label><input
                    v-model="cardDetails"
                    type="checkbox"
                    :value="3"
                  >Confidence</label>
                </li>
                <li class="checkbox">
                  <label><input
                    v-model="cardDetails"
                    type="checkbox"
                    :value="4"
                  >Certainty</label>
                </li>
              </ul>
            </div>
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
              class="btn btn-primary btn-block"
            >
              Select Superpixels
            </button>
          </div>
          <div class="bulk-buttons">
            <button
              type="button"
              class="btn btn-danger btn-half-block"
              disabled
            >
              Reject Selected
            </button>
            <button
              type="button"
              class="btn btn-success btn-half-block"
              disabled
            >
              Approve Selected
            </button>
          </div>
          <div>
            <div class="dropdown">
              <button
                class="btn btn-primary dropdown-toggle btn-block"
                type="button"
                data-toggle="dropdown"
                disabled
              >
                Change Class
                <span class="caret" />
              </button>
              <ul class="dropdown-menu dropdown-menu-block">
                <li><a href="#">background</a></li>
                <li><a href="#">tissue</a></li>
                <li><a href="#">marker</a></li>
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
      <div
        v-if="groupBy !== 0"
        id="superpixelChips"
      >
        <div
          v-for="[key, value] in Object.entries(groupedSuperpixels)"
          :key="key"
        >
          <h4
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
          <hr>
          <div class="panel-content-cards">
            <active-learning-review-card
              v-for="superpixel, index in filterAndSort(value)"
              :key="index"
              :style="[groupBy === 2 ? {'border': 'none'} : {'border-color': categoryColor(superpixel), 'margin': '5px'}]"
              :superpixel="superpixel"
              :preview-size="parseFloat(previewSize)"
              data-toggle="modal"
              data-target="#context"
              @click.native="selectedSuperpixel = superpixel"
            />
          </div>
        </div>
      </div>
      <div
        v-else
        id="superpixelChips"
        class="panel-content-cards"
      >
        <active-learning-review-card
          v-for="superpixel, index in filterAndSort(superpixelsForReview)"
          :key="index"
          :style="{'border-color': categoryColor(superpixel), 'margin': '5px'}"
          :superpixel="superpixel"
          :preview-size="parseFloat(previewSize)"
          data-toggle="modal"
          data-target="#context"
          @click.native="selectedSuperpixel = superpixel"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.review-container {
  position: fixed;
  bottom: 0;
  height: 80%;
  width: 100%;
  z-index: 100;
  background-color: #fff;
  display: flex;
}

.settings-panel {
  padding: 5px;
  border-right: solid 1px lightgray;
}

.dropdown-menu-block {
  width: 100%;
  padding-left: 10px;
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

.btn-half-block {
  width: 49%;
}

.preview-size-selector {
  margin-bottom: 5px;
}

.chips-container {
  overflow-y: auto;
}

.collapsible {
  padding: 5px;
  text-align-last: justify;
}
</style>
