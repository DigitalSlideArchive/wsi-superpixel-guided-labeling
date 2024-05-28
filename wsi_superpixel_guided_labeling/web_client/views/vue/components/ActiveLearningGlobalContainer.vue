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
        activeLearningSlideViewer() {
            return this.$refs.activeLearningSlideViewer;
        },
        activeLearningLabeling() {
            return this.$refs.activeLearningLabeling;
        },
        activeLearningStep() {
            return store.activeLearningStep;
        },
        sortedSuperpixelIndices() {
            return store.sortedSuperpixelIndices;
        }
    },
    watch: {
        activeLearningStep: {
            handler(step) {
                store.mode = Math.min(step, 2);
            },
            immediate: true
        },
        sortedSuperpixelIndices() {
            const startIndex = 0;
            const endIndex = Math.min(startIndex + store.pageSize, store.sortedSuperpixelIndices.length);
            store.superpixelsToDisplay = store.sortedSuperpixelIndices.slice(startIndex, endIndex);
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
        store.maxPage = store.sortedSuperpixelIndices.length / this.pageSize;
        store.categories = [...this.categoryMap.values()];
        store.currentImageId = Object.keys(this.imageNamesById)[0];

        // We don't want to mount child components until the store has been updated
        this.storeReady = true;
    },
    methods: {
        combineCategories() {
            this.activeLearningSlideViewer.combineCategoriesHandler();
        },
        mergeCategory(label, color) {
            this.activeLearningLabeling.mergeCategory(label, color);
        },
        saveAnnotations(saveAll) {
            const idsToSave = saveAll ? Object.keys(store.annotationsByImageId) : [store.currentImageId];
            store.backboneParent.saveAnnotations(idsToSave);
        },
        synchronizeCategories() {
            // Keep the save annotations in sync with the local state
            if (store.currentCategoryFormValid) {
                _.forEach(Object.values(store.annotationsByImageId), (annotations) => {
                    if (_.has(annotations, 'labels')) {
                        const superpixelElement = annotations.labels.get('annotation').elements[0];
                        if (superpixelElement) {
                            const updatedCategories = JSON.parse(JSON.stringify(store.categories));
                            superpixelElement.categories = updatedCategories;
                        }
                    }
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
    class="h-active-learning-container"
    :class="[activeLearningStep > activeLearningSteps.InitialLabeling ? 'guided' : 'setup']"
  >
    <active-learning-initial-superpixels
      v-if="activeLearningStep === activeLearningSteps.SuperpixelSegmentation"
      :backbone-parent="backboneParent"
      :certainty-metrics="certaintyMetrics"
    />
    <div v-if="storeReady && activeLearningStep > activeLearningSteps.SuperpixelSegmentation">
      <!-- Image Viewer -->
      <active-learning-slide-viewer
        ref="activeLearningSlideViewer"
        :available-images="availableImages"
        @synchronize="synchronizeCategories"
        @save-annotations="saveAnnotations"
      />
      <!-- Labels Panel -->
      <active-learning-labeling
        ref="activeLearningLabeling"
        :image-names-by-id="imageNamesById"
        :available-images="availableImages"
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
