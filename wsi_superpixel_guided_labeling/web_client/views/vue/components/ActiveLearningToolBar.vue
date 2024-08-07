<script>
import Vue from 'vue';

import { viewMode, activeLearningSteps } from './constants.js';
import { store } from './store.js';

export default Vue.extend({
    computed: {
        mode() {
            return store.mode;
        },
        viewMode() {
            return viewMode;
        },
        activeLearningStep() {
            return store.activeLearningStep;
        },
        activeLearningSteps() {
            return activeLearningSteps;
        },
        reviewedSuperpixels() {
            return store.reviewedSuperpixels;
        }
    },
    methods: {
        changeMode(newMode) {
            store.mode = newMode;
        }
    }
});
</script>

<template>
  <div
    v-if="activeLearningStep > activeLearningSteps.SuperpixelSegmentation"
    class="active-learning-toolbar row"
  >
    <div class="col-sm-9" />
    <div class="btn-group col-sm-3 active-learning-mode-buttons">
      <button
        class="btn btn-default"
        :class="[mode === viewMode.Labeling && 'btn-primary']"
        data-toggle="tooltip"
        title="Labeling Mode"
        @click="changeMode(viewMode.Labeling)"
      >
        <i class="icon-pencil" /> Labeling
      </button>
      <button
        class="btn btn-default"
        :class="[mode === viewMode.Guided && 'btn-primary']"
        :disabled="activeLearningStep < activeLearningSteps.GuidedLabeling"
        data-toggle="tooltip"
        title="Guided Mode"
        @click="changeMode(viewMode.Guided)"
      >
        <i class="icon-video" /> Guided
      </button>
      <button
        class="btn btn-default"
        :class="[mode === viewMode.Review && 'btn-primary']"
        :disabled="activeLearningStep < activeLearningSteps.GuidedLabeling"
        data-toggle="tooltip"
        title="Review Mode"
        @click="changeMode(viewMode.Review)"
      >
        <i class="icon-th" /> Review
        <span
          v-if="reviewedSuperpixels > 0"
          class="badge"
        >{{ reviewedSuperpixels }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.active-learning-toolbar {
    height: 50px;
    width: calc(100% - 375px);
    position: absolute;
    left: 200px;
    display: flex;
}

.active-learning-mode-buttons {
    display: flex;
    align-items: center;
    justify-content: flex-end;
}
</style>
