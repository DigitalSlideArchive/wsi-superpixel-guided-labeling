<script>
import _ from 'underscore';

import { store } from './store.js';

export default {
    props: ['activeLearningSetup', 'update', 'categoryIndex', 'fillColor'],
    data() {
        return {
            opacitySlider: 1.0
        };
    },
    computed: {
        categories() {
            return store.categories;
        }
    },
    watch: {
        opacitySlider(opacity) {
            _.map(this.categories, (cat) => {
                if (parseFloat(opacity) === 0) {
                    // If opacity is zero, fill color and stroke color should be the same
                    cat.strokeColor = cat.fillColor;
                } else {
                    // Use the default stroke color value
                    cat.strokeColor = `rgba(${[0, 0, 0]}, ${opacity})`;
                }
                return cat;
            });
            this.update();
        },
        fillColor(color) {
            if (parseFloat(this.opacitySlider) === 0) {
                this.categories[this.categoryIndex].strokeColor = color;
            }
        }
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
    z-index: 1000;
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
