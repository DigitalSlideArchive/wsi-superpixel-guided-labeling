<script>
import _ from 'underscore';

import { store, updatePixelmapLayerStyle } from './store.js';

export default {
    props: ['activeLearningSetup', 'fillColor', 'overlayLayers'],
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
        opacitySlider: {
            get() {
                return store.strokeOpacity;
            },
            set(value) {
                store.strokeOpacity = parseFloat(value);
            }
        }
    },
    watch: {
        opacitySlider() {
            this.updateConfigData();
            updatePixelmapLayerStyle(this.overlayLayers);
        },
        fillColor() {
            if (this.opacitySlider === 0) {
                updatePixelmapLayerStyle(this.overlayLayers);
            }
        },
        folderId: {
            handler(newId, oldId) {
                if (newId && newId !== oldId) {
                    this.getConfigData();
                }
            },
            immediate: true
        }
    },
    methods: {
        getConfigData() {
            if (!this.folderId) {
                return;
            }
            const uiSettings = this.config.guidedLabelingUI || {};
            if (uiSettings.borderOpacity) {
                this.opacitySlider = uiSettings.borderOpacity;
            }
        },
        updateConfigData: _.debounce(function () {
            const uiSettings = this.config.guidedLabelingUI || {};
            uiSettings.borderOpacity = parseFloat(this.opacitySlider);
            store.backboneParent.histomicsUIConfig.guidedLabelingUI = uiSettings;
            store.backboneParent.updateHistomicsYamlConfig();
        }, 500)
    }
};
</script>

<template>
  <div :class="{'h-opacity-slider-setup-container': activeLearningSetup, 'h-opacity-slider-learning-container': !activeLearningSetup}">
    <span class="h-opacity-slider-label">Superpixel Boundary Opacity:</span>
    <input
      v-model="opacitySlider"
      class="h-opacity-slider"
      type="range"
      min="0"
      max="1"
      step="0.01"
    >
  </div>
</template>

<style scoped>
.h-opacity-slider-learning-container {
    z-index: 100;
    position: absolute;
    top: 5px;
    right: 5px;
    padding: 5px;
    min-width: 200px;
    display: flex;
    background-color: white;
    border-radius: 1px;
    box-shadow: 5px 5px 5px rgba(0, 0, 0, 0.5);
}

.h-opacity-slider-setup-container {
    width: 100%;
    margin: 0px 5px;
    display: flex;
    justify-content: center;
}

.h-opacity-slider-label {
    min-width: fit-content;
}

.h-opacity-slider {
    width: 75%;
    margin-left: 5px;
}
</style>
