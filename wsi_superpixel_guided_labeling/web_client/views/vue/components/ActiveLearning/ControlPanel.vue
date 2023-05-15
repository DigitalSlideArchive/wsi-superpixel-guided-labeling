<script>
import Vue from 'vue';

import { store } from './store.js';
import ActiveLearningKeyboardShortcuts from './ActiveLearningKeyboardShortcuts.vue';
import SwitchInput from '../controls/SwitchInput.vue';

export default Vue.extend({
    components: { ActiveLearningKeyboardShortcuts, SwitchInput },
    computed: {
        showPredictions: {
            get() {
                return store.predictions;
            },
            set(newValue) {
                store.predictions = newValue;
            }
        },
        averageCertainty() {
            return store.currentAverageCertainty.toFixed(5);
        }
    }
});
</script>

<template>
  <div class="h-control-panel">
    <div class="h-control-panel-item">
      <label
        for="h-predictions-toggle"
        class="form-check-label"
      >
        Show Predictions
      </label>
      <switch-input
        :value="showPredictions"
        @change="(val) => showPredictions = val"
      />
    </div>
    <div class="h-control-panel-divider" />
    <div class="h-control-panel-item">
      <label>Avg. Certainty:</label>
      <span> {{ averageCertainty }}</span>
    </div>
    <active-learning-keyboard-shortcuts />
  </div>
</template>

<style scoped>
.h-control-panel {
  z-index: 1000;
  position: absolute;
  right: 0px;
  bottom: 200px;
  width: 200px;
  display: flex;
  flex-direction: column;
  background-color: #f8f8f8;
  padding: 5px;
  min-height: 300px;
}

.h-control-panel-item{
  display: flex;
  flex-direction: row;
  justify-content: space-between;
}

.h-control-panel-divider {
  border-top: 2px solid #666;
}
</style>
