<script>
import _ from 'underscore';

import { store, updatePixelmapLayerStyle } from './store.js';

export default {
    data() {
        return {
            fillColor: 'rgba(0, 0, 0, 1)'
        };
    },
    computed: {
        categoryIndex() {
            return store.categoryIndex;
        },
        noOverlay() {
            return _.isNull(store.labelsOverlayLayer);
        },
        opacity: {
            get() {
                return store.strokeOpacity;
            },
            set(value) {
                store.strokeOpacity = parseFloat(value);
            }
        }
    },
    watch: {
        categoryIndex() {
            this.fillColor = store.categoriesAndIndices[this.categoryIndex].category.fillColor;
        },
        fillColor() {
            if (store.strokeOpacity === 0) {
                updatePixelmapLayerStyle();
            }
        },
        opacity: {
            handler(newValue, oldValue) {
                if (newValue === oldValue) {
                    return;
                }
                this.updateConfigData();
                updatePixelmapLayerStyle();
            },
            immediate: true
        }
    },
    methods: {
        updateConfigData() {
            store.backboneParent.updateHistomicsYamlConfig();
        }
    }
};
</script>

<template>
  <div class="h-opacity-slider-learning-container">
    <span class="h-opacity-slider-label">Superpixel Boundary Opacity:</span>
    <input
      v-model="opacity"
      class="h-opacity-slider"
      type="range"
      min="0"
      max="1"
      step="0.01"
      :disabled="noOverlay"
    >
  </div>
</template>

<style scoped>
.h-opacity-slider-learning-container {
    z-index: 100;
    position: absolute;
    top: 5px;
    right: 20px;
    padding: 5px;
    min-width: 200px;
    display: flex;
    background-color: white;
    border-radius: 5px;
    box-shadow: 3px 3px 5px 2px rgba(0,0,0,.5);
    width: 350px;
}

.h-opacity-slider-label {
    min-width: fit-content;
}

.h-opacity-slider {
    width: 75%;
    margin-left: 5px;
}
</style>
