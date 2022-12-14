<script>
import Vue from 'vue';
import _ from 'underscore';

import store from './store';

export default Vue.extend({
    props: ['superpixel', 'index'],
    computed: {
        agreeChoice() {
            return this.superpixel.agreeChoice;
        },
        predictedCategory() {
            return this.superpixel.categories[this.superpixel.prediction];
        },
        selectedCategory() {
            return this.superpixel.selectedCategory;
        },
        labelAnnotation() {
            return store.annotationsByImageId[this.superpixel.imageId]['labels'];
        },
        apiRoot() {
            return store.apiRoot;
        },
        selectedIndex() {
            return store.selectedIndex;
        },
        isSelected() {
            return this.selectedIndex === this.index;
        },
        headerStyle() {
            return {
                'font-size': '80%',
                'background-color': this.superpixel.categories[this.superpixel.prediction].fillColor
            };
        },
        headerTitle() {
            return `Prediction: ${this.predictedCategory.label}`;
        },
        headerConfidence() {
            return `Confidence ${this.superpixel.confidence.toFixed(5)}`;
        },
        validNewCategories() {
            const categories = this.superpixel.categories;
            return _.filter(categories, (c, index) => index !== this.superpixel.prediction);
        },
        wsiRegionUrl() {
            const imageId = this.superpixel.imageId;
            const bbox = this.superpixel.bbox;
            const regionWidth = bbox[2] - bbox[0];
            const regionHeight = bbox[3] - bbox[1];
            const scaleFactor = Math.max(regionWidth, regionHeight);
            const thumbnailWidth = Math.floor(125 * regionWidth / scaleFactor);
            const thumbnailHeight = Math.floor(125 * regionHeight / scaleFactor);
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
            const thumbnailWidth = Math.floor(125 * regionWidth / scaleFactor);
            const thumbnailHeight = Math.floor(125 * regionHeight / scaleFactor);
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
        }
    },

    methods: {
        selectSuperpixelCard() {
            store.selectedIndex = this.index;
        },
        onCategorySelectChange() {
            store.changeLog.push(this.superpixel);
        },
        categoryIndex(label) {
            return _.map(this.superpixel.categories, (category) => category.label).indexOf(label);
        }
    },
    watch: {
        agreeChoice() {
            if (this.agreeChoice === 'Yes') {
                this.superpixel.selectedCategory = this.superpixel.prediction;
            } else if (this.agreeChoice === undefined) {
                this.superpixel.selectedCategory = 0;
            } else {
                // agreeChoice === 'No'
                this.superpixel.selectedCategory = (this.superpixel.prediction === 0) ? 1 : 0;
            }
        },
        selectedCategory(newCat, oldCat) {
            if (oldCat === undefined) {
                return;
            }
            const element = this.labelAnnotation.get('annotation').elements[0];
            const values = JSON.parse(JSON.stringify(element.values));
            values[this.superpixel.index] = this.superpixel.selectedCategory;
            element.values = values;
            store.changeLog.push(this.superpixel);
        }
    },
    mounted() {
        if(!this.superpixel.selectedCategory) {
           this.superpixel.selectedCategory = 0;
        }
    }
});
</script>

<template>
    <div :class="{'h-superpixel-card': true, 'h-superpixel-card--selected': isSelected }">
        <div
            class="h-superpixel-card-header"
            :style="headerStyle"
            :title="headerConfidence"
        >
            {{ headerTitle }}
        </div>
        <div class="h-superpixel-body">
            <div
                class="h-superpixel-container"
                @click="selectSuperpixelCard"
            >
                <img
                    class="h-superpixel-img h-wsi-region"
                    :src="wsiRegionUrl"
                />
                <img
                    class="h-superpixel-img h-superpixel-region"
                    :src="superpixelRegionUrl"
                />
            </div>
        </div>
        <div class="h-superpixel-card-footer">
            <div class="h-superpixel-card-agree h-superpixel-card-footer-content">
                <label>Agree? </label>
                <label for="radio-yes">Yes</label>
                <input id="radio-yes" type="radio" value="Yes" v-model="superpixel.agreeChoice" />
                <label for="radio-no">No</label>
                <input id="radio-no" type="radio" value="No" v-model="superpixel.agreeChoice" />
            </div>
            <div
                v-if="superpixel.agreeChoice === 'No'"
                class="h-superpixel-card-footer-content"
            >
                <select
                    v-model="superpixel.selectedCategory"
                    class="h-superpixel-card-select"
                >
                    <option
                        v-for="category in validNewCategories"
                        :key="category.label"
                        :value="categoryIndex(category.label)"
                    >
                        Class: {{ category.label }}
                    </option>
                </select>
            </div>
            <div
                v-else
                class="h-superpixel-card-footer-content"
            >
                <select
                    disabled="true"
                    class="h-superpixel-card-select"
                >
                    <option :value="predictedCategory">
                        Class: {{ predictedCategory.label }}
                    </option>
                </select>
            </div>
        </div>
    </div>
</template>

<style scoped>
.h-superpixel-card {
    display: flex;
    flex-direction: column;
    column-gap: 0px;
    background-color: white;
    border-radius: 5px;
    width: 140px;
}

.h-superpixel-card--selected {
    border: 4px solid yellow;
}

.h-superpixel-container {
    position: relative;
    height: 125px;
    width: 125px;
}

.h-wsi-region {
    position: absolute;
    left: 0px;
    top: 0px;
    z-index: 60;
}

.h-superpixel-region {
    position: absolute;
    left: 0px;
    top: 0px;
    z-index: 70;
}

.h-superpixel-card-header {
    border-top-left-radius: 5px;
    border-top-right-radius: 5px;
}

.h-superpixel-body {
    display: flex;
    justify-content: center;
}

.h-superpixel-card-footer {
    display: flex;
    flex-direction: column;
    justify-content: space-around;

}

.h-superpixel-card-footer > * {
    font-size: 80%;
}

.h-superpixel-card-footer-content {
    display: flex;
    flex-direction: row;
    justify-content: center;
    gap: 2px;
}

.h-superpixel-card-select {
    width: 90%;
}
</style>
