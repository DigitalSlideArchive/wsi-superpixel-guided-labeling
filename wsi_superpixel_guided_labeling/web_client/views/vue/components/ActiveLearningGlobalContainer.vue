<script>
import Vue from 'vue';
import _ from 'underscore';

import ActiveLearningInitialSuperpixels from './ActiveLearningSetup/ActiveLearningInitialSuperpixels.vue';
import ActiveLearningInitialLabels from './ActiveLearningSetup/ActiveLearningInitialLabels.vue';
import ActiveLearningContainer from './ActiveLearning/ActiveLearningContainer.vue';

import { store } from './store.js';

export default Vue.extend({
    components: {
        ActiveLearningInitialSuperpixels,
        ActiveLearningInitialLabels,
        ActiveLearningContainer
    },
    props: [
        'backboneParent',
        'imageNamesById',
        'annotationsByImageId',
        'activeLearningStep',
        'certaintyMetrics',
        'router',
        'trainingDataFolderId',
        'annotationBaseName',
        'sortedSuperpixelIndices',
        'apiRoot',
        'currentAverageCertainty',
        'categoryMap'
    ],
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
        store.categories = [...this.categoryMap.values()];
        store.currentImageId = Object.keys(this.imageNamesById)[0];
    }
});
</script>

<template>
  <div class="h-active-learning-container">
    <active-learning-initial-superpixels
      v-if="activeLearningStep === 0"
      :backbone-parent="backboneParent"
      :certainty-metrics="certaintyMetrics"
    />
    <div v-else>
      <active-learning-initial-labels
        v-if="activeLearningStep === 1"
        :backbone-parent="backboneParent"
        :image-names-by-id="imageNamesById"
        :annotations-by-image-id="annotationsByImageId"
      />
      <active-learning-container
        v-else
        :router="router"
        :training-data-folder-id="trainingDataFolderId"
        :annotations-by-image-id="annotationsByImageId"
        :annotation-base-name="annotationBaseName"
        :sorted-superpixel-indices="sortedSuperpixelIndices"
        :api-root="apiRoot"
        :backbone-parent="backboneParent"
        :current-average-certainty="currentAverageCertainty"
        :category-map="categoryMap"
        :image-names-by-id="imageNamesById"
      />
    </div>
  </div>
</template>

<style scoped>
.h-active-learning-container {
    margin-left: 10px;
    width: 100%;
    height: 100%;
    position: absolute;
}
</style>
