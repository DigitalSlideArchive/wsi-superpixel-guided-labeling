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
            const thumbnailSize = this.previewSize * 100;
            const params = `?left=${bbox[0]}&top=${bbox[1]}&right=${bbox[2]}&bottom=${bbox[3]}&width=${thumbnailSize}&height=${thumbnailSize}`;
            return `${this.apiRoot}/item/${imageId}/tiles/region${params}`;
        },
        superpixelRegionUrl() {
            const imageId = this.superpixel.superpixelImageId;
            const index = this.superpixel.index;
            const pixelVals = this.superpixel.boundaries ? [index * 2, index * 2 + 1] : [index];
            const bbox = this.superpixel.bbox;
            const scale = this.superpixel.scale;
            const thumbnailSize = this.previewSize * 100;
            const params = `?left=${bbox[0] / scale}&top=${bbox[1] / scale}&right=${bbox[2] / scale}&bottom=${bbox[3] / scale}&width=${thumbnailSize}&height=${thumbnailSize}&encoding=PNG`;
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
        previewSizeClass() {
            switch (this.previewSize) {
                case 0.25:
                    return 'one-quarter-size';
                case 0.50:
                    return 'one-half-size';
                case 0.75:
                    return 'three-quarters-size';
                case 1.00:
                    return 'full-size';
                default:
                    return '';
            }
        }
    }
});
</script>

<template>
  <div :class="['h-superpixel-card', previewSizeClass]">
    <button class="h-superpixel-region-button">
      <img
        :src="wsiRegionUrl"
        loading="lazy"
      >
      <img
        class="h-superpixel-region"
        :src="superpixelRegionUrl"
        loading="lazy"
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
    box-sizing: content-box
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

.one-quarter-size {
    height: 25px;
    width: 25px;
}

.one-half-size {
    height: 50px;
    width: 50px;
}

.three-quarters-size {
    height: 75px;
    width: 75px;
}

.full-size {
    height: 100px;
    width: 100px;
}
</style>
