import Vue from 'vue';

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
    currentAverageConfidence: 0,
    categories: [],
    lastCategorySelected: null
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

export {
    store,
    nextCard,
    previousCard
};
