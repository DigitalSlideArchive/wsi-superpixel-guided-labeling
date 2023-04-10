<script>
import Vue from 'vue';
import _ from 'underscore';

import { store, nextCard } from './store';

export default Vue.extend({
    props: ['index'],
    computed: {
        superpixelDecision() {
            return store.superpixelsToDisplay[this.index]
        },
        agreeChoice() {
            return this.superpixelDecision.agreeChoice;
        },
        predictedCategory() {
            return this.superpixelDecision.categories[this.superpixelDecision.prediction];
        },
        selectedCategory() {
            return this.superpixelDecision.selectedCategory;
        },
        labelAnnotation() {
            return store.annotationsByImageId[this.superpixelDecision.imageId]['labels'];
        },
        apiRoot() {
            return store.apiRoot;
        },
        selectedIndex() {
            return store.selectedIndex;
        },
        lastCategorySelected() {
            return store.lastCategorySelected;
        },
        isSelected() {
            return this.selectedIndex === this.index;
        },
        headerStyle() {
            return {
                'font-size': '80%',
                'background-color': this.superpixelDecision.categories[this.superpixelDecision.prediction].fillColor
            };
        },
        headerTitle() {
            return `Prediction: ${this.predictedCategory.label}`;
        },
        headerConfidence() {
            return `Confidence ${this.superpixelDecision.confidence.toFixed(5)}`;
        },
        validNewCategories() {
            const categories = this.superpixelDecision.categories;
            return _.filter(categories, (c, index) => {
                return index !== this.superpixelDecision.prediction && c.label !== 'default';
            });
        },
        wsiRegionUrl() {
            const imageId = this.superpixelDecision.imageId;
            const bbox = this.superpixelDecision.bbox;
            const regionWidth = bbox[2] - bbox[0];
            const regionHeight = bbox[3] - bbox[1];
            const scaleFactor = Math.max(regionWidth, regionHeight);
            const thumbnailWidth = Math.floor(125 * regionWidth / scaleFactor);
            const thumbnailHeight = Math.floor(125 * regionHeight / scaleFactor);
            const params = `?left=${bbox[0]}&top=${bbox[1]}&right=${bbox[2]}&bottom=${bbox[3]}&width=${thumbnailWidth}&height=${thumbnailHeight}`;
            return `${this.apiRoot}/item/${imageId}/tiles/region${params}`;
        },
        superpixelRegionUrl() {
            const imageId = this.superpixelDecision.superpixelImageId;
            const index = this.superpixelDecision.index;
            const pixelVals = this.superpixelDecision.boundaries ? [index * 2, index * 2 + 1] : [index];
            const bbox = this.superpixelDecision.bbox;
            const scale = this.superpixelDecision.scale;
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
            store.changeLog.push(this.superpixelDecision);
        },
        /**
         * Have a way to map between different lists of categories so that when we set the category for
         * the current superpixel, we use the right index.
         */
        categoryIndex(label) {
            return _.map(this.superpixelDecision.categories, (category) => category.label).indexOf(label);
        }
    },
    watch: {
        agreeChoice() {
            if (this.agreeChoice === 'Yes') {
                this.superpixelDecision.selectedCategory = this.superpixelDecision.prediction;
            } else if (this.agreeChoice === undefined) {
                this.superpixelDecision.selectedCategory = 0;
            } else {
                // agreeChoice === 'No'
                if (!this.selectedCategory) {
                    this.superpixelDecision.selectedCategory = this.categoryIndex(this.validNewCategories[0].label);
                }
            }
        },
        selectedCategory(newCat, oldCat) {
            if (oldCat === undefined) {
                return;
            }
            const element = this.labelAnnotation.get('annotation').elements[0];
            const values = JSON.parse(JSON.stringify(element.values));
            values[this.superpixelDecision.index] = this.superpixelDecision.selectedCategory;
            element.values = values;
            store.changeLog.push(this.superpixelDecision);
        },
        lastCategorySelected(categoryNumber) {
            if (!this.isSelected || typeof categoryNumber !== 'number') {
                return;
            }
            if (categoryNumber === 0) {
                this.superpixelDecision.agreeChoice = undefined;
            } else if (categoryNumber <= this.superpixelDecision.categories.length) {
                // Be extra careful to select the correct category
                const newCategory = store.categories[categoryNumber];
                const newCategoryIndex = this.categoryIndex(newCategory.label);
                this.superpixelDecision.selectedCategory = newCategoryIndex;
                if (newCategoryIndex === this.superpixelDecision.prediction) {
                    this.superpixelDecision.agreeChoice = 'Yes';
                } else {
                    this.superpixelDecision.agreeChoice = 'No';
                }
                this.$nextTick(() => nextCard());
            }
            store.lastCategorySelected = null; // reset state
        }
    },
    mounted() {
        if(!this.superpixelDecision.selectedCategory) {
           this.superpixelDecision.selectedCategory = 0;
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
                <input
                    id="radio-yes"
                    type="radio"
                    value="Yes"
                    v-model="superpixelDecision.agreeChoice"
                />
                <label for="radio-no">No</label>
                <input
                    id="radio-no"
                    type="radio"
                    value="No"
                    v-model="superpixelDecision.agreeChoice"
                />
            </div>
            <div
                v-if="superpixelDecision.agreeChoice === 'No'"
                class="h-superpixel-card-footer-content"
            >
                <select
                    v-model="superpixelDecision.selectedCategory"
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
            <!-- <div
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
            </div> -->
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
    min-height: 185px;
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
