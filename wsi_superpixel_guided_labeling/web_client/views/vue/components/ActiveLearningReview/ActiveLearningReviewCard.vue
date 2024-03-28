<script>
import Vue from 'vue';

import { store } from '../store';

export default Vue.extend({
    props: ['superpixel', 'previewSize'],
    data() {
        return {
            override: false
        };
    },
    computed: {
        apiRoot() {
            return store.apiRoot;
        },
        imageItemsById() {
            if (store.backboneParent) {
                return store.backboneParent.imageItemsById;
            }
            return {};
        },
        wsiRegionUrl() {
            const imageId = this.superpixel.imageId;
            const bbox = this.superpixel.bbox;
            const regionWidth = bbox[2] - bbox[0];
            const regionHeight = bbox[3] - bbox[1];
            const scaleFactor = Math.max(regionWidth, regionHeight);
            const thumbnailWidth = Math.floor((125 * regionWidth / scaleFactor) * this.previewSize);
            const thumbnailHeight = Math.floor((125 * regionHeight / scaleFactor) * this.previewSize);
            const params = `?left=${bbox[0]}&top=${bbox[1]}&right=${bbox[2]}&bottom=${bbox[3]}&width=${thumbnailWidth}&height=${thumbnailHeight}`;
            return `${this.apiRoot}/item/${imageId}/tiles/region${params}`;
        },
        superpixelRegionUrl() {
            const imageId = this.superpixel.superpixelImageId;
            const index = this.superpixel.index;
            const pixelVals = this.superpixel.boundaries ? [index * 2, index * 2 + 1] : [index];
            const bbox = this.superpixel.bbox;
            const scale = this.superpixel.scale;
            const regionWidth = bbox[2] - bbox[0];
            const regionHeight = bbox[3] - bbox[1];
            const scaleFactor = Math.max(regionWidth, regionHeight);
            const thumbnailWidth = Math.floor((125 * regionWidth / scaleFactor) * this.previewSize);
            const thumbnailHeight = Math.floor((125 * regionHeight / scaleFactor) * this.previewSize);
            const params = `?left=${bbox[0] / scale}&top=${bbox[1] / scale}&right=${bbox[2] / scale}&bottom=${bbox[3] / scale}&width=${thumbnailWidth}&height=${thumbnailHeight}&encoding=PNG`;
            const functionJson = JSON.stringify({
                function: {
                    name: 'large_image.tilesource.stylefuncs.maskPixelValues',
                    context: true,
                    parameters: {
                        values: pixelVals,
                        positive: [0, 0, 0, 0],
                        negative: [255, 255, 255, 255]
                    }
                },
                bands: []
            });
            const functionParam = `&style=${encodeURIComponent(functionJson)}`;
            return `${this.apiRoot}/item/${imageId}/tiles/region${params}${functionParam}`;
        },
        tooltipText() {
            return (
                `Confidence: ${this.superpixel.confidence}\n` +
                `Certainty: ${this.superpixel.certainty}\n` +
                `Predicted: ${this.superpixel.predictionCategories[this.superpixel.prediction].label}\n` +
                `Selected: ${this.superpixel.predictionCategories[this.superpixel.selectedCategory].label}\n` +
                `Slide: ${this.imageItemsById[this.superpixel.imageId].name}`
            );
        }
    }
});
</script>

<template>
  <div
    class="h-superpixel-card"
    data-toggle="tooltip"
    :title="tooltipText"
  >
    <button class="h-superpixel-region-button">
      <img :src="wsiRegionUrl">
      <img
        class="h-superpixel-region"
        :src="superpixelRegionUrl"
      >
    </button>
  </div>
</template>

<style scoped>
.h-superpixel-card {
    display: flex;
    flex-direction: column;
    background-color: white;
    border-style: solid;
    justify-content: center;
}

.h-superpixel-region-button {
    padding: 0;
    background-color: transparent;
    border: none;
    width: min-content;
}

.h-superpixel-region {
    position: relative;
    z-index: 100;
    float: left;
    margin-right: -100%;
}
</style>
