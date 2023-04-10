<script>
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';
import ColorPickerInput from '@girder/histomicsui/vue/components/ColorPickerInput.vue';

// Define some helpful constants for adding categories
const boundaryColor = 'rgba(0, 0, 0, 1)';
const defaultNewCategoryColor = 'rgba(255, 0, 0, 0.5)';
const defaultCategory = {
    label: 'default',
    fillColor: 'rgba(0, 0, 0, 0)',
    strokeColor: 'rgba(0, 0, 0, 1)'
};
const colorPattern = /^(#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgb\(\d+,\s*\d+,\s*\d+\)|rgba\(\d+,\s*\d+,\s*\d+,\s*(\d?\.|)\d+\))$/;

export default Vue.extend({
    props: ['backboneParent', 'imageNamesById', 'annotationsByImageId'],
    components: {
        ColorPickerInput
    },
    mounted() {
        this.currentImageId = Object.keys(this.imageNamesById)[0];
        this.superpixelAnnotation = this.annotationsByImageId[this.currentImageId].labels;
        this.setupViewer();
    },
    created() {
        this.debounceSaveAnnotations = _.debounce(this.saveAnnotations, 250);
    },
    data() {
        return {
            hasLoaded: false,
            // data tracking current categories/currently active category
            categories: [],
            // TODO add comment describing shape of objects in this list
            categoryIndex: 0,
            currentCategoryLabel: 'New Category',
            currentCategoryFillColor: defaultNewCategoryColor,
            // keep track of the current image and annotation to edit
            currentImageId: '',
            superpixelAnnotation: null,
            superpixelElement: null,
            // data to track the viewer widget/map/layers if needed
            viewerWidget: null,
            overlayLayer: null,
            pixelmapRendered: false,
        }
    },
    computed: {
        usingBoundaries() {
            return this.superpixelElement.boundaries;
        },
        allNewCategories() {
            const activeLearningCategories = _.map(this.categories, (category) => category.category);
            return [defaultCategory, ...activeLearningCategories];
        },
        labeledSuperpixelCounts() {
            const counts = {};
            _.forEach(this.categories, (categoryAndIndices) => {
                const label = categoryAndIndices.category.label;
                counts[label] = 0;
                if (label !== 'default') {
                    const indicesByImage = categoryAndIndices.indices;
                    _.forEach(Object.values(indicesByImage), (indicesArray) => {
                        counts[label] += indicesArray.length;
                    });
                }
            });
            return counts;
        }
    },
    methods: {
        /***********************************
         * IMAGE VIEWER AND CATEGORY SETUP *
         ***********************************/
        setupViewer() {
            if (!this.superpixelAnnotation) {
                return;
            }
            restRequest({
                url: `item/${this.currentImageId}/tiles`
            }).done(() => {
                this.drawBaseImageLayer();
            });
        },
        drawBaseImageLayer() {
            if (this.viewerWidget) {
                this.viewerWidget.destroy();
            }
            this.viewerWidget = new ViewerWidget.geojs({
                parentView: this.backboneParent,
                el: this.$refs.map,
                itemId: this.currentImageId
            });
            this.viewerWidget.on('g:imageRendered', this.drawPixelmapAnnotation);
            this.viewerWidget.on('g:drawOverlayAnnotation', (element, layer) => {
                if (element.type === 'pixelmap') {
                    this.overlayLayer = layer;
                    this.superpixelElement = element;
                    this.onPixelmapRendered();
                }
            });
        },
        drawPixelmapAnnotation() {
            this.viewerWidget.drawAnnotation(this.superpixelAnnotation);
        },
        onPixelmapRendered() {
            this.pixelmapRendered = true;
            if (!this.hasLoaded) {
                this.createCategories();
                this.hasLoaded = true;
            }
            this.viewerWidget.on('g:mouseClickAnnotationOverlay', this.handlePixelmapClicked);
        },
        createCategories() {
            // TODO handle missing default, default in wrong position
            _.forEach(Object.entries(this.annotationsByImageId), ([imageId, annotations]) => {
                const pixelmapElement = annotations['labels'].get('annotation').elements[0];
                const existingCategories = _.map(this.categories, (category) => category.category.label);
                this.createCategoriesFromPixelmapElement(pixelmapElement, imageId, existingCategories);
            });
            if(this.categories.length === 0) {
                this.categories.push({
                    category: {
                        label: 'New Category',
                        fillColor: defaultNewCategoryColor,
                        strokeColor: boundaryColor
                    },
                    indices: {}
                });
            }
            this.categoryIndex = 0;
            this.currentCategoryLabel = this.categories[0]['category']['label'];
            this.currentCategoryFillColor = this.categories[0]['category']['fillColor'];
        },
        createCategoriesFromPixelmapElement(pixelmapElement, imageId, existingCategories) {
            _.forEach(pixelmapElement.categories, (category, categoryIndex) => {
                if (categoryIndex !== 0) {
                    // For each non-default category, get all the labeled indices
                    // for this superpixel element.
                    const labeledSuperpixels = [];
                    _.forEach(pixelmapElement.values, (value, index) => {
                        if (value === categoryIndex) {
                            labeledSuperpixels.push(index);
                        }
                    });
                    // Either add the category to the initial label UI,
                    // or increment the count if it already exists.
                    if (!existingCategories.includes(category.label)) {
                        const indices = {};
                        indices[this.currentImageId] = labeledSuperpixels;
                        this.categories.push({
                            category: category,
                            indices: indices
                        });
                    } else if (labeledSuperpixels.length) {
                        const categoryToUpdateIndex = _.findIndex(this.categories, (categoryAndIndices) => categoryAndIndices.category.label === category.label);
                        this.categories[categoryToUpdateIndex]['indices'][imageId] = labeledSuperpixels;
                    }
                }
            });
        },
        /************************
         * PIXELMAP INTERACTION *
         ************************/
        updatePixelmapLayerStyle() {
            const categoryMap = this.allNewCategories;
            const boundaries = this.usingBoundaries;
            _.forEach(this.overlayLayer.features(), (feature) => {
                feature.style('color', (d, i) => {
                    if (d < 0 || d >= categoryMap.length) {
                        console.warn(`No category found at index ${d} in the category map.`);
                        return 'rgba(0, 0, 0, 0)';
                    }
                    const category = categoryMap[d];
                    if (boundaries) {
                        return (i % 2 === 0) ? category.fillColor : category.strokeColor;
                    }
                    return category.fillColor;
                });
            });
            this.overlayLayer.draw();
        },
        handlePixelmapClicked(overlayElement, overlayLayer, event) {
            if (
                overlayElement.get('type') !== 'pixelmap'  // Not a pixelmap event
                || !event.mouse.buttonsDown.left              // Not a left click
            ) {
                return;
            }

            const boundaries = overlayElement.get('boundaries');
            const index = boundaries ? (event.index - event.index % 2) : event.index;
            const offset = boundaries ? 1 : 0;
            const data = this.overlayLayer.data();
            // the +1 accounts for the default, reset to default if already labeled
            const categoryIndex = data[index] === 0 ? this.categoryIndex + 1 : 0;
            data[index] = data[index + offset] = categoryIndex;
            this.overlayLayer.indexModified(index, index + offset).draw();

            this.saveNewPixelmapData(boundaries, _.clone(data));
            this.updateRunningLabelCounts(boundaries, index, categoryIndex);
        },
        saveNewPixelmapData(boundaries, data) {
            const annotation = this.superpixelAnnotation.get('annotation');
            const superpixelElement = annotation.elements[0];
            if (boundaries) {
                data = _.filter(data, (d, i) => i % 2 === 0);
            }
            superpixelElement.values = data;
            this.debounceSaveAnnotations();
        },
        updateRunningLabelCounts(boundaries, index, categoryIndex) {
            const elementValueIndex = boundaries ? index / 2 : index;
            const currentCategoryIndices = this.categories[this.categoryIndex].indices[this.currentImageId] || [];
            if (categoryIndex === 0) {
                this.categories[this.categoryIndex].indices[this.currentImageId] = _.filter(currentCategoryIndices, (i) => i !== elementValueIndex);
            } else {
                currentCategoryIndices.push(elementValueIndex);
                this.categories[this.categoryIndex].indices[this.currentImageId] = currentCategoryIndices;
                // Force computed properties to update
                const newCategoryData = Object.assign({}, this.categories[this.categoryIndex]);
                this.categories.splice(this.categoryIndex, 1, newCategoryData);
            }
        },
        /*************************
         * RESPOND TO USER INPUT *
         *************************/
        nextCategory() {
            this.categoryIndex += 1;
        },
        previousCategory() {
            this.categoryIndex -= 1;
        },
        addCategory() {
            this.categories.push({
                category: {
                    label: 'New Category',
                    fillColor: defaultNewCategoryColor,
                    strokeColor: boundaryColor
                },
                indices: {}
            });
            this.categoryIndex = this.categories.length - 1;
        },
        /**********************************
         * USE BACKBONE CONTAINER METHODS *
         **********************************/
        beginTraining() {
            this.backboneParent.retrain(true);
        },
        saveAnnotations() {
            this.backboneParent.saveLabelAnnotations();
        }
    },
    watch: {
        currentCategoryLabel(newLabel, oldLabel) {
            if (newLabel === oldLabel) {
                return;
            }
            this.categories[this.categoryIndex]['category']['label'] = this.currentCategoryLabel;
        },
        currentCategoryFillColor(newColor, oldColor) {
            if (newColor === oldColor || !colorPattern.test(newColor)) {
                return;
            }
            this.categories[this.categoryIndex]['category']['fillColor'] = this.currentCategoryFillColor;
        },
        categoryIndex() {
            this.currentCategoryLabel = this.categories[this.categoryIndex]['category']['label'];
            this.currentCategoryFillColor = this.categories[this.categoryIndex]['category']['fillColor'];
        },
        categories: {
            handler() {
                _.forEach(Object.values(this.annotationsByImageId), (annotations) => {
                    const superpixelElement = annotations['labels'].get('annotation').elements[0];
                    if (superpixelElement) {
                        superpixelElement.categories = JSON.parse(JSON.stringify(this.allNewCategories));
                    }
                });
                this.debounceSaveAnnotations();
                this.updatePixelmapLayerStyle();
            },
            deep: true
        },
        currentImageId() {
            this.superpixelAnnotation = this.annotationsByImageId[this.currentImageId]['labels'];
            this.setupViewer();
        }
    }
});
</script>

<template>
    <div class="h-al-setup-categories">
        <div
            v-if="pixelmapRendered"
            class="h-add-new-category"
        >
            <div class="form-group">
                <label for="category-label">Label</label>
                <input
                    id="category-label"
                    class="form-control input-sm h-active-learning-input"
                    v-model.lazy="currentCategoryLabel"
                >
            </div>
            <div class="form-group">
                <label for="fill-color">Fill Color</label>
                <color-picker-input
                    :key="categoryIndex"
                    style="width: 30%"
                    :color="currentCategoryFillColor"
                    v-model="currentCategoryFillColor"
                />
            </div>
            <button
                class="btn btn-primary h-previous-category-btn"
                :disabled="categoryIndex === 0"
                @click="previousCategory"
            >
                Previous
            </button>
            <button
                class="btn btn-primary h-next-category-btn"
                :disabled="categoryIndex >= categories.length - 1"
                @click="nextCategory"
            >
                Next
            </button>
            <button
                class="btn btn-primary h-add-category-btn"
                @click="addCategory"
            >
                Add Category
            </button>
            <button
                class="btn btn-primary h-start-training-btn"
                @click="beginTraining"
            >
                Begin training
            </button>
            <div class="h-al-image-selector">
                <span>Image: </span>
                <select
                    v-model="currentImageId"
                    class="h-al-image-select"
                >
                    <option
                        v-for="imageId in Object.keys(imageNamesById)"
                        :key="imageId"
                        :value="imageId"
                    >
                        {{ imageNamesById[imageId] }}
                    </option>
                </select>
            </div>
        </div>
        <div class="h-setup-categories-body">
            <div ref="map" class="h-setup-categories-map"></div>
            <div class="h-category-setup-progress">
                <div
                    v-for="(label, index) in Object.keys(labeledSuperpixelCounts)"
                    :key="index"
                >
                    {{ label }}: {{ labeledSuperpixelCounts[label] }} superpixels labeled
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.h-al-setup-categories {
    width: 100%;
    height: 100%;
    position: absolute;
    display: flex;
    flex-direction: column;
}
.h-setup-categories-body {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: row;
}
.h-setup-categories-map {
    width: 67%;
    height: 100%;
}
.h-al-image-selector {
    display: block;
    padding-top: 8px;
}
.h-active-learning-input {
    width: 30%;
}
</style>
