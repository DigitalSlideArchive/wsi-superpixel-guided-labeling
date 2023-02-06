<script>
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';
import ColorPickerInput from '@girder/histomicsui/vue/components/ColorPickerInput.vue';

const boundaryColor = 'rgba(0, 0, 0, 1)';
const defaultColor = 'rgb(255, 0, 0)';
const defaultCategory = {
    label: 'default',
    fillColor: 'rgba(0, 0, 0, 0)',
    strokeColor: 'rbga(0, 0, 0, 1)'
};


export default Vue.extend({
    props: ['backboneParent', 'largeImageItem', 'superpixelAnnotation'],
    components: {
        ColorPickerInput
    },
    mounted() {
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
            currentCategoryFillColor: defaultColor,
            lastClickEventId: 0
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
            if (newColor === oldColor) {
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
                if (!annotation || annotation.elements.length === 0) {
                    return;
                }
                const annotation = this.superpixelAnnotation.get('annotation');
                const superpixelElement = annotation.elements[0];
                const newCategories = JSON.parse(JSON.stringify(this.allNewCategories));
                superpixelElement.categories = newCategories;
                console.log('annotation', annotation);
                console.log('element', superpixelElement);
                // this.saveAnnotation();
                this._updatePixelmapLayerStyle();
            },
            deep: true
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
        }
    },
    methods: {
        generateInitialSuperpixels() {
            this.backboneParent.generateInitialSuperpixels(this.radius, this.magnification);
        },
        saveAnnotation() {
            this.backboneParent._saveAnnotation();
        },
        createCategories() {
            // TODO handle missing default, default in wrong position
            const pixelmapElement = this.superpixelAnnotation.get('annotation').elements[0];
            _.forEach(pixelmapElement.categories, (category, categoryIndex) => {
                if (categoryIndex !== 0) {
                    const labeledSuperpixels = _.chain(pixelmapElement.values)
                        .map((value, valueIndex) => {
                            value === categoryIndex ? valueIndex : 0;
                        })
                        .filter((value) => value !== 0)
                        .result();
                    this.categories.push({
                        category: category,
                        indices: labeledSuperpixels
                    });
                }
            });
            if(this.categories.length === 0) {
                this.categories.push({
                    category: {
                        label: 'New Category',
                        fillColor: 'rgba(255, 0, 0, 1)',
                        strokeColor: boundaryColor
                    },
                    indices: []
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

            const index = overlayElement.get('boundaries') ? (event.index - event.index % 2) : event.index;
            const offset = this.boundaries ? 1 : 0;
            const data = this.overlayLayer.data();
            // the +1 accounts for the default, reset to default if already labeled
            const categoryIndex = data[index] === 0 ? this.categoryIndex + 1 : 0;
            data[index] = data[index + offset] = categoryIndex;
            // TODO: save new pixelmap value
            this.overlayLayer.indexModified(index, index + offset).draw();

            const annotation = this.superpixelAnnotation.get('annotation');
            const superpixelElement = annotation.elements[0];
            const superpixelElementValueIndex = this.boundaries ? index / 2 : index;
            superpixelElement.values[superpixelElementValueIndex] = categoryIndex;
            const currentCategoryIndices = this.categories[this.categoryIndex].indices;
            if (categoryIndex === 0) {
                this.categories[this.categoryIndex].indices = _.filter(currentCategoryIndices, (i) => i !== index);
            } else {
                currentCategoryIndices.push(index);
            }
        },
        _onPixelmapRendered() {
            this.pixelmapRendered = true;
            this.createCategories();
            this.viewerWidget.on('g:mouseClickAnnotationOverlay', this._handlePixelmapClicked);
        },
        _drawBaseImageLayer() {
            if (this.viewerWidget) {
                this.viewerWidget.destroy();
            }
            this.viewerWidget = new ViewerWidget.geojs({
                parentView: this.backboneParent,
                el: this.$refs.map,
                itemId: this.largeImageItem.id,
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
                url: `item/${this.largeImageItem.id}/tiles`
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
                    fillColor: defaultColor,
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
    <div class="h-active-learning-setup-container">
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

            </div>
            <div class="h-setup-categories-body">
                <div ref="map" class="h-setup-categories-map"></div>
                <div class="h-category-setup-progress">
                    <div
                        v-for="(categoryLabels, index) in categories"
                        :key="index"
                    >
                        {{ categoryLabels.category.label }}: {{ categoryLabels.indices.length }} superpixels labeled
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.h-active-learning-setup-container {
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
</style>
