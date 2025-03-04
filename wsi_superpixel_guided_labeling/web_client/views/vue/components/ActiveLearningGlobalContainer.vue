<script>
import Vue from 'vue';

import ActiveLearningInitialSuperpixels from './ActiveLearningSetup/ActiveLearningInitialSuperpixels.vue';
import ActiveLearningMergeConfirmation from './ActiveLearningSetup/ActiveLearningMergeConfirmation.vue';
import ActiveLearningFilmStrip from './ActiveLearning/ActiveLearningFilmStrip.vue';
import ActiveLearningReviewContainer from './ActiveLearningReview/ActiveLearningReviewContainer.vue';
import ActiveLearningLabeling from './ActiveLearningLabeling.vue';
import AnnotationOpacityControl from './AnnotationOpacityControl.vue';
import MouseAndKeyboardControls from './MouseAndKeyboardControls.vue';
import ActiveLearningSlideViewer from './ActiveLearningSlideViewer.vue';

import { viewMode, activeLearningSteps } from './constants';
import { store, updateSelectedPage } from './store.js';

export default Vue.extend({
    components: {
        ActiveLearningInitialSuperpixels,
        ActiveLearningLabeling,
        ActiveLearningFilmStrip,
        AnnotationOpacityControl,
        MouseAndKeyboardControls,
        ActiveLearningMergeConfirmation,
        ActiveLearningSlideViewer,
        ActiveLearningReviewContainer
    },
    props: [
        'backboneParent',
        'imageNamesById',
        'annotationsByImageId',
        'certaintyMetrics',
        'featureShapes',
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
        activeLearningStep() {
            return store.activeLearningStep;
        },
        activeLearningSlideViewer() {
            return this.$refs.activeLearningSlideViewer;
        },
        activeLearningLabeling() {
            return this.$refs.activeLearningLabeling;
        },
        selectedImageId: {
            get() {
                return store.currentImageId;
            },
            set(newImageId) {
                store.currentImageId = newImageId;
            }
        },
        sortedSuperpixelIndices() {
            return store.sortedSuperpixelIndices;
        },
        modeComponent() {
            if (store.mode === viewMode.Guided) {
                return ActiveLearningFilmStrip;
            } else if (store.mode === viewMode.Review) {
                return ActiveLearningReviewContainer;
            }
            return null;
        },
        labelingComponent() {
            if (store.mode !== viewMode.Review) {
                return ActiveLearningLabeling;
            }
            return null;
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
            updateSelectedPage();
        },
        mode() {
            if (store.mode === viewMode.Labeling) {
                store.labels = true;
            }
        }
    },
    mounted() {
        // set store
        store.annotationsByImageId = this.annotationsByImageId;
        store.apiRoot = this.apiRoot;
        store.backboneParent = this.backboneParent;
        store.currentAverageCertainty = this.currentAverageCertainty;
        store.page = 0;
        store.selectedIndex = 0;
        store.pageSize = this.pageSize;
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
        }
    }
});
</script>

<template>
  <div
    id="activeLearningContainer"
    class="h-active-learning-container"
    :class="[activeLearningStep > activeLearningSteps.InitialLabeling ? 'guided' : 'setup']"
  >
    <div class="progress-bar-container">
      <div class="progress-bar" />
    </div>
    <active-learning-initial-superpixels
      v-if="activeLearningStep === activeLearningSteps.SuperpixelSegmentation"
      :backbone-parent="backboneParent"
      :certainty-metrics="certaintyMetrics"
      :feature-shapes="featureShapes"
    />
    <div v-if="storeReady && activeLearningStep > activeLearningSteps.SuperpixelSegmentation">
      <!-- Image Viewer -->
      <active-learning-slide-viewer
        ref="activeLearningSlideViewer"
        class="slide-viewer"
        :available-images="availableImages"
      />
      <!-- Current Slide Name -->
      <div class="h-category-form slide-name-container">
        <div class="h-form-controls">
          <label
            for="currentImage"
            :style="[{'margin-right': '5px'}]"
          >
            Image
          </label>
          <select
            v-if="mode === viewMode.Labeling"
            id="currentImage"
            v-model="selectedImageId"
            class="h-al-image-select"
            data-toggle="tooltip"
            :title="imageNamesById[selectedImageId]"
          >
            <option
              v-for="imageId in Object.keys(imageNamesById)"
              :key="imageId"
              :value="imageId"
            >
              {{ imageNamesById[imageId] }}
            </option>
          </select>
          <div
            v-else
            class="slide-name"
            data-toggle="tooltip"
            :title="imageNamesById[selectedImageId]"
          >
            {{ imageNamesById[selectedImageId] }}
          </div>
        </div>
      </div>
      <!-- Labels Panel -->
      <keep-alive>
        <component
          :is="labelingComponent"
          ref="activeLearningLabeling"
          @combine="combineCategories"
        />
      </keep-alive>
      <!-- Merge Confirmation Dialog -->
      <active-learning-merge-confirmation @merge="mergeCategory" />
      <!-- Information Panel -->
      <mouse-and-keyboard-controls v-if="mode !== viewMode.Review" />
      <!-- Opacity Slider -->
      <annotation-opacity-control v-if="mode !== viewMode.Review" />
      <!-- Prediction Chips or Review View -->
      <keep-alive>
        <component :is="modeComponent" />
      </keep-alive>
    </div>
  </div>
</template>

<style scoped>
.h-active-learning-container {
    width: 100%;
    position: absolute;
}

.setup {
    height: 100%;
}

.guided {
    height: calc(100vh - 52px);
}

.h-category-form {
   display: flex;
   flex-direction: column;
}

.slide-name-container {
    z-index: 100;
    position: absolute;
    top: 5px;
    left: 5px;
    width: 415px;
    border-radius: 5px;
    box-shadow: 3px 3px 5px 2px rgba(0,0,0,.5);
    padding: 5px;
    background-color: #fff;
}

.h-form-controls {
    display: flex;
    align-items: baseline;
}

.h-al-image-select {
    width: 100%;
    padding: 5px 10px;
}

.slide-name {
    text-overflow: ellipsis;
    text-wrap: nowrap;
    overflow: hidden;
}

.slide-viewer {
    position: relative;
    bottom: 3px;
}

.progress-bar-container {
    position: fixed;
    top: 45px;
    width: 100%;
    height: 5px;
    z-index: 1000;
    overflow: hidden;
    display: none;
}

.progress-bar {
    width: 25%;
    height: 100%;
    background-color: #337ab7;
    animation: grow 2s infinite;
    transform: translateX(-100%);
    animation-delay: 1s;
}

@keyframes grow {
    from {
        transform: translateX(-100%);
    }
    to {
        transform: translateX(400%);
    }
}
</style>
