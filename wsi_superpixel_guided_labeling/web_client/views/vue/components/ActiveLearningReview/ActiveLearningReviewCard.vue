<script>
import Vue from 'vue';
import _ from 'underscore';

import { store } from '../store';

export default Vue.extend({
    props: ['superpixel', 'previewSize', 'cardDetails'],
    data() {
        return {
            override: false,
            selected: []
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
        },
        categories() {
            return _.rest(this.superpixel.labelCategories);
        },
        agree() {
            const predicted = this.superpixel.predictionCategories[this.superpixel.prediction];
            const selected = this.superpixel.labelCategories[this.superpixel.selectedCategory];
            return selected.label === predicted.label;
        }
    }
});
</script>

<template>
  <div>
    <div class="card-controls">
      <button :class="['h-superpixel-region-button', previewSizeClass]">
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
    <div
      v-if="cardDetails.includes('selectedCategory')"
      :style="{'display': 'flex', 'flex-direction': 'column'}"
    >
      <select
        class="categories-selector"
      >
        <option :value="null" :disabled="!superpixel.reviewCategory">
          {{ !superpixel.reviewCategory ? '' : 'Clear Review' }}
        </option>
        <option
          v-for="(category, index) in categories"
          :key="index"
          :value="index + 1"
          :selected="superpixel.selectedCategory === index + 1"
        >
          {{ category.label }}
        </option>
      </select>
    </div>
    <div
      v-if="cardDetails.includes('confidence')"
      class="text-region"
    >
      <span class="text-region-label">Confidence</span>
      <span class="dotted-line-connector" />
      <span
        data-toggle="tooltip"
        :title="superpixel.confidence"
        class="text-region-value"
      >
        {{ superpixel.confidence.toPrecision(4) }}
      </span>
    </div>
    <div
      v-if="cardDetails.includes('certainty')"
      class="text-region"
    >
      <span class="text-region-label">Certainty</span>
      <span class="dotted-line-connector" />
      <span
        data-toggle="tooltip"
        :title="superpixel.certainty"
        class="text-region-value"
      >
        {{ superpixel.certainty.toPrecision(4) }}
      </span>
    </div>
    <div
      v-if="cardDetails.includes('prediction')"
      class="prediction"
      :style="[{'background-color': superpixel.predictionCategories[superpixel.prediction].fillColor}]"
    >
      <i
        v-if="agree"
        class="icon-ok"
      />
      <i
        v-else
        class="icon-cancel"
      />
      <span>{{ superpixel.predictionCategories[superpixel.prediction].label }}</span>
    </div>
  </div>
</template>

<style scoped>
.h-superpixel-region-button {
    padding: 0;
    background-color: transparent;
    border: none;
    width: min-content;
    text-align: left;
    margin: auto;
    margin-bottom: 5px;
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

.text-region {
    display: flex;
    justify-content: space-between;
}

.text-region-label::after {
    content: " ";
    flex: 1;
    border-bottom: 1px dotted #000;
}

.text-region-value {
    max-width: 40%;
    text-wrap: nowrap;
}

.categories-selector {
    width: 100%;
    border-radius: 3px;
    border-color: #888;
    background-color: #fff;
}

.prediction {
    display: flex;
    justify-content: center;
    border-radius: 3px;
}

.card-controls {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.dotted-line-connector {
  width: 100%;
  position: relative;
  bottom: -1.4rem;
  height: 0;
  border-bottom: 1px dotted rgba(1, 1, 1, 0.5);
}
</style>
