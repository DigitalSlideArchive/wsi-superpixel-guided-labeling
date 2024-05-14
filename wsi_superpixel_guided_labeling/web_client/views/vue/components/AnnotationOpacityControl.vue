<script>
import _ from 'underscore';

import { store, updatePixelmapLayerStyle } from './store.js';

export default {
    data() {
        return {
            fillColor: 'rgba(0, 0, 0, 1)',
            opacity: 1
        };
    },
    computed: {
        config() {
            if (store.backboneParent) {
                return store.backboneParent.histomicsUIConfig || {};
            }
            return {};
        },
        folderId() {
            if (store.backboneParent) {
                return store.backboneParent.trainingDataFolderId;
            }
            return '';
        },
        opacitySlider() {
            return store.strokeOpacity;
        },
        categoryIndex() {
            return store.categoryIndex;
        },
        noOverlay() {
            return _.isNull(store.labelsOverlayLayer);
        }
    },
    watch: {
        opacitySlider() {
            this.updateConfigData();
            updatePixelmapLayerStyle();
        },
        categoryIndex() {
            this.fillColor = store.categoriesAndIndices[this.categoryIndex].category.fillColor;
        },
        fillColor() {
            if (store.opacitySlider === 0) {
                updatePixelmapLayerStyle();
            }
        },
        folderId: {
            handler(newId, oldId) {
                if (newId && newId !== oldId) {
                    this.getConfigData();
                }
            },
            immediate: true
        },
        opacity(value) {
            store.strokeOpacity = parseFloat(value);
        }
    },
    methods: {
        getConfigData() {
            if (!this.folderId) {
                return;
            }
            const uiSettings = this.config.guidedLabelingUI || {};
            if (uiSettings.borderOpacity) {
                store.opacitySlider = uiSettings.borderOpacity;
            }
        },
        updateConfigData: _.debounce(function () {
            const uiSettings = this.config.guidedLabelingUI || {};
            uiSettings.borderOpacity = parseFloat(store.opacitySlider);
            store.backboneParent.histomicsUIConfig.guidedLabelingUI = uiSettings;
            store.backboneParent.updateHistomicsYamlConfig();
        }, 500)
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
    border-radius: 1px;
    box-shadow: 5px 5px 5px rgba(0, 0, 0, 0.5);
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
