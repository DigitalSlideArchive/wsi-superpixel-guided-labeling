<script>
import Vue from 'vue';
import _ from 'underscore';

import ActiveLearningReviewCard from './ActiveLearningReviewCard.vue';
import ActiveLearningLabeling from '../ActiveLearningLabeling.vue';
import { store } from '../store.js';
import { groupByOptions, sortByOptions } from '../constants';
import { updateMetadata } from '../utils.js';

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
            sortingPanelCollapsed: false,
            filtersPanelCollapsed: false,
            viewPanelCollapsed: false,
            bulkPanelCollapsed: false,
            overviewPanelCollapsed: false,
            isResizing: false,
            dataSelectMenu: false,
            sliceValue: 1,
            selectingSuperpixels: false,
            summaryTable: true,
            scrollObserver: null,
            observedSuperpixel: null,
            totalSuperpixels: 0,
            reviewTable: true,
            openMenu: null
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
            const meta = _.compact(_.pluck(this.superpixelsForReview, 'meta'));
            const labelers = _.groupBy(meta, (entry) => entry.labeler && entry.labeler._id);
            const reviewers = _.groupBy(meta, (entry) => entry.reviewer && entry.reviewer._id);
            return {
                Slides: slides,
                Labels: categories,
                Reviews: categories,
                Labelers: _.omit(labelers, [undefined, null]),
                Reviewers: _.omit(reviewers, [undefined, null])
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
        trimmedSuperpixels() {
            let sv = this.sliceValue;
            return _.mapObject(this.filteredSortedGroupedSuperpixels, (value, _key) => {
                const trimmed = value.slice(0, sv);
                sv -= trimmed.length;
                return trimmed;
            });
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
            store.reviewSuperpixel = this.selectedSuperpixel || null;
        },
        filteredSortedGroupedSuperpixels(data) {
            if (this.observedSuperpixel) {
                this.scrollObserver.unobserve(this.observedSuperpixel);
            }
            const filteredContainsSelected = _.findWhere(data, this.selectedSuperpixel);
            if (!filteredContainsSelected) {
                // If the selected superpixel has been filtered out fall back to the first available
                this.selectedSuperpixel = _.values(data)[0][0];
            }
            this.$nextTick(() => this.updateObserved());
        }
    },
    mounted() {
        // Support infinite scrolling
        this.scrollObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                const updateNeeded = !this.observedSuperpixel || this.sliceValue < this.totalSuperpixels;
                if (entry.isIntersecting && updateNeeded) {
                    this.sliceValue += 10;
                    this.$nextTick(() => this.updateObserved());
                }
            });
        }, {
            root: document.getElementById('chipsContainer'),
            rootMargin: '0px',
            threshold: 0.1
        });
        this.updateObserved();

        // Make sure menus are always visible when opened
        const menuObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                const parent = entry.target.closest('.dropdown-dropup');
                if (parent) {
                    if (entry.isIntersecting) {
                        const hidden = entry.rootBounds.bottom < entry.boundingClientRect.bottom;
                        hidden ? entry.target.classList.add('dropup-adjustment') : entry.target.classList.add('dropdown-adjustment');
                        hidden ? parent.classList.add('dropup') : parent.classList.add('dropdown');
                    } else {
                        entry.target.classList.remove('dropdown-adjustment', 'dropup-adjustment');
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
        this.backboneParent.getCurrentUser();
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
            // Filter by selected slide(s)
            const slideNames = _.pluck(this.imageItemsById, 'name');
            if (_.some(slideNames, (name) => store.filterBy.includes(name))) {
                results.push(_.filter(data, (superpixel) => {
                    const name = this.imageItemsById[superpixel.imageId].name;
                    return store.filterBy.includes(name);
                }));
            }
            // Filter by selected category(ies)
            const labels = _.rest(_.pluck(this.categories, 'label'));
            // Filter by label categories
            if (_.some(labels, (label) => store.filterBy.includes(`label_${label}`))) {
                results.push(_.filter(data, (superpixel) => {
                    const { selectedCategory, labelCategories } = superpixel;
                    const label = labelCategories[selectedCategory].label;
                    return store.filterBy.includes(`label_${label}`);
                }));
            }
            // Filter by review categories
            const reviewResults = [];
            if (_.some(labels, (label) => store.filterBy.includes(`review_${label}`))) {
                reviewResults.push(..._.filter(data, (superpixel) => {
                    const { reviewValue, labelCategories } = superpixel;
                    const label = _.isNumber(reviewValue) ? labelCategories[reviewValue].label : '';
                    return store.filterBy.includes(`review_${label}`);
                }));
            }
            if (store.filterBy.includes('no review')) {
                reviewResults.push(..._.filter(data, (superpixel) => {
                    return !_.isNumber(superpixel.meta.reviewValue);
                }));
            }
            reviewResults.length && results.push(reviewResults);
            // Filter by labeler
            const labelers = this.filterOptions.Labelers;
            if (_.some(_.keys(labelers), (id) => store.filterBy.includes(`labeler_${id}`))) {
                results.push(_.filter(data, (superpixel) => {
                    const id = superpixel.meta.labeler ? superpixel.meta.labeler._id : '';
                    return store.filterBy.includes(`labeler_${id}`);
                }));
            }
            // Filter by reviewer
            const reviewers = this.filterOptions.Reviewers;
            if (_.some(_.keys(reviewers), (id) => store.filterBy.includes(`reviewer_${id}`))) {
                results.push(_.filter(data, (superpixel) => {
                    const id = superpixel.meta.reviewer ? superpixel.meta.reviewer._id : '';
                    return store.filterBy.includes(`reviewer_${id}`);
                }));
            }
            const filtered = results.length ? _.intersection(...results) : data;
            this.totalSuperpixels = filtered.length;
            return filtered;
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
        catColorByLabel(label) {
            return _.findWhere(store.categories, { label }).fillColor;
        },
        catColorByIndex(index) {
            return store.categories[index].fillColor;
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
        applyBulkReview(newValue) {
            _.forEach(this.selectedReviewSuperpixels, (superpixel) => {
                updateMetadata(superpixel, newValue, true);
            });
            _.forEach(_.keys(store.annotationsByImageId),
                (imageId) => store.backboneParent.saveAnnotationReviews(imageId));
            this.selectedReviewSuperpixels = [];
            this.selectingSuperpixels = false;
        },
        selectAll() {
            this.selectedReviewSuperpixels = _.union(..._.values(this.filteredSortedGroupedSuperpixels));
        },
        updateObserved() {
            if (this.observedSuperpixel) {
                this.scrollObserver.unobserve(this.observedSuperpixel);
            }
            this.observedSuperpixel = _.last(document.getElementsByClassName('h-superpixel-card'));
            if (this.observedSuperpixel) {
                this.scrollObserver.observe(this.observedSuperpixel);
            }
        },
        reviewInfo() {
            if (!this.selectedSuperpixel) {
                return {};
            }
            const labels = store.annotationsByImageId[this.selectedSuperpixel.imageId].labels;
            const meta = labels.get('annotation').attributes.metadata;
            return meta[this.selectedSuperpixel.index];
        },
        removeFilters(values) {
            this.filterBy = _.without(this.filterBy, ...values);
        },
        toggleOpenMenu(menu) {
            this.openMenu = this.openMenu === menu ? null : menu;
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
          Overview
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
              @click="reviewTable = !reviewTable"
            >
              <label for="reviewTable">Review History</label>
              <i
                v-if="reviewTable"
                class="icon-angle-down"
              />
              <i
                v-else
                class="icon-angle-up"
              />
            </div>
            <table
              v-if="!!selectedSuperpixel.reviewValue && reviewTable"
              id="reviewTable"
              class="table table-striped"
            >
              <tbody>
                <tr>
                  <td>Selected</td>
                  <td>{{ selectedSuperpixel.labelCategories[reviewInfo().reviewValue].label }}</td>
                </tr>
                <tr>
                  <td>Reviewer</td>
                  <td>{{ reviewInfo().reviewer.firstName }} {{ reviewInfo().reviewer.lastName }}</td>
                </tr>
                <tr>
                  <td>Date</td>
                  <td>{{ reviewInfo().reviewDate }}</td>
                </tr>
              </tbody>
            </table>
            <h6
              v-if="!selectedSuperpixel.reviewValue && reviewTable"
              id="reviewTable"
              :style="{'text-align': 'center'}"
            >
              No review history
            </h6>
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
          href="#sorting"
          @click="sortingPanelCollapsed = !sortingPanelCollapsed"
        >
          Organize
          <i
            v-if="sortingPanelCollapsed"
            class="icon-angle-down"
          />
          <i
            v-else
            class="icon-angle-up"
          />
        </div>
        <div
          id="sorting"
          class="panel-body collapse in"
        >
          <div>
            <label for="groupby">Group By</label>
            <div
              id="groupby"
              class="dropdown-dropup"
            >
              <button
                class="btn btn-block btn-default dropdown-toggle dropdown-button"
                type="button"
                data-toggle="dropdown"
              >
                {{ groupByOptions[groupBy] }}
                <span class="caret" />
              </button>
              <ul
                class="dropdown-menu"
                :style="{'top': 'auto'}"
              >
                <li
                  v-for="[key, value] in Object.entries(groupByOptions)"
                  :key="key"
                >
                  <div class="radio">
                    <label
                      :for="`${key}_group`"
                      class="options"
                    >
                      <input
                        :id="`${key}_group`"
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
              class="dropdown-dropup selector-with-button"
            >
              <button
                class="btn btn-block btn-default dropdown-toggle dropdown-button"
                type="button"
                data-toggle="dropdown"
              >
                {{ sortByOptions[sortBy] }}
                <span class="caret" />
              </button>
              <ul
                class="dropdown-menu"
                :style="{'top': 'auto'}"
              >
                <li
                  v-for="[key, value] in Object.entries(sortByOptions)"
                  :key="key"
                >
                  <div class="radio">
                    <label
                      :for="`${key}_sort`"
                      class="options"
                    >
                      <input
                        :id="`${key}_sort`"
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
              <button
                class="btn btn-info btn-sm"
                @click="sortAscending = !sortAscending"
              >
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
        </div>
      </div>
      <div class="panel panel-info">
        <div
          class="panel-heading collapsible"
          data-toggle="collapse"
          href="#filters"
          @click="filtersPanelCollapsed = !filtersPanelCollapsed"
        >
          Filter
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
            <div :style="{'display': 'flex', 'align-items': 'center', 'justify-content': 'space-between'}">
              <label for="filterby">Filter By</label>
              <button
                class="btn btn-link"
                @click="filterBy = []"
              >
                Clear All
              </button>
            </div>
            <div id="filterby">
              <div
                :style="{'position': 'relative'}"
                class="dropdown-dropup selector-with-button"
              >
                <div class="dropdown-button">
                  <div
                    class="btn btn-default btn-block"
                    @click="toggleOpenMenu('slide')"
                  >
                    <span class="multiselect-dropdown-label">
                      Slide Image
                      <span class="caret" />
                    </span>
                  </div>
                  <ul :class="['dropdown-menu', openMenu === 'slide' ? 'visible-menu' : 'hidden']">
                    <li
                      v-for="(imageName, index) in filterOptions.Slides"
                      :key="`slide_${index}`"
                    >
                      <label
                        :for="`slide_${index}`"
                        class="checkboxLabel"
                      >
                        <input
                          :id="`slide_${index}`"
                          v-model="filterBy"
                          type="checkbox"
                          :value="imageName"
                        >
                        {{ imageName }}
                      </label>
                    </li>
                  </ul>
                </div>
                <button
                  class="btn btn-danger btn-sm"
                  :disabled="!filterOptions.Slides.some(name => filterBy.includes(name))"
                  @click="removeFilters(filterOptions.Slides)"
                >
                  <i
                    class="icon-minus-squared"
                    data-toggle="tooltip"
                    title="Clear all filters"
                  />
                </button>
              </div>
              <div
                :style="{'position': 'relative'}"
                class="dropdown-dropup selector-with-button"
              >
                <div class="dropdown-button">
                  <div
                    class="btn btn-default btn-block"
                    @click="toggleOpenMenu('labels')"
                  >
                    <span class="multiselect-dropdown-label">
                      Labels
                      <span class="caret" />
                    </span>
                  </div>
                  <ul :class="['dropdown-menu', openMenu === 'labels' ? 'visible-menu' : 'hidden']">
                    <li
                      v-for="(cat, index) in filterOptions.Labels"
                      :key="`cat_${index}`"
                    >
                      <label
                        :for="`cat_${index}`"
                        class="checkboxLabel"
                      >
                        <input
                          :id="`cat_${index}`"
                          v-model="filterBy"
                          type="checkbox"
                          :value="`label_${cat}`"
                        >
                        {{ cat }}
                      </label>
                    </li>
                  </ul>
                </div>
                <button
                  class="btn btn-danger btn-sm"
                  :disabled="!filterOptions.Labels.some(cat => filterBy.includes(`label_${cat}`))"
                  @click="removeFilters(filterOptions.Labels.map(cat => `label_${cat}`))"
                >
                  <i
                    class="icon-minus-squared"
                    data-toggle="tooltip"
                    title="Clear all filters"
                  />
                </button>
              </div>
              <div
                :style="{'position': 'relative'}"
                class="dropdown-dropup selector-with-button"
              >
                <div class="dropdown-button">
                  <div
                    class="btn btn-default btn-block"
                    @click="toggleOpenMenu('reviews')"
                  >
                    <span class="multiselect-dropdown-label">
                      Reviews
                      <span class="caret" />
                    </span>
                  </div>
                  <ul :class="['dropdown-menu', openMenu === 'reviews' ? 'visible-menu' : 'hidden']">
                    <li>
                      <label
                        for="no review"
                        class="checkboxLabel"
                      >
                        <input
                          id="no review"
                          v-model="filterBy"
                          type="checkbox"
                          value="no review"
                        >
                        not reviewed
                      </label>
                    </li>
                    <li
                      v-for="(cat, index) in filterOptions.Reviews"
                      :key="`review_${index}`"
                    >
                      <label
                        :for="`review_${index}`"
                        class="checkboxLabel"
                      >
                        <input
                          :id="`review_${index}`"
                          v-model="filterBy"
                          type="checkbox"
                          :value="`review_${cat}`"
                        >
                        {{ cat }}
                      </label>
                    </li>
                  </ul>
                </div>
                <button
                  class="btn btn-danger btn-sm"
                  :disabled="!filterBy.includes('no review') && !filterOptions.Reviews.some(cat => filterBy.includes(`review_${cat}`))"
                  @click="removeFilters(['no review', ...filterOptions.Reviews.map(cat => `review_${cat}`)])"
                >
                  <i
                    class="icon-minus-squared"
                    data-toggle="tooltip"
                    title="Clear all filters"
                  />
                </button>
              </div>
              <div
                :style="{'position': 'relative'}"
                class="dropdown-dropup selector-with-button"
              >
                <div class="dropdown-button">
                  <div
                    class="btn btn-default btn-block"
                    @click="toggleOpenMenu('labeler')"
                  >
                    <span class="multiselect-dropdown-label">
                      Labeled By
                      <span class="caret" />
                    </span>
                  </div>
                  <ul :class="['dropdown-menu', openMenu === 'labeler' ? 'visible-menu' : 'hidden']">
                    <li
                      v-for="[key, value] in Object.entries(filterOptions.Labelers)"
                      :key="`labeler_${key}`"
                    >
                      <label
                        :for="`labeler_${key}`"
                        class="checkboxLabel"
                      >
                        <input
                          :id="`labeler_${key}`"
                          v-model="filterBy"
                          type="checkbox"
                          :value="`labeler_${key}`"
                        >
                        {{ value[0].labeler.firstName }} {{ value[0].labeler.lastName }}
                      </label>
                    </li>
                  </ul>
                </div>
                <button
                  class="btn btn-danger btn-sm"
                  :disabled="!Object.keys(filterOptions.Labelers).some(cat => filterBy.includes(`labeler_${cat}`))"
                  @click="removeFilters(Object.keys(filterOptions.Labelers).map((k) => `labeler_${k}`))"
                >
                  <i
                    class="icon-minus-squared"
                    data-toggle="tooltip"
                    title="Clear all filters"
                  />
                </button>
              </div>
              <div
                :style="{'position': 'relative'}"
                class="dropdown-dropup selector-with-button"
              >
                <div class="dropdown-button">
                  <div
                    class="btn btn-default btn-block"
                    @click="toggleOpenMenu('reviewer')"
                  >
                    <span class="multiselect-dropdown-label">
                      Reviewed By
                      <span class="caret" />
                    </span>
                  </div>
                  <ul :class="['dropdown-menu', openMenu === 'reviewer' ? 'visible-menu' : 'hidden']">
                    <li
                      v-for="[key, value] in Object.entries(filterOptions.Reviewers)"
                      :key="`reviewer_${key}`"
                    >
                      <label
                        :for="`reviewer_${key}`"
                        class="checkboxLabel"
                      >
                        <input
                          :id="`reviewer_${key}`"
                          v-model="filterBy"
                          type="checkbox"
                          :value="`reviewer_${key}`"
                        >
                        {{ value[0].reviewer.firstName }} {{ value[0].reviewer.lastName }}
                      </label>
                    </li>
                  </ul>
                </div>
                <button
                  class="btn btn-danger btn-sm"
                  :disabled="!Object.keys(filterOptions.Reviewers).some(k => filterBy.includes(`reviewer_${k}`))"
                  @click="removeFilters(Object.keys(filterOptions.Reviewers).map((k) => `reviewer_${k}`))"
                >
                  <i
                    class="icon-minus-squared"
                    data-toggle="tooltip"
                    title="Clear all filters"
                  />
                </button>
              </div>
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
          <div
            :style="{'position': 'relative'}"
            class="dropdown-dropup selector-with-button"
          >
            <div class="dropdown-button">
              <div
                class="btn btn-default btn-block"
                @click="toggleOpenMenu('data')"
              >
                <span class="multiselect-dropdown-label">
                  Superpixel Data
                  <span class="caret" />
                </span>
              </div>
              <ul :class="['dropdown-menu', openMenu === 'data' ? 'visible-menu' : 'hidden']">
                <li>
                  <label
                    for="className"
                    class="checkboxLabel"
                  >
                    <input
                      id="className"
                      v-model="cardDetails"
                      type="checkbox"
                      value="selectedCategory"
                    >
                    Class Name
                  </label>
                </li>
                <li>
                  <label
                    for="confidence"
                    class="checkboxLabel"
                  >
                    <input
                      id="confidence"
                      v-model="cardDetails"
                      type="checkbox"
                      value="confidence"
                    >
                    Confidence
                  </label>
                </li>
                <li>
                  <label
                    for="certainty"
                    class="checkboxLabel"
                  >
                    <input
                      id="certainty"
                      v-model="cardDetails"
                      type="checkbox"
                      value="certainty"
                    >
                    Certainty
                  </label>
                </li>
                <li>
                  <label
                    for="prediction"
                    class="checkboxLabel"
                  >
                    <input
                      id="prediction"
                      v-model="cardDetails"
                      type="checkbox"
                      value="prediction"
                    >
                    Prediction
                  </label>
                </li>
              </ul>
            </div>
            <button
              class="btn btn-success btn-xs"
              :style="{'margin-right': '3px'}"
              @click="cardDetails=['selectedCategory', 'confidence', 'certainty', 'prediction']"
            >
              <i
                class="icon-ok-squared"
                data-toggle="tooltip"
                title="Show all"
              />
            </button>
            <button
              class="btn btn-danger btn-xs"
              @click="cardDetails=[]"
            >
              <i
                class="icon-minus-squared"
                data-toggle="tooltip"
                title="Hide all"
              />
            </button>
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
              @click="() => applyBulkReview(0)"
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
                        @click="() => applyBulkReview(null)"
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
                        @click="() => applyBulkReview(index + 1)"
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
          v-for="[label, value] in Object.entries(trimmedSuperpixels)"
          :key="label"
        >
          <h4
            v-if="groupBy !== 0"
            :class="[groupBy === 2 && 'group-header']"
            :style="[{'margin-left': '5px'}]"
          >
            {{ label }} ({{ filteredSortedGroupedSuperpixels[label].length }})
            <i
              v-if="groupBy === 2"
              class="icon-blank"
              :class="[groupBy === 2 && 'group-icon']"
              :style="{'background-color': catColorByLabel(label)}"
            />
          </h4>
          <hr v-if="groupBy !== 0">
          <div class="panel-content-cards">
            <div
              v-for="superpixel, index in value"
              :key="index"
              :class="[
                'h-superpixel-card',
                groupBy === 2 ? 'grouped' : 'ungrouped',
                superpixel === selectedSuperpixel && 'selected-superpixel',
                cardDetails.length > 0 && 'h-superpixel-card-detailed'
              ]"
              :style="[groupBy !== 2 && {'border-color': catColorByIndex(superpixel.selectedCategory)}]"
            >
              <active-learning-review-card
                :style="{'position': 'relative'}"
                :superpixel="superpixel"
                :preview-size="parseFloat(previewSize)"
                :card-details="cardDetails"
                :review-value="superpixel.reviewValue"
                data-toggle="modal"
                data-target="#context"
                @click.native="selectedSuperpixel = superpixel"
              />
              <div
                v-if="!!superpixel.reviewValue"
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
  box-shadow: 3px 3px 5px 2px rgba(0, 0, 0, .5);
  border-radius: 5px;
}

.settings-panel {
  padding: 5px;
  border-right: solid 1px lightgray;
  overflow-y: scroll;
}

.dropdown-menu {
  width: calc(100% - 45px);
  top: 101%;
  left: auto;
}

.dropdown-menu-block {
  padding-left: 10px;
  min-height: 150px;
}

.panel {
  box-shadow: 1px 1px 2px 1px rgba(0, 0, 0, 0.25);
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

.selector-with-button {
  display: flex;
  margin-bottom: 3px;
}

.dropdown-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-right: 3px;
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

.dropdown-menu li {
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

.checkboxLabel {
  font-weight: normal;
  vertical-align: middle;
}

.dropdown-adjustment {
  top: 101%;
}

.dropup-adjustment {
  top: auto;
}

.visible-menu {
  display: block;
  padding: 10px 5px 5px 10px;
}
</style>
