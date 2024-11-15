<script>
import Vue from 'vue';
import _ from 'underscore';

import ActiveLearningInitialSuperpixels from './ActiveLearningSetup/ActiveLearningInitialSuperpixels.vue';
import ActiveLearningMergeConfirmation from './ActiveLearningSetup/ActiveLearningMergeConfirmation.vue';
import ActiveLearningFilmStrip from './ActiveLearning/ActiveLearningFilmStrip.vue';
import ActiveLearningReviewContainer from './ActiveLearningReview/ActiveLearningReviewContainer.vue';
import ActiveLearningLabeling from './ActiveLearningLabeling.vue';
import AnnotationOpacityControl from './AnnotationOpacityControl.vue';
import MouseAndKeyboardControls from './MouseAndKeyboardControls.vue';
import ActiveLearningSlideViewer from './ActiveLearningSlideViewer.vue';

import { viewMode, activeLearningSteps } from './constants';
import { store, updatePixelmapLayerStyle, updateSelectedPage } from './store.js';

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
            if (store.mode === viewMode.Review) {
                store.backboneParent.getSortedSuperpixelIndices();
            } else if (store.mode === viewMode.Labeling) {
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

        // Default to filtering out unlabeled superpixels
        const cats = _.map(_.rest(store.categories), (cat) => `label_${cat.label}`);
        store.filterBy = [...store.filterBy, ...cats];

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
        saveAnnotations(imageIds, savePredictions) {
            const idsToSave = _.isEmpty(imageIds) ? Object.keys(store.annotationsByImageId) : imageIds;
            store.backboneParent.saveAnnotations(idsToSave, savePredictions);
        },
        synchronizeCategories(imageIds, savePredictions) {
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
                this.saveAnnotations(imageIds, savePredictions);
                updatePixelmapLayerStyle();
                store.backboneParent.updateHistomicsYamlConfig();
            }
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
    <active-learning-initial-superpixels
      v-if="activeLearningStep === activeLearningSteps.SuperpixelSegmentation"
      :backbone-parent="backboneParent"
      :certainty-metrics="certaintyMetrics"
    />
    <div v-if="storeReady && activeLearningStep > activeLearningSteps.SuperpixelSegmentation">
      <!-- Image Viewer -->
      <active-learning-slide-viewer
        ref="activeLearningSlideViewer"
        class="slide-viewer"
        :available-images="availableImages"
        @synchronize="synchronizeCategories"
        @save-annotations="saveAnnotations"
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
      <active-learning-labeling
        v-if="mode !== viewMode.Review"
        ref="activeLearningLabeling"
        @synchronize="synchronizeCategories"
        @combine="combineCategories"
      />
      <!-- Merge Confirmation Dialog -->
      <active-learning-merge-confirmation @merge="mergeCategory" />
      <!-- Information Panel -->
      <mouse-and-keyboard-controls v-if="mode !== viewMode.Review" />
      <!-- Opacity Slider -->
      <annotation-opacity-control v-if="mode !== viewMode.Review" />
      <!-- Prediction Chips -->
      <active-learning-film-strip v-if="mode === viewMode.Guided" />
      <!-- Review View -->
      <active-learning-review-container v-if="mode === viewMode.Review" />
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
</style>
