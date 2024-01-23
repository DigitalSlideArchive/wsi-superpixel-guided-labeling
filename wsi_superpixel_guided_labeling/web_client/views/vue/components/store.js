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
    opacity: 1.0
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
}

/**
 * Ensure that the label and prediction annotations are drawn correctly by
 * keeping the geojs layer up to date with the most recent category list
 */
const updatePixelmapLayerStyle = (overlayLayer) => {
    _.forEach(overlayLayer.features(), (feature) => {
        feature.style('color', (d, i) => {
            if (d < 0 || d >= store.categories.length) {
                console.warn(`No category found at index ${d} in the category map.`);
                return 'rgba(0, 0, 0, 0)';
            }
            const category = store.categories[d];
            return (i % 2 === 0) ? category.fillColor : category.strokeColor;
        });
    });
    overlayLayer.draw();
};

const saveAnnotations = (imageId) => {
    // If we dont specify an image, save all images
    const idsToSave = imageId ? [imageId] : Object.keys(store.annotationsByImageId);
    store.backboneParent.saveLabelAnnotations(idsToSave);
};

const synchronizeCategories = () => {
    _.forEach(Object.values(store.annotationsByImageId), (annotations) => {
        _.forEach(['predictions', 'labels'], (key) => {
            if (annotations[key]) {
                const superpixelElement = annotations[key].get('annotation').elements[0];
                if (superpixelElement) {
                    superpixelElement.categories = JSON.parse(JSON.stringify(store.categories));
                }
            }
        });
    });
};

export {
    store,
    nextCard,
    previousCard,
    assignHotkey,
    synchronizeCategories,
    saveAnnotations,
    updatePixelmapLayerStyle
};
