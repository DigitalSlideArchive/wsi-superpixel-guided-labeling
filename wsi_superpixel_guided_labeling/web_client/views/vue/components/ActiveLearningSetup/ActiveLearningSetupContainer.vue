<script>
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';
import ColorPickerInput from '@girder/histomicsui/vue/components/ColorPickerInput.vue';

const boundaryColor = 'rgba(0, 0, 0, 1)';
const defaultNewCategoryColor = 'rgba(255, 0, 0, 1)';
const defaultCategory = {
    label: 'default',
    fillColor: 'rgba(0, 0, 0, 0)',
    strokeColor: 'rgba(0, 0, 0, 1)'
};
const colorPattern = /^(#[0-9a-fA-F]{3,6}|rgb\(\d+,\s*\d+,\s*\d+\)|rgba\(\d+,\s*\d+,\s*\d+,\s*(\d?\.|)\d+\))$/;


export default Vue.extend({
    props: ['backboneParent', 'imageNamesById', 'annotationsByImageId'],
    components: {
        ColorPickerInput
    },
    mounted() {
        this.currentImageId = Object.keys(this.imageNamesById)[0];
        this.superpixelAnnotation = this.annotationsByImageId[this.currentImageId]['labels'];
        this.setupViewer();
    },
    created() {
        this.debounceSaveAnnotation = _.debounce(this.saveAnnotation, 250);
    },
    data() {
        return {
            categories: [],
            categoryIndex: 0,
            radius: 100,
            magnification: 5,
            viewerWidget: null,
            overlayLayer: null,
            superpixelElement: null,
            pixelmapRendered: false,
            currentCategoryLabel: 'New Category',
            currentCategoryFillColor: defaultNewCategoryColor,
            lastClickEventId: 0,
            currentImageId: '',
            superpixelAnnotation: null,
            hasLoaded: false
        };
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
                this.saveAnnotation();
                this._updatePixelmapLayerStyle();
            },
            deep: true
        },
        currentImageId() {
            this.superpixelAnnotation = this.annotationsByImageId[this.currentImageId]['labels'];
            this.setupViewer();
        }
    },
    computed: {
        validForm() {
            return this.radius > 0 && this.magnification > 0;
        },
        validCategory() {
            return true;
        },
        usingBoundaries() {
            const superpixelElement = this.superpixelAnnotation.get('annotation').elements[0];
            return superpixelElement.boundaries;
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
                    console.log(indicesByImage);
                    _.forEach(Object.values(indicesByImage), (indicesArray) => {
                        counts[label] += indicesArray.length;
                    });
                }
            });
            return counts;
        }
    },
    methods: {
        generateInitialSuperpixels() {
            this.backboneParent.generateInitialSuperpixels(this.radius, this.magnification);
        },
        saveAnnotation() {
            this.backboneParent.saveLabelAnnotations();
        },
        createCategories() {
            // TODO handle missing default, default in wrong position
            _.forEach(Object.entries(this.annotationsByImageId), ([imageId, annotations]) => {
                const pixelmapElement = annotations['labels'].get('annotation').elements[0];
                const existingCategories = _.map(this.categories, (category) => category.category.label);
                _.forEach(pixelmapElement.categories, (category, categoryIndex) => {
                    if (categoryIndex !== 0) {
                        const labeledSuperpixels = [];
                        _.forEach(pixelmapElement.values, (value, index) => {
                            if (value === categoryIndex) {
                                labeledSuperpixels.push(index);
                            }
                        });
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
            });
            if(this.categories.length === 0) {
                this.categories.push({
                    category: {
                        label: 'New Category',
                        fillColor: 'rgba(255, 0, 0, 1)',
                        strokeColor: boundaryColor
                    },
                    indices: {}
                });
            }
            this.categoryIndex = 0;
            this.currentCategoryLabel = this.categories[0]['category']['label'];
            this.currentCategoryFillColor = this.categories[0]['category']['fillColor'];
        },
        _addCategoryToAnnotation() {
            const superpixelElement = this.superpixelAnnotation.get('annotation').elements[0];
            superpixelElement.categories = this.allNewCategories;
        },
        _updatePixelmapLayerStyle() {
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
        _drawPixelmapAnnotation() {
            this.viewerWidget.drawAnnotation(this.superpixelAnnotation);
        },
        _handlePixelmapClicked(overlayElement, overlayLayer, event) {
            if (
                this.lastClickEventId === event.eventID       // Duplicate event firing
                || overlayElement.get('type') !== 'pixelmap'  // Not a pixelmap event
                || !event.mouse.buttonsDown.left              // Not a left click
            ) {
                return;
            }
            this.lastClickEventId = event.eventID;

            const boundaries = overlayElement.get('boundaries');
            const index = boundaries ? (event.index - event.index % 2) : event.index;
            const offset = boundaries ? 1 : 0;
            const data = this.overlayLayer.data();
            // the +1 accounts for the default, reset to default if already labeled
            const categoryIndex = data[index] === 0 ? this.categoryIndex + 1 : 0;
            data[index] = data[index + offset] = categoryIndex;
            this.overlayLayer.indexModified(index, index + offset).draw();

            // Save annotation
            const annotation = this.superpixelAnnotation.get('annotation');
            const superpixelElement = annotation.elements[0];
            let newData = _.clone(data);
            if (boundaries) {
                newData = _.filter(newData, (d, i) => i % 2 === 0);
            }
            superpixelElement.values = newData;
            this.debounceSaveAnnotation();

            // Update running count
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
        _onPixelmapRendered() {
            this.pixelmapRendered = true;
            if (!this.hasLoaded) {
                this.createCategories();
                this.hasLoaded = true;
            }
            this.viewerWidget.on('g:mouseClickAnnotationOverlay', this._handlePixelmapClicked);
        },
        _drawBaseImageLayer() {
            if (this.viewerWidget) {
                this.viewerWidget.destroy();
            }
            this.viewerWidget = new ViewerWidget.geojs({
                parentView: this.backboneParent,
                el: this.$refs.map,
                itemId: this.currentImageId,
            });
            this.viewerWidget.on('g:imageRendered', this._drawPixelmapAnnotation);
            this.viewerWidget.on('g:drawOverlayAnnotation', (element, layer) => {
                if (element.type === 'pixelmap') {
                    this.overlayLayer = layer;
                    this.superpixelElement = element;
                    this._onPixelmapRendered();
                }
            });
        },
        setupViewer() {
            if (!this.superpixelAnnotation) {
                return;
            }
            restRequest({
                url: `item/${this.currentImageId}/tiles`
            }).done((imageMetadata) => {
                this._drawBaseImageLayer()
            })
        },
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
                indices: []
            });
            this.categoryIndex = this.categories.length - 1;
        },
        beginTraining() {
            console.log('Beginning training...');
        }
    }
});
</script>

<template>
    <div class="h-active-learning-container">
        <div
            class="h-al-setup-superpixels"
            v-if="!superpixelAnnotation"
        >
            <div class="form-group">
                <label for="radius">Superpixel Radius</label>
                <div class="form-group-description">Approximate superpixel radius in pixels</div>
                <input
                    id="radius"
                    class="form-control input-sm h-active-learning-input"
                    v-model.number="radius"
                    type="number"
                >
            </div>
            <div class="form-group">
                <label for="magnification">Magnification</label>
                <div class="form-group-description">Image magnification for superpixel generation</div>
                <input
                    id="magnification"
                    class="form-control input-sm h-active-learning-input"
                    v-model.number="magnification"
                    type="number"
                >
            </div>
            <button
                class="btn btn-primary h-generate-superpixel-btn"
                :disabled="!validForm"
                @click="generateInitialSuperpixels"
            >
                Generate superpixels
            </button>
        </div>
        <div
            class="h-al-setup-categories"
            v-else
        >
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
    </div>
</template>

<style scoped>
.h-active-learning-container {
    margin-left: 10px;
    width: 100%;
    height: 100%;
    position: absolute;
}
.h-active-learning-input {
    width: 30%;
}
.h-generate-superpixel-btn {
    display: block;
}
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
</style>
