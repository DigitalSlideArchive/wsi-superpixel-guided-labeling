<script>
import Vue from 'vue';
import _ from 'underscore';

import ActiveLearningInitialSuperpixels from './ActiveLearningSetup/ActiveLearningInitialSuperpixels.vue';
import ActiveLearningMergeConfirmation from './ActiveLearningSetup/ActiveLearningMergeConfirmation.vue';
import ActiveLearningFilmStrip from './ActiveLearning/ActiveLearningFilmStrip.vue';
import ActiveLearningLabeling from './ActiveLearningLabeling.vue';
import AnnotationOpacityControl from './AnnotationOpacityControl.vue';
import MouseAndKeyboardControls from './MouseAndKeyboardControls.vue';
import ActiveLearningSlideViewer from './ActiveLearningSlideViewer.vue';

import { viewMode, activeLearningSteps } from './constants';
import { store, updatePixelmapLayerStyle } from './store.js';

export default Vue.extend({
    components: {
        ActiveLearningInitialSuperpixels,
        ActiveLearningLabeling,
        ActiveLearningFilmStrip,
        AnnotationOpacityControl,
        MouseAndKeyboardControls,
        ActiveLearningMergeConfirmation,
        ActiveLearningSlideViewer
    },
    props: [
        'backboneParent',
        'imageNamesById',
        'annotationsByImageId',
        'activeLearningStep',
        'certaintyMetrics',
        'apiRoot',
        'currentAverageCertainty',
        'availableImages',
        'categoryMap'
    ],
    data() {
        return {
            storeReady: false,
            pageSize: 8
        };
    },
    computed: {
        mode() {
            return store.mode;
        },
        viewMode() {
            return viewMode;
        },
        activeLearningSteps() {
            return activeLearningSteps;
        },
        superpixelsToDisplay() {
            return store.superpixelsToDisplay;
        }
    },
    watch: {
        activeLearningStep: {
            handler(step) {
                store.mode = Math.min(step, 2);
            },
            immediate: true
        }
    },
    mounted() {
        // set store
        store.annotationsByImageId = this.annotationsByImageId;
        store.apiRoot = this.apiRoot;
        store.backboneParent = this.backboneParent;
        store.currentAverageCertainty = this.currentAverageCertainty;
        store.page = 0;
        store.predictions = false;
        store.selectedIndex = 0;
        store.activeLearningStep = this.activeLearningStep;
        store.pageSize = this.pageSize;
        const startIndex = 0;
        const endIndex = Math.min(startIndex + store.pageSize, store.sortedSuperpixelIndices.length);
        store.superpixelsToDisplay = store.sortedSuperpixelIndices.slice(startIndex, endIndex);
        store.maxPage = store.sortedSuperpixelIndices.length / this.pageSize;
        store.categories = [...this.categoryMap.values()];
        store.currentImageId = Object.keys(this.imageNamesById)[0];

        // We don't want to mount child components until the store has been populated
        this.storeReady = true;
    },
    methods: {
        combineCategories() {
            this.$refs.activeLearningSlideViewer.combineCategoriesHandler();
        },
        mergeCategory(label, color) {
            this.$refs.activeLearningLabeling.mergeCategory(label, color);
        },
        saveAnnotations(saveAll) {
            const idsToSave = saveAll ? Object.keys(store.annotationsByImageId) : [store.currentImageId];
            store.backboneParent.saveLabelAnnotations(idsToSave);
        },
        synchronizeCategories() {
            if (store.currentCategoryFormValid) {
                _.forEach(Object.values(store.annotationsByImageId), (annotations) => {
                    _.forEach(['labels', 'predictions'], (key) => {
                        if (_.has(annotations, key)) {
                            const superpixelElement = annotations[key].get('annotation').elements[0];
                            if (superpixelElement) {
                                let updatedCategories = JSON.parse(JSON.stringify(store.categories));
                                if (key === 'predictions') {
                                    updatedCategories = _.rest(updatedCategories);
                                }
                                superpixelElement.categories = updatedCategories;
                            }
                        }
                    });
                });
                this.saveAnnotations(true);
                updatePixelmapLayerStyle();
                store.backboneParent.updateHistomicsYamlConfig();
            }
        }
    }
});
</script>

<template>
  <div
    id="learningContainer"
    class="h-active-learning-container"
    :class="[activeLearningStep > activeLearningSteps.InitialLabeling ? 'guided' : 'setup']"
  >
    <active-learning-initial-superpixels
      v-if="activeLearningStep === activeLearningSteps.SuperpixelSegmentation"
      :backbone-parent="backboneParent"
      :certainty-metrics="certaintyMetrics"
    />
    <div v-if="storeReady && activeLearningStep > activeLearningSteps.SuperpixelSegmentation">
      <!-- Slide Viewer -->
      <active-learning-slide-viewer
        ref="activeLearningSlideViewer"
        @synchronize="synchronizeCategories"
        @save-annotations="saveAnnotations"
      />
      <!-- Labels Panel -->
      <active-learning-labeling
        ref="activeLearningLabeling"
        :image-names-by-id="imageNamesById"
        @synchronize="synchronizeCategories"
        @combine="combineCategories"
      />
      <!-- Merge Confirmation Dialog -->
      <active-learning-merge-confirmation @merge="mergeCategory" />
      <!-- Information Panel -->
      <mouse-and-keyboard-controls />
      <!-- Opacity Slider -->
      <annotation-opacity-control v-if="mode !== viewMode.Review" />
      <!-- Prediction Chips -->
      <active-learning-film-strip v-if="mode === viewMode.Guided" />
    </div>
  </div>
</template>

<style scoped>
.h-active-learning-container {
    width: 100%;
    position: absolute;
}

.setup {
    margin-left: 10px;
    height: 100%;
}

.guided {
    height: calc(100vh - 52px);
}
</style>
