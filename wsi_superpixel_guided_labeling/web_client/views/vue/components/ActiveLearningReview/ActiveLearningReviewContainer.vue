<script>
import Vue from 'vue';
import _ from 'underscore';

import ActiveLearningReviewCard from './ActiveLearningReviewCard.vue';
import ActiveLearningReviewContext from './ActiveLearningReviewContext.vue';
import { store } from '../store.js';

const filterDefault = '-----';

export default Vue.extend({
    components: {
        ActiveLearningReviewCard,
        ActiveLearningReviewContext
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
            sortAscending: true
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
                return superpixel.agreeChoice !== undefined;
            });
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
        }
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
        }
    }
});
</script>

<template>
  <div class="panel panel-info">
    <active-learning-review-context
      id="context"
      :superpixel="selectedSuperpixel"
    />
    <div class="panel-heading">
      <div class="h-inputs row">
        <div class="col-sm-3 selector-group">
          <label
            for="groupby"
            class="col-sm-4"
          >Group By</label>
          <select
            id="groupby"
            v-model="groupBy"
            class="form-control input-sm col-sm-8"
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
        <div class="col-sm-3 selector-group">
          <label
            for="sortby"
            class="col-sm-3"
          >Sort By</label>
          <select
            id="sortby"
            v-model="sortBy"
            class="form-control input-sm col-sm-8"
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
          <div class="col-sm-1">
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
        <div class="col-sm-3 selector-group">
          <label
            for="filterby"
            class="col-sm-3"
          >Filter By</label>
          <div
            id="filterby"
            class="col-sm-9"
          >
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
        <div class="col-sm-2 selector-group">
          <label
            for="sizeSelector"
            class="col-sm-6"
          >Chip Size</label>
          <select
            id="sizeSelector"
            v-model="previewSize"
            class="form-control input-sm col-sm-6"
          >
            <option :value="0.1">
              10%
            </option>
            <option :value="0.2">
              20%
            </option>
            <option :value="0.3">
              30%
            </option>
            <option :value="0.4">
              40%
            </option>
            <option :value="0.5">
              50%
            </option>
            <option :value="0.6">
              60%
            </option>
            <option :value="0.7">
              70%
            </option>
            <option :value="0.8">
              80%
            </option>
            <option :value="0.9">
              90%
            </option>
            <option :value="1.0">
              100%
            </option>
          </select>
        </div>
        <div class="h-form-buttons col-sm-1">
          <button
            class="btn btn-primary btn-sm btn-block"
            @click="triggerRetrain"
          >
            Retrain
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="groupBy !== 0"
      class="panel-content"
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
            :style="[groupBy === 2 ? {'border': 'none'} : {'border-color': categoryColor(superpixel)}]"
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
      class="panel-content panel-content-cards"
    >
      <active-learning-review-card
        v-for="superpixel, index in filterAndSort(superpixelsForReview)"
        :key="index"
        :style="{'border-color': categoryColor(superpixel)}"
        :superpixel="superpixel"
        :preview-size="parseFloat(previewSize)"
        data-toggle="modal"
        data-target="#context"
        @click.native="selectedSuperpixel = superpixel"
      />
    </div>
  </div>
</template>

<style scoped>
.h-inputs {
  display: flex;
  align-items: flex-end;
}

.h-form-buttons {
  display: flex;
  justify-content: center;
}

.panel-content {
  height: 85vh;
  overflow-y: scroll;
  padding-bottom: 30px;
}

.panel-content-cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-content: flex-start;
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

.selector-group {
  display: flex;
  align-items: baseline;
  justify-content: space-evenly;
}

.drop-down-container {
  width: 100%;
  text-align: end;
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
</style>
