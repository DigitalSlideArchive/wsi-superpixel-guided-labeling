import Vue from 'vue';

import _ from 'underscore';

import { hotkeys as hotkeysConsts, schemeTableau10 } from './constants';

const store = Vue.observable({
    selectedIndex: 0,
    page: 0,
    maxPage: 1,
    pageSize: 8,
    apiRoot: '',
    loading: false, // limit how quickly one can switch between images
    superpixelsToDisplay: [],
    changeLog: [],
    annotationsByImageId: {},
    backboneParent: null,
    predictions: false,
    currentAverageCertainty: 0,
    categories: [],
    categoriesAndIndices: [],
    lastCategorySelected: null,
    hotkeys: new Map(_.map(hotkeysConsts, (k, i) => [k, i])),
    strokeOpacity: 1.0,
    mode: 0,
    pixelmapPaintBrush: false,
    currentImageId: ''
});

const previousCard = () => {
    if (store.selectedIndex === 0) {
        if (store.page !== 0) {
            store.page--;
        }
    } else {
        store.selectedIndex--;
    }
};

const nextCard = () => {
    if (store.selectedIndex === store.pageSize - 1) {
        if (store.page < store.maxPage) {
            store.page++;
        }
    } else {
        store.selectedIndex++;
    }
};

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

const getFillColor = (index) => {
    const hexColor = schemeTableau10[index % 10];
    const [r, g, b] = hexColor.slice(1).match(/.{1,2}/g);
    return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, 0.5)`;
};

/**
 * Ensure that the label and prediction annotations are drawn correctly by
 * keeping the geojs layer up to date with the most recent category list
 */

const rgbStringToArray = (rgbStr) => {
    return rgbStr.match(/\d+(?:\.\d+)?/g).map(Number);
};

const updatePixelmapLayerStyle = (overlayLayers) => {
    if (!overlayLayers.length) {
        return;
    }

    _.forEach(overlayLayers, (overlayLayer) => {
        _.forEach(overlayLayer.features(), (feature) => {
            feature.style('color', (d, i) => {
                if (d < 0 || d >= store.categories.length) {
                    console.warn(`No category found at index ${d} in the category map.`);
                    return 'rgba(0, 0, 0, 0)';
                }
                const category = store.categories[d];
                // Fade between black border and fill color when opacity is changed
                const strokeColor = rgbStringToArray(category.strokeColor);
                const rgba = _.map(rgbStringToArray(category.fillColor), (val, idx) => {
                    // rgb values are missing alpha, default to opaque (1)
                    const strokeValue = strokeColor[idx] === undefined ? 1 : strokeColor[idx];
                    return (strokeValue - val) * store.strokeOpacity + val;
                });
                return (i % 2 === 0) ? category.fillColor : `rgba(${rgba})`;
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
    getFillColor
};
