import Vue from 'vue';

import _ from 'underscore';

import { hotkeys as hotkeysConsts, activeLearningSteps } from './constants';
import { rgbStringToArray } from './utils';

const store = Vue.observable({
    /*********
     * DATA
     *********/
    apiRoot: '',
    superpixelsToDisplay: [],
    reviewChangeLog: [],
    labelingChangeLog: [],
    annotationsByImageId: {},
    backboneParent: null,
    categories: [],
    categoriesAndIndices: [],
    hotkeys: new Map(_.map(hotkeysConsts, (k, i) => [k, i])),
    labelsOverlayLayer: null,
    predictionsOverlayLayer: null,
    zoom: 1,
    center: { x: 1, y: 1 },
    sortedSuperpixelIndices: [],
    reviewSuperpixel: null,
    currentUser: null,
    epoch: -1,
    userNames: {},
    exclusions: [],
    tileMetadata: {},
    initialTrainingParameters: {},
    /*********
     * UI
     *********/
    selectedIndex: 0,
    page: 0,
    maxPage: 1,
    pageSize: 8,
    predictions: false,
    labels: true,
    currentAverageCertainty: 0,
    lastCategorySelected: null,
    strokeOpacity: 1.0,
    mode: 0,
    currentCategoryFormValid: true,
    pixelmapPaintBrush: false,
    currentImageId: '',
    categoryIndex: 0,
    activeLearningStep: activeLearningSteps.InitialState,
    selectedLabels: new Map(),
    selectedReviewSuperpixels: [],
    filterBy: ['no review'],
    predictionCounts: [],
    blockingJobRunning: false
});

const previousCard = () => {
    if (store.selectedIndex === 0) {
        if (store.page !== 0) {
            store.page--;
            updateSelectedPage();
            store.selectedIndex = store.pageSize - 1;
        }
    } else {
        store.selectedIndex--;
    }
};

const nextCard = () => {
    if (store.selectedIndex === store.pageSize - 1) {
        if (store.page < store.maxPage) {
            store.page++;
            updateSelectedPage();
            store.selectedIndex = 0;
        }
    } else {
        store.selectedIndex++;
    }
};

const updateSelectedPage = () => {
    if (store.activeLearningStep < activeLearningSteps.GuidedLabeling) {
        return;
    }

    const startIndex = store.page * store.pageSize;
    const endIndex = Math.min(startIndex + store.pageSize, store.sortedSuperpixelIndices.length);
    store.superpixelsToDisplay = store.sortedSuperpixelIndices.slice(startIndex, endIndex);
    store.currentImageId = store.superpixelsToDisplay[store.selectedIndex].imageId;
    store.maxPage = Math.ceil(store.sortedSuperpixelIndices.length / store.pageSize) - 1;
};

/**
 * Assign a hotkey to a category
 *
 * @param {string} oldkey The old hotkey value
 * @param {string} newKey The new hotkey value
 */
const assignHotkey = (oldkey, newKey) => {
    // Check for duplicate key bindings
    const oldVal = store.hotkeys.get(newKey);
    store.hotkeys.set(newKey, store.hotkeys.get(oldkey)).delete(oldkey);
    if (!_.isNull(oldVal)) {
        // Key was already assigned an index.
        // Update that index to an unused value.
        const idx = _.findIndex(hotkeysConsts, (k) => !store.hotkeys.has(k));
        store.hotkeys.set(hotkeysConsts[idx], oldVal);
    }
};

/**
 * Ensure that the label and prediction annotations are drawn correctly by
 * keeping the geojs layer up to date with the most recent category list
 */
const updatePixelmapLayerStyle = () => {
    _.forEach([store.labelsOverlayLayer, store.predictionsOverlayLayer], (overlayLayer, idx) => {
        if (_.isNull(overlayLayer)) return;

        _.forEach(overlayLayer.features(), (feature) => {
            feature.style('color', (d, i) => {
                if (overlayLayer === store.predictionsOverlayLayer) {
                    // For the predictions overlay we need to account
                    // for the excluded "default" category
                    d += 1;
                }
                if (d < 0 || d >= store.categories.length) {
                    console.warn(`No label found at index ${d} in the label map.`);
                    return 'rgba(0, 0, 0, 0)';
                }
                const category = store.categories[d];
                // Fade between black border and fill color when opacity is changed
                const strokeColor = rgbStringToArray(category.strokeColor);
                const strokeRGBA = _.map(rgbStringToArray(category.fillColor), (val, idx) => {
                    // rgb values are missing alpha, default to opaque (1)
                    const strokeValue = strokeColor[idx] === undefined ? 1 : strokeColor[idx];
                    return (strokeValue - val) * store.strokeOpacity + val;
                });
                if (i % 2 === 0) {
                    const fillRGBA = store.labels ? category.fillColor : 'rgba(0, 0, 0, 0)';
                    return overlayLayer === store.labelsOverlayLayer ? fillRGBA : category.fillColor;
                }
                return `rgba(${strokeRGBA})`;
            });
        });
        overlayLayer.draw();
    });
};

export {
    store,
    nextCard,
    previousCard,
    assignHotkey,
    updatePixelmapLayerStyle,
    updateSelectedPage
};
