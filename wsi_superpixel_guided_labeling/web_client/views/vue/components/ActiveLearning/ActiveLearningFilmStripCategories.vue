<script>
/* global geo */ // eslint-disable-line no-unused-vars
import { schemeCategory10 } from 'd3-scale-chromatic';

import EditCategoryModal from './EditCategoryModal.vue';

import { store } from './store.js';

export default {
    components: { EditCategoryModal },
    data() {
        return {
            editCategory: false,
            editCategoryIndex: 0,
            editCategoryColor: '',
            editCategoryLabel: '',
            editingCategory: false,
            modalTitle: 'Edit Category',
            activeCategoryIndex: null,
            categories: [{
                label: 'Background',
                fillColor: schemeCategory10[0],
                strokeColor: '#000'
            }],
            pixelmapPaintValue: null
        };
    },
    computed: {
        labelsLayer() {
            return store.labelsLayer;
        },
        labelsElement() {
            return store.labelsElement;
        },
        viewerWidget() {
            return store.viewerWidget;
        }
    },
    watch: {
        labelsLayer() {
            console.log('labels layer changed');
        },
        labelsElement() {
            console.log('labels element changed');
        },
        viewerWidget() {
            console.log('viewerWidgetChanging');
            this.setupMouseEvents();
        }
    },
    mounted() {
        this.setupMouseEvents();
    },
    methods: {
        setupMouseEvents() {
            if (!this.viewerWidget) {
                return;
            }
            // TODO prevent double-binding
            this.viewerWidget.on('g:mouseClickAnnotationOverlay', this.handlePixelmapClicked);
            this.viewerWidget.on('g:mouseOverAnnotationOverlay', this.handleMouseOverPixelmap);
            this.viewerWidget.on('g:mouseDownAnnotationOverlay', this.handleMouseDownPixelmap);
            this.viewerWidget.on('g:mouseUpAnnotationOverlay', () => {
                this.pixelmapPaintValue = null;
            });
            this.viewerWidget.viewer.interactor().removeAction(geo.geo_action.zoomselect);
        },
        /************************
         * PIXELMAP INTERACTION *
         ************************/
        handlePixelmapClicked(overlayElement, overlayLayer, event) {
            if (
                overlayElement.get('type') !== 'pixelmap' ||
                !event.mouse.buttonsDown.left ||
                overlayElement.get('id') !== this.labelsElement.id
            ) {
                return;
            }
            this.updatePixelmapData(overlayElement, event);
        },
        handleMouseOverPixelmap(overlayElement, overlayLayer, event) {
            if (
                overlayElement.get('type') !== 'pixelmap' ||
                !event.mouse.buttons.left ||
                !event.mouse.modifiers.shift ||
                overlayElement.get('id') !== this.labelsElement.id
            ) {
                return;
            }
            this.updatePixelmapData(overlayElement, event);
        },
        handleMouseDownPixelmap(overlayElement, overlayLayer, event) {
            if (
                overlayElement.get('type') !== 'pixelmap' ||
                !event.mouse.buttons.left ||
                !event.mouse.modifiers.shift ||
                overlayElement.get('id') !== this.labelsElement.id
            ) {
                return;
            }
            if (this.pixelmapPaintValue === null) {
                this.pixelmapPaintValue = event.data === this.activeCategoryIndex + 1 ? 0 : this.activeCategoryIndex + 1;
            }
            this.updatePixelmapData(overlayElement, event);
        },
        updatePixelmapData(overlayElement, event) {
            console.log(overlayElement, event);
        },
        /*******************
         * EDIT CATEGORIES *
         *******************/
        addCategory() {
            this.modalTitle = 'New Category';
            this.editCategoryIndex = -1;
            const color = schemeCategory10[this.categories.length + 1 % schemeCategory10.length];
            this.editCategoryLabel = 'New Category';
            console.log(color);
            this.editCategoryColor = color;
            this.editingCategory = true;
        },
        setEditCategory(index) {
            this.modalTitle = 'Edit Category';
            this.editCategoryIndex = index;
            this.editCategoryLabel = this.categories[index].label;
            this.editCategoryColor = this.categories[index].fillColor;
            this.editingCategory = true;
        },
        saveCategoryEdit(label, color) {
            console.log({ label, color });
            if (this.editCategoryIndex < 0) {
                console.log('add new category here');
                this.categories.push({
                    label,
                    fillColor: color,
                    strokeColor: 'rgb(0, 0, 0)'
                });
                this.activeCategoryIndex = this.categories.length - 1;
            } else {
                console.log('edit existing category here');
                this.categories[this.editCategoryIndex].label = label;
                this.categories[this.editCategoryIndex].fillColor = color;
            }
            this.editingCategory = false;
        },
        cancelCategoryEdit() {
            this.editingCategory = false;
        }
    }
};
</script>

<template>
  <div class="h-filmstrip-categories">
    <div class="h-filmstrip-categories-header">
      <h4 style="color: #ffffff">
        Categories
      </h4>
      <button
        class="btn btn-primary"
        @click="addCategory"
      >
        <i class="icon-plus" />
        Add category
      </button>
    </div>
    <div class="table-container">
      <table class="h-filmstrip-categories-table">
        <tr class="header-row">
          <th class="ct-col-number" />
          <th class="ct-color-col">
            Fill Color
          </th>
          <th class="ct-label-col">
            Label
          </th>
          <th class="ct-count-col">
            No. of superpixels labeled
          </th>
          <th class="ct-edit-btn-col" />
        </tr>
        <tr
          v-for="category, index in categories"
          :key="index"
          class="category-row"
          :class="{ 'category-row': true, 'selected-row': activeCategoryIndex === index }"
          @click="activeCategoryIndex = index"
        >
          <td class="ct-col-number">
            {{ index + 1 }}
          </td>
          <td>
            <div class="color-cell-contents">
              <div
                class="color-chip"
                :style="{ 'background-color': category.fillColor }"
              />
            </div>
          </td>
          <td>
            {{ category.label }}
          </td>
          <td>
            {{ 100 }}
          </td>
          <td>
            <button
              class="btn btn-primary edit-category-btn"
              @click="setEditCategory(index)"
            >
              <i class="icon-pencil" />
            </button>
          </td>
        </tr>
      </table>
    </div>
    <edit-category-modal
      :show-modal="editingCategory"
      :initial-label="editCategoryLabel"
      :initial-fill-color="editCategoryColor"
      :title="modalTitle"
      @confirm="saveCategoryEdit"
      @cancel="cancelCategoryEdit"
    />
  </div>
</template>

<style scoped>
.h-filmstrip-manual-labeling {
  height: 100%;
  display: flex;
  flex-direction: row;
}

.h-filmstrip-categories {
  width: 650px;
  margin-left: 10px;
  height: 100%;
}

.table-container {
  height: 80%;
  background-color: #f8f8f8;
  overflow: scroll;
}

.h-filmstrip-categories-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 2px;
}

.h-filmstrip-categories-table {
  background-color: #f8f8f8;
  width: 100%;
}

.header-row {
  background-color: #ffffff;
  color: #757575;
  height: 15px;
}

.selected-row {
  background-color: #ccc;
}

.ct-col-number {
  width: 5%;
  text-align: center;
}

.ct-color-col {
  text-align: center;
  width: 15%;
}

.ct-label-col {
  width: 40%;
}

.ct-count-col {
  width: 35%;
}

.ct-edit-btn {
  width: 5%;
}

.color-cell-contents {
  display: flex;
  justify-content: center;
}

.color-chip {
  height: 15px;
  width: 15px;
}

.edit-category-btn {
  padding: 0px;
  margin: 2px 0;
}
</style>
