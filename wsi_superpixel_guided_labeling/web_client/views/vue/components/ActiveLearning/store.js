import Vue from 'vue';

const store = Vue.observable({
    selectedIndex: 0,
    apiRoot: '',
    loading: false, // limit how quickly one can switch between images
    page: 0,
    superpixelsToDisplay: [],
    changeLog: [],
    annotationsByImageId: {},
    backboneParent: null,
    predictions: false,
    currentAverageConfidence: 0,
    categories: [],
    lastCategorySelected: null,
    maxPage: 1
});

const previousCard = () => {
    if (store.selectedIndex === 0) {
        if (store.page !== 0) {
            store.selectedIndex = 7;
            store.page--;
        }
    } else {
        store.selectedIndex--;
    }
};

const nextCard = () => {
    if (store.selectedIndex === 7) {
        if (store.page < store.maxPage) {
            store.selectedIndex = 0;
            store.page++;
        }
    } else {
        store.selectedIndex++;
    }
};

export {
    store,
    nextCard,
    previousCard
};
