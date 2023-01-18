import Vue from 'vue';

export default Vue.observable({
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
    lastKeyPressed: ''
});
