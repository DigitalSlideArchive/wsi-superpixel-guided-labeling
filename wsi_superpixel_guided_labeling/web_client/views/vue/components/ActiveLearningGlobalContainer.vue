<script>
import Vue from 'vue';
import _ from 'underscore';

import ActiveLearningInitialSuperpixels from './ActiveLearningSetup/ActiveLearningInitialSuperpixels.vue';
import ActiveLearningInitialLabels from './ActiveLearningSetup/ActiveLearningInitialLabels.vue';
import ActiveLearningMergeConfirmation from './ActiveLearningSetup/ActiveLearningMergeConfirmation.vue';
import ActiveLearningContainer from './ActiveLearning/ActiveLearningContainer.vue';
import ActiveLearningFilmStrip from './ActiveLearning/ActiveLearningFilmStrip.vue';
import ActiveLearningLabeling from './ActiveLearningLabeling.vue';
import AnnotationOpacityControl from './AnnotationOpacityControl.vue';
import MouseAndKeyboardControls from './MouseAndKeyboardControls.vue';

import { viewMode } from './constants';
import { store } from './store.js';

export default Vue.extend({
    components: {
        ActiveLearningInitialSuperpixels,
        ActiveLearningInitialLabels,
        ActiveLearningContainer,
        ActiveLearningLabeling,
        ActiveLearningFilmStrip,
        AnnotationOpacityControl,
        MouseAndKeyboardControls,
        ActiveLearningMergeConfirmation
    },
    props: [
        'backboneParent',
        'imageNamesById',
        'annotationsByImageId',
        'activeLearningStep',
        'certaintyMetrics',
        'sortedSuperpixelIndices',
        'apiRoot',
        'currentAverageCertainty',
        'availableImages',
        'categoryMap'
    ],
    data() {
        return {
            storeReady: false
        };
    },
    computed: {
        mode() {
            return store.mode;
        },
        viewMode() {
            return viewMode;
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
        store.categories = [...this.categoryMap.values()];
        store.currentImageId = Object.keys(this.imageNamesById)[0];

        // We don't want to mount child components until the store has been populated
        this.storeReady = true;
    },
    methods: {
        synchronizeCategories() {
            this.$refs.activeLearningInitialLabels.synchronizeCategories();
        },
        combineCategories() {
            this.$refs.activeLearningInitialLabels.combineCategoriesHandler();
        },
        mergeCategory(label, color) {
            this.$refs.activeLearningLabeling.mergeCategory(label, color);
        }
    }
});
</script>

<template>
  <div
    id="learningContainer"
    class="h-active-learning-container"
    :class="[activeLearningStep > 1 ? 'guided' : 'setup']"
  >
    <active-learning-initial-superpixels
      v-if="activeLearningStep === 0"
      :backbone-parent="backboneParent"
      :certainty-metrics="certaintyMetrics"
    />
    <div v-if="storeReady && activeLearningStep > 0">
      <!-- Labeling Canvas -->
      <active-learning-initial-labels
        v-if="mode === viewMode.Labeling"
        ref="activeLearningInitialLabels"
      />
      <!-- Guided Canvas -->
      <active-learning-container
        v-if="mode === viewMode.Guided"
        :sorted-superpixel-indices="sortedSuperpixelIndices"
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
