<script>
import _ from 'underscore';

export default {
    props: ['activeLearningSetup', 'categories', 'update'],
    data() {
        return {
            opacitySlider: 1.0
        };
    },
    watch: {
        opacitySlider(opacity) {
            _.map(this.categories, (cat) => {
                const newColor = this.rgbStringToArray(cat.strokeColor);
                cat.strokeColor = `rgba(${newColor}, ${opacity})`;
                return cat;
            });
            this.update();
        }
    },
    methods: {
        rgbStringToArray(rgbStr) {
            return rgbStr.match(/\d+(?:\.\d+)?/g).map(Number).slice(0, 3);
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
