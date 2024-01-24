import Vue from 'vue';

import _ from 'underscore';

import { hotkeys as hotkeysConsts } from './ActiveLearning/constants';

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
    lastCategorySelected: null,
    hotkeys: new Map(_.map(hotkeysConsts, (k, i) => [k, i])),
    editingHotkeys: false,
    strokeOpacity: 1.0
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

/**
 * Ensure that the label and prediction annotations are drawn correctly by
 * keeping the geojs layer up to date with the most recent category list
 */
const updatePixelmapLayerStyle = (overlayLayer) => {
    if (!overlayLayer) {
        return;
    }

    _.forEach(overlayLayer.features(), (feature) => {
        feature.style('color', (d, i) => {
            if (d < 0 || d >= store.categories.length) {
                console.warn(`No category found at index ${d} in the category map.`);
                return 'rgba(0, 0, 0, 0)';
            }
            const category = store.categories[d];
            // If opacity is zero, fill color and stroke color should be the same
            let strokeColor = `rgba(${[0, 0, 0]}, ${store.strokeOpacity})`;
            strokeColor = store.strokeOpacity ? strokeColor : category.fillColor;
            return (i % 2 === 0) ? category.fillColor : strokeColor;
        });
    });
    overlayLayer.draw();
};

export {
    store,
    nextCard,
    previousCard,
    assignHotkey,
    updatePixelmapLayerStyle
};
