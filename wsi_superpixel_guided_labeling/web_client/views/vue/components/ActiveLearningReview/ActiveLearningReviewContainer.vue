<script>
import Vue from 'vue';
import _ from 'underscore';

import ActiveLearningReviewCard from './ActiveLearningReviewCard.vue';
import ActiveLearningLabeling from '../ActiveLearningLabeling.vue';
import { store } from '../store.js';
import { groupByOptions, sortByOptions } from '../constants';
import { updateMetadata, rgbStringToArray, isValidNumber } from '../utils.js';

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
            openMenu: null,
            labelFlag: false,
            showFlags: false,
            currentMetadata: null,
            filteredSortedGroupedSuperpixels: new Map(),
            groupBy: 0,
            sortBy: 0,
            previewSize: 0.5,
            cardDetails: [],
            firstComparison: null,
            secondComparison: null,
            booleanOperator: null,
            filtersAllLabels: true,
            filtersAllReviews: false
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
        superpixelsForReview() {
            if (store.backboneParent) {
                return store.backboneParent.superpixelPredictionsData;
            }
            return [];
        },
        annotationsByImageId() {
            return store.annotationsByImageId;
        },
        categories() {
            return store.categories;
        },
        categoryLabels() {
            return _.pluck(store.categories, 'label');
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
            const categories = _.pluck(store.categories, 'label');
            const predictions = categories.slice(1);
            const slides = Object.keys(store.annotationsByImageId).map((imageId) => {
                return this.imageItemsById[imageId].name;
            });
            const meta = _.compact(_.pluck(this.superpixelsForReview, 'meta'));
            const labelers = _.compact(_.uniq(_.pluck(meta, 'labeler').concat(store.currentUser)));
            const reviewers = _.compact(_.uniq(_.pluck(meta, 'reviewer').concat(store.currentUser)));
            return {
                Slides: slides,
                Predictions: predictions,
                Labels: categories,
                Reviews: categories,
                Labelers: labelers,
                Reviewers: reviewers
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
        trimmedSuperpixels() {
            let sv = this.sliceValue;
            const slicedMap = new Map();
            this.filteredSortedGroupedSuperpixels.forEach((value, key) => {
                const trimmed = value.slice(0, sv);
                sv -= trimmed.length;
                slicedMap.set(key, trimmed);
            });
            return slicedMap;
        },
        filterBy: {
            get() { return store.filterBy; },
            set(value) { store.filterBy = value; }
        },
        userNames() {
            return store.userNames;
        },
        userSelections() {
            return [
                ...store.filterBy,
                ...this.sortBy,
                ...this.groupBy
            ];
        },
        reviewChangeLog() {
            return store.reviewChangeLog;
        },
        comparisonSelections() {
            return [this.firstComparison, this.booleanOperator, this.secondComparison];
        }
    },
    watch: {
        selectedSuperpixel() {
            if (!this.selectedSuperpixel) {
                return;
            }
            const { meta } = this.selectedSuperpixel;
            store.reviewSuperpixel = this.selectedSuperpixel || null;
            this.currentMetadata = meta;
        },
        filteredSortedGroupedSuperpixels(data) {
            if (this.observedSuperpixel) {
                this.scrollObserver.unobserve(this.observedSuperpixel);
            }
            if (this.selectedSuperpixel && !this.filterSuperpixels([this.selectedSuperpixel]).length) {
                // The selected superpixel has been filtered out; fall back to the first available
                const firstGroupValues = data.values().toArray()[0];
                if (firstGroupValues.length) {
                    this.selectedSuperpixel = firstGroupValues[0];
                }
            }
            this.$nextTick(() => this.updateObserved());
        },
        comparisonSelections(_newComps, oldComps) {
            const [oldFirst, oldBoolean] = oldComps;
            this.showFlags = !!this.firstComparison && !!this.booleanOperator;
            if (this.showFlags || (oldFirst && oldBoolean)) {
                this.updateFilteredSortedGroupedSuperpixels();
            }
        },
        userSelections() {
            this.updateFilteredSortedGroupedSuperpixels();
        },
        reviewChangeLog: {
            handler() {
                if (!store.reviewChangeLog.length) {
                    return;
                }
                const changedSuperpixel = store.reviewChangeLog.pop();
                this.updateFilteredSortedGroupedSuperpixels(changedSuperpixel);
            },
            deep: true
        },
        sortAscending() {
            let superpixels = this.filteredSortedGroupedSuperpixels;
            if (this.groupBy === this.sortBy) {
                superpixels = this.sortMapByKeys(superpixels);
            }
            this.filteredSortedGroupedSuperpixels = (
                [...superpixels].reduce((acc, [key, value]) => {
                    acc.set(key, value.reverse());
                    return acc;
                }, new Map()));
        },
        filtersAllLabels: {
            handler() {
                if (_.isNull(this.filtersAllLabels)) {
                    return;
                }

                const labels = store.categories.slice(1).map((cat) => `label_${cat.label}`);
                if (this.filtersAllLabels) {
                    const allValues = new Set([...store.filterBy, ...labels]);
                    store.filterBy = Array.from(allValues);
                } else {
                    store.filterBy = store.filterBy.filter((value) => !labels.includes(value));
                }
            },
            immediate: true
        },
        filtersAllReviews() {
            if (_.isNull(this.filtersAllReviews)) {
                return;
            }

            const reviews = store.categories.map((cat) => `review_${cat.label}`);
            if (this.filtersAllReviews) {
                const allValues = new Set([...store.filterBy, ...reviews]);
                store.filterBy = Array.from(allValues);
            } else {
                store.filterBy = store.filterBy.filter((value) => !reviews.includes(value));
            }
        },
        filterBy(newList, oldList) {
            const [first, second] = newList.length > oldList.length ? [newList, oldList] : [oldList, newList];
            const changed = _.difference(first, second)[0];
            const labels = store.categories.slice(1).map((cat) => `label_${cat.label}`);
            const reviews = store.categories.map((cat) => `review_${cat.label}`);

            let values = null, filtersAll = null, element = null;
            if (labels.includes(changed) && _.isNull(this.filtersAllLabels)) {
                values = labels;
                filtersAll = 'filtersAllLabels';
                element = document.getElementById('cat_has_label');
            } else if (reviews.includes(changed) && _.isNull(this.filtersAllReviews)) {
                values = reviews;
                filtersAll = 'filtersAllReviews';
                element = document.getElementById('cat_has_review');
            }
            if (element) {
                // Label was selected or un-selected
                const found = values.reduce((acc, value) => {
                    acc += Number(store.filterBy.includes(value));
                    return acc;
                }, 0);
                // If all labels or no labels are selected the state should be true or false,
                // otherwise set state as indeterminate
                element.indeterminate = (found !== 0 && found !== values.length);
                if (!element.indeterminate) {
                    this[`${filtersAll}`] = (found === values.length);
                }
            }
        }
    },
    mounted() {
        this.updateFilteredSortedGroupedSuperpixels();
    },
    activated() {
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

        this.$nextTick(() => {
            const resizeHandle = document.querySelector('.resize-handle');
            resizeHandle.removeEventListener('mousedown', () => { this.isResizing = true; });
            resizeHandle.addEventListener('mousedown', () => { this.isResizing = true; });
            document.addEventListener('mousemove', this.mouseMove);
            document.addEventListener('mouseup', () => { this.isResizing = false; });
        });

        // Pre-fetch all user names
        const allUsers = [...this.filterOptions.Labelers, ...this.filterOptions.Reviewers];
        _.uniq(allUsers).forEach((id) => store.backboneParent.getUser(id));

        // Enable deep watcher
        // The "deep" flag is necessary to update the filtered/sorted list when
        // the label or review is changed, but in other modes this causes an
        // uneccessary slow-down. Only enable the watcher when we're in review mode.
        this.stopWatcher = this.$watch(
            'superpixelsForReview',
            () => this.updateFilteredSortedGroupedSuperpixels(),
            { deep: true }
        );
        this.selectedSuperpixel = store.reviewSuperpixel;
        if (!this.selectedSuperpixel && this.filteredSortedGroupedSuperpixels.size) {
            const values = this.filteredSortedGroupedSuperpixels.values().toArray();
            this.selectedSuperpixel = values[0][0];
        }
    },
    deactivated() {
        this.selectedSuperpixel = null;
        document.removeEventListener('mousemove', this.mouseMove);
        document.removeEventListener('mouseup', () => { this.isResizing = false; });
        // Disable deep watcher
        if (this.stopWatcher) {
            this.stopWatcher();
            this.stopWatcher = null;
        }
    },
    methods: {
        /**********************************************************************
         * Sort superpixels based on the selected sorting options
         *********************************************************************/
        sortBySlideName(sorted) {
            return _.sortBy(sorted, (superpixel) => {
                return this.imageItemsById[superpixel.imageId].name;
            });
        },
        sortByLabelCategory(sorted) {
            return _.sortBy(sorted, 'selectedCategory');
        },
        sortByPredictionCategory(sorted) {
            return _.sortBy(sorted, 'prediction');
        },
        sortByReviewCategory(sorted) {
            return _.sortBy(sorted, 'reviewValue');
        },
        sortByConfidence(sorted) {
            return _.sortBy(sorted, 'confidence');
        },
        sortByCertainty(sorted) {
            return _.sortBy(sorted, 'certainty');
        },
        sortMapByKeys(map) {
            if (this.groupBy === 0) {
                return map;
            }

            const sortedMap = new Map();
            // Sort keys alphabetically by default
            let sortedKeys = map.keys().toArray().sort();
            if (!this.sortAscending) {
                sortedKeys = sortedKeys.reverse();
            }
            sortedKeys.forEach((key) => sortedMap.set(key, map.get(key)));
            return sortedMap;
        },
        sortSuperpixels(sorted) {
            switch (this.sortBy) {
                case 1:
                    sorted = this.sortBySlideName(sorted);
                    break;
                case 2:
                    sorted = this.sortByLabelCategory(sorted);
                    break;
                case 3:
                    sorted = this.sortByPredictionCategory(sorted);
                    break;
                case 4:
                    sorted = this.sortByReviewCategory(sorted);
                    break;
                case 5:
                    sorted = this.sortByConfidence(sorted);
                    break;
                case 6:
                    sorted = this.sortByCertainty(sorted);
                    break;
                default:
                    sorted = _.sortBy(sorted, 'index');
            }

            if (!this.sortAscending) {
                sorted = sorted.reverse();
            }
            return sorted;
        },
        /**********************************************************************
         * Filter superpixels based on the selected filter options
         *********************************************************************/
        filterBySlideName(data, filterBy) {
            // Filter by selected slide(s)
            return data.filter((superpixel) => {
                const name = this.imageItemsById[superpixel.imageId].name;
                return filterBy.indexOf(name) > -1;
            });
        },
        filterByLabelCategory(data, filterBy) {
            // Filter by selected label categories
            return data.filter((superpixel) => {
                const { selectedCategory, labelCategories } = superpixel;
                const label = labelCategories[selectedCategory].label;
                return filterBy.indexOf(label) > -1;
            });
        },
        filterByReviewCategory(data, filterBy) {
            // Filter by review categories
            let reviewResults = [];
            if (filterBy.length > -1) {
                reviewResults = reviewResults.concat(data.filter((superpixel) => {
                    const { reviewValue, labelCategories } = superpixel;
                    const label = isValidNumber(reviewValue) ? labelCategories[reviewValue].label : '';
                    return filterBy.indexOf(label) > -1;
                }));
            }
            if (store.filterBy.indexOf('no review') > -1) {
                reviewResults = reviewResults.concat(data.filter((superpixel) => {
                    return !isValidNumber(superpixel.reviewValue);
                }));
            }
            return reviewResults;
        },
        filterByLabeler(data, filterBy) {
            // Filter by labeler
            return data.filter((superpixel) => {
                const id = superpixel.meta ? superpixel.meta.labeler : '';
                return filterBy.indexOf(id) > -1;
            });
        },
        filterByReviewer(data, filterBy) {
            // Filter by reviewer
            return data.filter((superpixel) => {
                const id = superpixel.meta ? superpixel.meta.reviewer : '';
                return isValidNumber(superpixel.reviewValue) && filterBy.indexOf(id) > -1;
            });
        },
        filterByComparison(data) {
            const assignKeysAndIds = (selection) => {
                // Find the keys we'll need to get the data
                // requested for comparison
                if (!selection) return [null, null, null];

                let [valueKey, userKey] = [null, null];
                const [prefix, userId] = selection.split('_');
                if (prefix === 'prediction') {
                    valueKey = 'prediction';
                } else if (prefix === 'label') {
                    valueKey = 'selectedCategory';
                    if (userId) {
                        userKey = 'labeler';
                    }
                } else if (prefix === 'review') {
                    valueKey = 'reviewValue';
                    if (userId) {
                        userKey = 'reviewer';
                    }
                }
                return [valueKey, userKey, userId];
            };

            // Find the specifc keys we need to fit the user requested comparison(s)
            const [firstValueKey, firstUserKey, firstUserId] = assignKeysAndIds(this.firstComparison);
            let [secondValueKey, secondUserKey, secondUserId] = assignKeysAndIds(this.secondComparison);
            let thirdValueKey = null;
            if (!secondValueKey) {
                // If no second value is selected we want *anything* that matches
                [secondValueKey, thirdValueKey] = _.without(['prediction', 'selectedCategory', 'reviewValue'], firstValueKey);
            }

            const getLabel = (valueKey, userKey, userId, superpixel) => {
                // We don't want to assume that indices will always be in-sync across
                // prediction and label name mapping. Instead, find the string label.
                if (!userKey || (superpixel.meta && superpixel.meta[userKey] === userId)) {
                    const { labelCategories, predictionCategories } = superpixel;
                    const categories = valueKey === 'prediction' ? predictionCategories : labelCategories;
                    const value = superpixel[valueKey];
                    return isValidNumber(value) ? categories[value].label : null;
                }
                return null;
            };
            return data.filter((superpixel) => {
                const op = this.booleanOperator === 'matches' ? (a, b) => a === b : (a, b) => a !== b;
                const firstLabel = getLabel(firstValueKey, firstUserKey, firstUserId, superpixel);
                const secondLabel = getLabel(secondValueKey, secondUserKey, secondUserId, superpixel);
                const thirdLabel = getLabel(thirdValueKey, null, null, superpixel);
                if (!_.isNull(firstLabel) && !_.isNull(secondLabel)) {
                    if (!_.isNull(thirdLabel)) {
                        return op(firstLabel, secondLabel) || op(firstLabel, thirdLabel);
                    }
                    return op(firstLabel, secondLabel);
                }
                return false;
            });
        },
        filterByPredictionLabel(data, filterBy) {
            // Filter by selected label categories
            return data.filter((superpixel) => {
                const { prediction, predictionCategories } = superpixel;
                const label = predictionCategories[prediction].label;
                return filterBy.indexOf(label) > -1;
            });
        },
        filterSuperpixels(data) {
            const getFilters = (prefix) => {
                return store.filterBy.reduce((acc, value) => {
                    if (value.startsWith(prefix)) {
                        acc.push(value.split('_')[1]);
                    }
                    return acc;
                }, []);
            };
            let results = data;

            let filterBy = getFilters('label_');
            if (filterBy.length > 0) {
                results = this.filterByLabelCategory(results, filterBy);
            }
            filterBy = getFilters('review_');
            if (filterBy.length > 0 || store.filterBy.indexOf('no review') > -1) {
                results = this.filterByReviewCategory(results, filterBy);
            }
            filterBy = getFilters('prediction_');
            if (filterBy.length > 0) {
                results = this.filterByPredictionLabel(results, filterBy);
            }
            const slideNames = _.pluck(this.imageItemsById, 'name');
            filterBy = store.filterBy.filter((value) => slideNames.includes(value));
            if (filterBy.length > 0) {
                results = this.filterBySlideName(results, filterBy);
            }
            if (!!this.firstComparison && !!this.booleanOperator) {
                results = this.filterByComparison(results);
            }
            filterBy = getFilters('labeler_');
            if (filterBy.length > 0) {
                results = this.filterByLabeler(results, filterBy);
            }
            filterBy = getFilters('reviewer_');
            if (filterBy.length > 0) {
                results = this.filterByReviewer(results, filterBy);
            }
            return results;
        },
        /**********************************************************************
         * Group superpixels based on the selected grouping options
         *********************************************************************/
        groupBySlideName(data) {
            return Map.groupBy(data, ({ imageId }) => {
                return this.imageItemsById[imageId].name;
            });
        },
        groupByLabelCategory(data) {
            return Map.groupBy(data, ({ selectedCategory }) => {
                return store.categories[selectedCategory].label;
            });
        },
        groupByPredictionCategory(data) {
            return Map.groupBy(data, (superpixel) => {
                return superpixel.predictionCategories[superpixel.prediction].label;
            });
        },
        groupByReviewCategory(data) {
            return Map.groupBy(data, ({ reviewValue }) => {
                if (!isValidNumber(reviewValue)) {
                    return 'default';
                }
                return store.categories[reviewValue].label;
            });
        },
        groupSuperpixels(data) {
            let groups = null;
            switch (this.groupBy) {
                case 1:
                    groups = this.groupBySlideName(data);
                    break;
                case 2:
                    groups = this.groupByLabelCategory(data);
                    break;
                case 3:
                    groups = this.groupByPredictionCategory(data);
                    break;
                case 4:
                    groups = this.groupByReviewCategory(data);
                    break;
                default:
                    groups = new Map([['data', data]]);
            }
            return this.sortMapByKeys(groups);
        },
        catColorByLabel(label) {
            const cat = _.findWhere(store.categories, { label });
            if (cat) {
                return cat.fillColor;
            }
            return 'rgb(0, 0, 0)';
        },
        catColorByIndex(index) {
            const color = store.categories[index].fillColor;
            const rgba = rgbStringToArray(color);
            if (_.last(rgba) === 0) {
                // If the color is transparent we should make it more opaque
                return `rgba(${rgba.slice(0, 3).join(', ')}, 0.5)`;
            }
            return color;
        },
        predColorByIndex(superpixel) {
            const prediction = superpixel.prediction;
            return superpixel.predictionCategories[prediction].fillColor;
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
        applyBulkReview(selectedValue) {
            const imageIds = new Set();
            this.selectedReviewSuperpixels.forEach((superpixel) => {
                const newValue = selectedValue === -1 ? superpixel.selectedCategory : selectedValue;
                updateMetadata(superpixel, newValue, true);
                imageIds.add(superpixel.imageId);
            });
            store.backboneParent.saveAnnotationMetadata(Array.from(imageIds));
            this.selectedReviewSuperpixels = [];
            this.selectingSuperpixels = false;
        },
        selectAll() {
            this.selectedReviewSuperpixels = _.union(...this.filteredSortedGroupedSuperpixels.values());
        },
        updateObserved() {
            if (this.observedSuperpixel) {
                this.scrollObserver.unobserve(this.observedSuperpixel);
            }
            this.observedSuperpixel = _.last(document.getElementsByClassName('h-superpixel-card'));
            if (this.sliceValue === 1 && this.observedSuperpixel) {
                // Make an initial estimate of how many chips to show
                const container = document.getElementById('chipsContainer');
                const containerRect = container.getBoundingClientRect();
                const cardRect = this.observedSuperpixel.getBoundingClientRect();
                this.sliceValue = Math.floor(
                    (containerRect.height * containerRect.width) / (cardRect.height * cardRect.width));
            }
            if (this.observedSuperpixel) {
                this.scrollObserver.observe(this.observedSuperpixel);
            }
        },
        removeFilters(values) {
            store.filterBy = _.without(store.filterBy, ...values);
        },
        confirmMenuFocus(event) {
            const menu = document.getElementsByClassName('visible-menu')[0];
            if (menu && !menu.contains(event.target)) {
                this.toggleOpenMenu(this.openMenu);
            }
        },
        toggleOpenMenu(menu) {
            if (this.openMenu === menu) {
                // Menu was open; closing now
                this.openMenu = null;
                document.removeEventListener('click', this.confirmMenuFocus);
            } else {
                // Menu was closed; opening now
                this.openMenu = menu;
                this.$nextTick(() => {
                    document.addEventListener('click', this.confirmMenuFocus);
                });
            }
        },
        selectedComparisonText(selection) {
            if (!selection) return selection;

            const [type, userID] = selection.split('_');
            if (!userID) return selection;

            let user = store.currentUser;
            if (!(store.currentUser === userID)) {
                const superpixel = _.find(this.superpixelsForReview, (superpixel) => {
                    if (superpixel.meta) {
                        return superpixel.meta.reviewer === userID || superpixel.meta.labeler === userID;
                    }
                    return false;
                });
                if (!superpixel) return '';

                user = superpixel.meta.labeler;
                if (!!superpixel.meta.reviewer === userID) {
                    user = superpixel.meta.reviewer;
                }
            }
            return `${store.userNames[user]} ${type}`;
        },
        updateFilteredSortedGroupedSuperpixels(changedSuperpixel) {
            this.showProgressBar();
            const superpixelsForReview = !changedSuperpixel ? this.superpixelsForReview : [changedSuperpixel];
            setTimeout(() => {
                // Make sure the DOM has been updated to display the
                // progress bar before begining the process
                const filtered = this.filterSuperpixels(superpixelsForReview);
                const data = this.groupSuperpixels(filtered);
                if (!changedSuperpixel) {
                    this.totalSuperpixels = filtered.length;
                    this.filteredSortedGroupedSuperpixels = [...data].reduce(
                        (acc, [key, value]) => {
                            acc.set(key, this.sortSuperpixels(value));
                            return acc;
                        }, new Map());
                } else {
                    // Determine if the changed superpixel needs to be removed
                    this.filteredSortedGroupedSuperpixels.forEach((values, key) => {
                        const index = values.findIndex((v) => v.index === changedSuperpixel.index);
                        if (index !== -1) values.splice(index, 1);
                    });
                    if (data.size) {
                        const [group] = data.keys().toArray();
                        const superpixels = this.filteredSortedGroupedSuperpixels.get(group);
                        let index;
                        const sortOrder = this.sortAscending ? 1 : -1;
                        const changedImageName = this.imageItemsById[changedSuperpixel.imageId].name;
                        switch (this.sortBy) {
                            case 1:
                                index = _.sortedIndex(superpixels, changedSuperpixel, (superpixel) => {
                                    const imageName = this.imageItemsById[superpixel.imageId].name;
                                    return imageName <= changedImageName * sortOrder;
                                });
                                break;
                            case 2:
                                index = _.sortedIndex(superpixels, changedSuperpixel, (superpixel) => {
                                    return superpixel.selectedCategory * sortOrder;
                                });
                                break;
                            case 3:
                                index = _.sortedIndex(superpixels, changedSuperpixel, (superpixel) => {
                                    return superpixel.prediction * sortOrder;
                                });
                                break;
                            case 4:
                                index = _.sortedIndex(superpixels, changedSuperpixel, (superpixel) => {
                                    return superpixel.confidence * sortOrder;
                                });
                                break;
                            case 5:
                                index = _.sortedIndex(superpixels, changedSuperpixel, (superpixel) => {
                                    return superpixel.certainty * sortOrder;
                                });
                                break;
                            default:
                                index = _.sortedIndex(superpixels, changedSuperpixel, (superpixel) => {
                                    return superpixel.index * sortOrder;
                                });
                        }
                        // Use "set" rather than just using "splice" so that we trigger the watcher
                        // and update the displayed superpixels
                        superpixels.splice(index, 0, changedSuperpixel);
                    }
                    this.filteredSortedGroupedSuperpixels = new Map(this.filteredSortedGroupedSuperpixels);
                }
                if (!this.selectedSuperpixel && this.filteredSortedGroupedSuperpixels.has('data')) {
                    this.selectedSuperpixel = this.filteredSortedGroupedSuperpixels.get('data')[0];
                }
                this.$nextTick(() => this.hideProgressBar());
            }, 0);
        },
        showProgressBar() {
            const progressBar = document.querySelector('.progress-bar-container');
            progressBar.style.display = 'flex';
        },
        hideProgressBar() {
            const progressBar = document.querySelector('.progress-bar-container');
            progressBar.style.display = 'none';
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
                  <td>Label</td>
                  <td>{{ selectedSuperpixel.labelCategories[selectedSuperpixel.selectedCategory].label }}</td>
                </tr>
                <tr v-if="currentMetadata">
                  <td>Labeler</td>
                  <td>{{ userNames[currentMetadata.labeler] }}</td>
                </tr>
                <tr v-if="currentMetadata">
                  <td>Date</td>
                  <td>{{ currentMetadata.labelDate }}</td>
                </tr>
                <tr v-if="currentMetadata">
                  <td>Epoch</td>
                  <td>{{ currentMetadata.labelEpoch }}</td>
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
              v-if="((!!selectedSuperpixel.reviewValue) || selectedSuperpixel.reviewValue === 0) && reviewTable"
              id="reviewTable"
              class="table table-striped"
            >
              <tbody>
                <tr>
                  <td>Selected</td>
                  <td>{{ selectedSuperpixel.labelCategories[currentMetadata.reviewValue].label }}</td>
                </tr>
                <tr>
                  <td>Reviewer</td>
                  <td>{{ userNames[currentMetadata.reviewer] }}</td>
                </tr>
                <tr>
                  <td>Date</td>
                  <td>{{ currentMetadata.reviewDate }}</td>
                </tr>
                <tr>
                  <td>Epoch</td>
                  <td>{{ currentMetadata.reviewEpoch }}</td>
                </tr>
              </tbody>
            </table>
            <h6
              v-if="(!selectedSuperpixel.reviewValue && selectedSuperpixel !== 0) && reviewTable"
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
          Labels
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
              :style="{'position': 'relative'}"
              class="dropdown-dropup selector-with-button"
            >
              <button
                class="btn btn-block btn-default dropdown-toggle dropdown-button"
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
              <button
                class="btn btn-danger btn-xs"
                :disabled="groupBy === 0"
                @click="groupBy = 0"
              >
                <i
                  class="icon-minus-squared"
                  data-toggle="tooltip"
                  title="Clear grouping"
                />
              </button>
            </div>
          </div>
          <div>
            <label for="sortby">Sort By</label>
            <div
              id="sortby"
              :style="{'position': 'relative'}"
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
              <ul class="dropdown-menu">
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
                class="btn btn-danger btn-xs"
                :style="{'margin-right': '3px'}"
                :disabled="sortBy === 0"
                @click="sortBy = 0"
              >
                <i
                  class="icon-minus-squared"
                  data-toggle="tooltip"
                  title="Clear sort"
                />
              </button>
              <button
                class="btn btn-info btn-xs"
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
              <div class="flex">
                <div
                  :style="{'position': 'relative', 'margin-right': '3px', 'width': '50%'}"
                  class="dropdown-dropup selector-with-button"
                >
                  <div class="dropdown-button">
                    <div
                      class="btn btn-default btn-block"
                      @click="toggleOpenMenu('slide')"
                      @click.stop
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
                          class="checkboxLabel options"
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
                    class="btn btn-danger btn-xs"
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
                  :style="{'position': 'relative', 'width': '50%'}"
                  class="dropdown-dropup selector-with-button"
                >
                  <div class="dropdown-button">
                    <div
                      class="btn btn-default btn-block"
                      @click="toggleOpenMenu('prediction')"
                      @click.stop
                    >
                      <span class="multiselect-dropdown-label">
                        Predictions
                        <span class="caret" />
                      </span>
                    </div>
                    <ul :class="['dropdown-menu', openMenu === 'prediction' ? 'visible-menu' : 'hidden']">
                      <li
                        v-for="(label, index) in filterOptions.Predictions"
                        :key="`prediction_${index}`"
                      >
                        <label
                          :for="`prediction_${index}`"
                          class="checkboxLabel options"
                        >
                          <input
                            :id="`prediction_${index}`"
                            v-model="filterBy"
                            type="checkbox"
                            :value="`prediction_${label}`"
                          >
                          {{ label }}
                        </label>
                      </li>
                    </ul>
                  </div>
                  <button
                    class="btn btn-danger btn-xs"
                    :disabled="!filterOptions.Predictions.some(cat => filterBy.includes(`prediction_${cat}`))"
                    @click="removeFilters(filterOptions.Labels.map(cat => `prediction_${cat}`))"
                  >
                    <i
                      class="icon-minus-squared"
                      data-toggle="tooltip"
                      title="Clear all filters"
                    />
                  </button>
                </div>
              </div>
              <div class="flex">
                <div
                  :style="{'position': 'relative', 'margin-right': '3px', 'width': '50%'}"
                  class="dropdown-dropup selector-with-button"
                >
                  <div class="dropdown-button">
                    <div
                      class="btn btn-default btn-block"
                      @click="toggleOpenMenu('labels')"
                      @click.stop
                    >
                      <span class="multiselect-dropdown-label">
                        Labels
                        <span class="caret" />
                      </span>
                    </div>
                    <ul :class="['dropdown-menu', openMenu === 'labels' ? 'visible-menu' : 'hidden']">
                      <li>
                        <label
                          for="cat_0"
                          class="checkboxLabel options"
                        >
                          <input
                            id="cat_0"
                            v-model="filterBy"
                            type="checkbox"
                            value="label_default"
                          >
                          No Label
                        </label>
                      </li>
                      <li><hr></li>
                      <li>
                        <label
                          for="cat_has_label"
                          class="checkboxLabel options"
                        >
                          <input
                            id="cat_has_label"
                            v-model="filtersAllLabels"
                            type="checkbox"
                          >
                          All Labels
                        </label>
                      </li>
                      <li
                        v-for="(cat, index) in filterOptions.Labels.slice(1)"
                        :key="`cat_${index + 1}`"
                      >
                        <label
                          :for="`cat_${index + 1}`"
                          class="checkboxLabel options"
                        >
                          <input
                            :id="`cat_${index + 1}`"
                            v-model="filterBy"
                            type="checkbox"
                            :value="`label_${cat}`"
                            @click="filtersAllLabels = null"
                          >
                          {{ cat }}
                        </label>
                      </li>
                    </ul>
                  </div>
                  <button
                    class="btn btn-danger btn-xs"
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
                  :style="{'position': 'relative', 'width': '50%'}"
                  class="dropdown-dropup selector-with-button"
                >
                  <div class="dropdown-button">
                    <div
                      class="btn btn-default btn-block"
                      @click="toggleOpenMenu('reviews')"
                      @click.stop
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
                          class="checkboxLabel options"
                        >
                          <input
                            id="no review"
                            v-model="filterBy"
                            type="checkbox"
                            value="no review"
                          >
                          No Review
                        </label>
                      </li>
                      <li><hr></li>
                      <li>
                        <label
                          for="cat_has_review"
                          class="checkboxLabel options"
                        >
                          <input
                            id="cat_has_review"
                            v-model="filtersAllReviews"
                            type="checkbox"
                          >
                          All Reviews
                        </label>
                      </li>
                      <li
                        v-for="(cat, index) in filterOptions.Reviews"
                        :key="`review_${index}`"
                      >
                        <label
                          :for="`review_${index}`"
                          class="checkboxLabel options"
                        >
                          <input
                            :id="`review_${index}`"
                            v-model="filterBy"
                            type="checkbox"
                            :value="`review_${cat}`"
                            @click="filtersAllReviews = null"
                          >
                          {{ index === 0 ? 'unlabeled' : cat }}
                        </label>
                      </li>
                    </ul>
                  </div>
                  <button
                    class="btn btn-danger btn-xs"
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
              </div>
              <div class="flex">
                <div
                  :style="{'position': 'relative', 'margin-right': '3px', 'width': '50%'}"
                  class="dropdown-dropup selector-with-button"
                >
                  <div class="dropdown-button">
                    <div
                      class="btn btn-default btn-block"
                      @click="toggleOpenMenu('labeler')"
                      @click.stop
                    >
                      <span class="multiselect-dropdown-label">
                        Labeled By
                        <span class="caret" />
                      </span>
                    </div>
                    <ul :class="['dropdown-menu', openMenu === 'labeler' ? 'visible-menu' : 'hidden']">
                      <li
                        v-for="key in filterOptions.Labelers"
                        :key="`labeler_${key}`"
                      >
                        <label
                          :for="`labeler_${key}`"
                          class="checkboxLabel options"
                        >
                          <input
                            :id="`labeler_${key}`"
                            v-model="filterBy"
                            type="checkbox"
                            :value="`labeler_${key}`"
                          >
                          {{ userNames[key] }}
                        </label>
                      </li>
                    </ul>
                  </div>
                  <button
                    class="btn btn-danger btn-xs"
                    :disabled="!filterOptions.Labelers.some(id => filterBy.includes(`labeler_${id}`))"
                    @click="removeFilters(filterOptions.Labelers.map((id) => `labeler_${id}`))"
                  >
                    <i
                      class="icon-minus-squared"
                      data-toggle="tooltip"
                      title="Clear all filters"
                    />
                  </button>
                </div>
                <div
                  :style="{'position': 'relative', 'width': '50%'}"
                  class="dropdown-dropup selector-with-button"
                >
                  <div class="dropdown-button">
                    <div
                      class="btn btn-default btn-block"
                      :disabled="!filterOptions.Reviewers.length"
                      @click="toggleOpenMenu('reviewer')"
                      @click.stop
                    >
                      <span class="multiselect-dropdown-label">
                        Reviewed By
                        <span class="caret" />
                      </span>
                    </div>
                    <ul :class="['dropdown-menu', openMenu === 'reviewer' ? 'visible-menu' : 'hidden']">
                      <li
                        v-for="key in filterOptions.Reviewers"
                        :key="`reviewer_${key}`"
                      >
                        <label
                          :for="`reviewer_${key}`"
                          class="checkboxLabel options"
                        >
                          <input
                            :id="`reviewer_${key}`"
                            v-model="filterBy"
                            type="checkbox"
                            :value="`reviewer_${key}`"
                          >
                          {{ userNames[key] }}
                        </label>
                      </li>
                    </ul>
                  </div>
                  <button
                    class="btn btn-danger btn-xs"
                    :disabled="!filterOptions.Reviewers.some(id => filterBy.includes(`reviewer_${id}`))"
                    @click="removeFilters(filterOptions.Reviewers.map((id) => `reviewer_${id}`))"
                  >
                    <i
                      class="icon-minus-squared"
                      data-toggle="tooltip"
                      title="Clear all filters"
                    />
                  </button>
                </div>
              </div>
              <label for="comp">Filter By Comparison</label>
              <div
                id="comp"
                class="flex"
              >
                <div
                  class="dropdown-dropup selector-with-button"
                  :style="{'width': '35%', 'position': 'relative'}"
                >
                  <button
                    class="btn btn-block btn-default dropdown-toggle dropdown-button"
                    type="button"
                    data-toggle="dropdown"
                  >
                    <span
                      class="overflow-text"
                      data-toggle="tooltip"
                      :title="selectedComparisonText(firstComparison) || '(None)'"
                    >
                      {{ selectedComparisonText(firstComparison) || '(None)' }}
                    </span>
                    <span class="caret" />
                  </button>
                  <ul class="dropdown-menu">
                    <li>
                      <div class="radio">
                        <label
                          for="no_selection_1"
                          class="options"
                        >
                          <input
                            id="no_selection_1"
                            v-model="firstComparison"
                            type="radio"
                            :value="null"
                            class="hidden-radio"
                          >
                          (None)
                        </label>
                      </div>
                    </li>
                    <li>
                      <div class="radio">
                        <label
                          for="prediction_comparison_1"
                          :class="['options', secondComparison === 'prediction' && 'disabled-label']"
                        >
                          <input
                            id="prediction_comparison_1"
                            v-model="firstComparison"
                            type="radio"
                            value="prediction"
                            class="hidden-radio"
                          >
                          Predictions
                        </label>
                      </div>
                    </li>
                    <li>
                      <div class="radio">
                        <label
                          for="labels_comparison_1"
                          :class="['options', secondComparison === 'label' && 'disabled-label']"
                        >
                          <input
                            id="labels_comparison_1"
                            v-model="firstComparison"
                            type="radio"
                            value="label"
                            class="hidden-radio"
                          >
                          Labels
                        </label>
                      </div>
                    </li>
                    <li>
                      <div class="radio">
                        <label
                          for="reviews_comparison_1"
                          :class="['options', secondComparison === 'reviews' && 'disabled-label']"
                        >
                          <input
                            id="reviews_comparison_1"
                            v-model="firstComparison"
                            type="radio"
                            value="review"
                            class="hidden-radio"
                          >
                          Reviews
                        </label>
                      </div>
                    </li>
                    <li
                      v-for="key in filterOptions.Labelers"
                      :key="`comp_labeler_${key}`"
                    >
                      <div class="radio">
                        <label
                          :for="`comp_labeler_${key}_1`"
                          :class="['options', secondComparison === `label_${key}` && 'disabled-label']"
                        >
                          <input
                            :id="`comp_labeler_${key}_1`"
                            v-model="firstComparison"
                            type="radio"
                            :value="`label_${key}`"
                            class="hidden-radio"
                          >
                          {{ userNames[key] }} Labels
                        </label>
                      </div>
                    </li>
                    <li
                      v-for="key in filterOptions.Reviewers"
                      :key="`comp_reviewer_${key}`"
                    >
                      <div class="radio">
                        <label
                          :for="`comp_reviewer_${key}_1`"
                          :class="['options', secondComparison === `review_${key}` && 'disabled-label']"
                        >
                          <input
                            :id="`comp_reviewer_${key}_1`"
                            v-model="firstComparison"
                            type="radio"
                            :value="`review_${key}`"
                            class="hidden-radio"
                          >
                          {{ userNames[key] }} Reviews
                        </label>
                      </div>
                    </li>
                  </ul>
                </div>
                <div
                  class="dropdown-dropup selector-with-button"
                  :style="{'width': '30%', 'position': 'relative'}"
                >
                  <button
                    class="btn btn-block btn-default dropdown-toggle dropdown-button"
                    type="button"
                    data-toggle="dropdown"
                  >
                    {{ booleanOperator || '(None)' }}
                    <span class="caret" />
                  </button>
                  <ul class="dropdown-menu">
                    <li>
                      <div class="radio">
                        <label
                          for="no_selection_2"
                          class="options"
                        >
                          <input
                            id="no_selection_2"
                            v-model="booleanOperator"
                            type="radio"
                            :value="null"
                            class="hidden-radio"
                          >
                          (None)
                        </label>
                      </div>
                    </li>
                    <li>
                      <div class="radio">
                        <label
                          for="matches"
                          class="options"
                        >
                          <input
                            id="matches"
                            v-model="booleanOperator"
                            type="radio"
                            value="matches"
                            class="hidden-radio"
                          >
                          matches
                        </label>
                      </div>
                    </li>
                    <li>
                      <div class="radio">
                        <label
                          for="differsFrom"
                          class="options"
                        >
                          <input
                            id="differsFrom"
                            v-model="booleanOperator"
                            type="radio"
                            value="differs from"
                            class="hidden-radio"
                          >
                          differs from
                        </label>
                      </div>
                    </li>
                  </ul>
                </div>
                <div
                  class="dropdown-dropup selector-with-button"
                  :style="{'width': '35%', 'position': 'relative'}"
                >
                  <button
                    class="btn btn-block btn-default dropdown-toggle dropdown-button"
                    type="button"
                    data-toggle="dropdown"
                    :disabled="!firstComparison || !booleanOperator"
                  >
                    <span
                      class="overflow-text"
                      data-toggle="tooltip"
                      :title="selectedComparisonText(secondComparison) || (!!firstComparison && !!booleanOperator ? 'Any' : '(None)')"
                    >
                      {{ selectedComparisonText(secondComparison) || (!!firstComparison && !!booleanOperator ? 'Any' : '(None)') }}
                    </span>
                    <span class="caret" />
                  </button>
                  <ul class="dropdown-menu">
                    <li>
                      <div class="radio">
                        <label
                          for="any"
                          class="options"
                        >
                          <input
                            id="any"
                            v-model="secondComparison"
                            type="radio"
                            :value="null"
                            class="hidden-radio"
                          >
                          Any
                        </label>
                      </div>
                    </li>
                    <li>
                      <div class="radio">
                        <label
                          for="prediction_comparison_2"
                          :class="['options', firstComparison === 'prediction' && 'disabled-label']"
                        >
                          <input
                            id="prediction_comparison_2"
                            v-model="secondComparison"
                            type="radio"
                            value="prediction"
                            class="hidden-radio"
                          >
                          Predictions
                        </label>
                      </div>
                    </li>
                    <li>
                      <div class="radio">
                        <label
                          for="labels_comparison_2"
                          :class="['options', firstComparison === 'label' && 'disabled-label']"
                        >
                          <input
                            id="labels_comparison_2"
                            v-model="secondComparison"
                            type="radio"
                            value="label"
                            class="hidden-radio"
                          >
                          Labels
                        </label>
                      </div>
                    </li>
                    <li>
                      <div class="radio">
                        <label
                          for="reviews_comparison_2"
                          :class="['options', firstComparison === 'reviews' && 'disabled-label']"
                        >
                          <input
                            id="reviews_comparison_2"
                            v-model="secondComparison"
                            type="radio"
                            value="review"
                            class="hidden-radio"
                          >
                          Reviews
                        </label>
                      </div>
                    </li>
                    <li
                      v-for="key in filterOptions.Labelers"
                      :key="`comp_labeler_${key}_2`"
                    >
                      <div class="radio">
                        <label
                          :for="`comp_labeler_${key}_2`"
                          :class="['options', firstComparison === `label_${key}` && 'disabled-label']"
                        >
                          <input
                            :id="`comp_labeler_${key}_2`"
                            v-model="secondComparison"
                            type="radio"
                            :value="`label_${key}`"
                            class="hidden-radio"
                          >
                          {{ userNames[key] }} Labels
                        </label>
                      </div>
                    </li>
                    <li
                      v-for="key in filterOptions.Reviewers"
                      :key="`comp_reviewer_${key}_2`"
                    >
                      <div class="radio">
                        <label
                          :for="`comp_reviewer_${key}_2`"
                          :class="['options', firstComparison === `review_${key}` && 'disabled-label']"
                        >
                          <input
                            :id="`comp_reviewer_${key}_2`"
                            v-model="secondComparison"
                            type="radio"
                            :value="`review_${key}`"
                            class="hidden-radio"
                          >
                          {{ userNames[key] }} Reviews
                        </label>
                      </div>
                    </li>
                  </ul>
                </div>
                <button
                  class="btn btn-danger btn-xs"
                  :disabled="!firstComparison && !booleanOperator && !secondComparison"
                  :style="{'margin-bottom': '3px'}"
                  @click="() => {firstComparison = booleanOperator = secondComparison = null}"
                >
                  <i
                    class="icon-minus-squared"
                    data-toggle="tooltip"
                    title="Clear comparison filters"
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
          <div :style="{'display': 'flex'}">
            <div class="preview-size-selector">
              <label
                for="sizeSelector"
                :style="{'text-wrap': 'nowrap'}"
              >Preview Size</label>
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
            <div class="flag-options">
              <label
                for="flagVisibility"
                :style="{'margin': '0px 5px'}"
              >Flags</label>
              <button
                id="flagVisibility"
                class="btn btn-xs"
                @click="showFlags = !showFlags"
              >
                <i
                  v-if="showFlags"
                  class="icon-eye-off"
                />
                <i
                  v-else
                  class="icon-eye"
                />
              </button>
            </div>
          </div>
          <div
            :style="{'position': 'relative'}"
            class="dropdown-dropup selector-with-button"
          >
            <div class="dropdown-button">
              <div
                class="btn btn-default btn-block"
                @click="toggleOpenMenu('data')"
                @click.stop
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
                    class="checkboxLabel options"
                  >
                    <input
                      id="className"
                      v-model="cardDetails"
                      type="checkbox"
                      value="selectedCategory"
                    >
                    Label Name
                  </label>
                </li>
                <li>
                  <label
                    for="confidence"
                    class="checkboxLabel options"
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
                    class="checkboxLabel options"
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
                    class="checkboxLabel options"
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
              @click="() => applyBulkReview(-1)"
            >
              Approve
            </button>
            <div
              class="dropdown-dropup btn-group-two"
              :style="{'position': 'relative'}"
            >
              <button
                class="btn btn-primary dropdown-toggle btn-block"
                :style="{'text-wrap': 'pretty'}"
                type="button"
                data-toggle="dropdown"
                :disabled="selectedReviewSuperpixels.length < 1"
              >
                Change Label
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
                  v-for="category, index in categoryLabels"
                  :key="index"
                >
                  <div class="radio">
                    <label class="options">
                      <input
                        type="radio"
                        class="hidden-radio"
                        @click="() => applyBulkReview(index)"
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
        <h3
          v-if="trimmedSuperpixels.size === 0"
          :style="{'text-align': 'center'}"
        >
          No Results Found
        </h3>
        <div
          v-for="[label, value] in trimmedSuperpixels.entries()"
          :key="label"
        >
          <h3
            v-if="Object.values(value).length === 0"
            :style="{'text-align': 'center'}"
          >
            No Results Found
          </h3>
          <h4
            v-if="groupBy !== 0"
            :class="[groupBy >= 2 && 'group-header']"
            :style="[{'margin-left': '5px'}]"
          >
            {{ label === 'default' ? 'None' : label }} ({{ filteredSortedGroupedSuperpixels.get(label).length }})
            <i
              v-if="groupBy >= 2"
              class="icon-blank"
              :class="[groupBy >= 2 && 'group-icon']"
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
                groupBy >= 2 ? 'grouped' : 'ungrouped',
                superpixel === selectedSuperpixel && 'selected-superpixel',
                cardDetails.length > 0 && 'h-superpixel-card-detailed'
              ]"
              :style="[groupBy < 2 && {'border-color': catColorByIndex(superpixel.selectedCategory)}]"
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
              <i
                v-if="(!!superpixel.reviewValue) || superpixel.reviewValue === 0"
                class="flag-top-left icon-user"
                :style="{'background-color': catColorByIndex(superpixel.reviewValue)}"
                data-toggle="tooltip"
                :title="`Review: ${superpixel.labelCategories[superpixel.reviewValue].label}`"
              />
              <i
                v-if="superpixel.selectedCategory >= 0 && showFlags"
                class="flag-bottom-left icon-tag"
                :style="{'background-color': catColorByIndex(superpixel.selectedCategory)}"
                data-toggle="tooltip"
                :title="`Label: ${superpixel.labelCategories[superpixel.selectedCategory].label}`"
              />
              <i
                v-if="superpixel.prediction >= 0 && showFlags"
                class="flag-bottom-right icon-lightbulb"
                :style="{'background-color': predColorByIndex(superpixel)}"
                data-toggle="tooltip"
                :title="`Prediction: ${superpixel.predictionCategories[superpixel.prediction].label}`"
              />
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

.overflow-text {
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
  width: 100%;
  display: flex;
  align-items: flex-start;
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
  margin: 0px 2px;
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

.flag-top-left {
  position: absolute;
  top: -2px;
  z-index: 100;
  font-size: 16px;
  border-radius: 18px;
  color: white;
  left: -2px;
}

.flag-bottom-left {
  position: absolute;
  bottom: -2px;
  z-index: 100;
  font-size: 16px;
  border-radius: 18px;
  color: white;
  left: -2px;
}

.flag-bottom-right {
  position: absolute;
  bottom: -2px;
  z-index: 100;
  font-size: 16px;
  border-radius: 18px;
  color: white;
  right: -2px;
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
  max-height: 475px;
  overflow-y: scroll;
}

.flex {
  display: flex;
}

.disabled-label {
  color: #aaa;
  cursor: not-allowed;
}

.disabled-label input {
  pointer-events: none;
}

.flag-options {
  display: flex;
  align-items: baseline;
  justify-content: space-evenly;
}
</style>
