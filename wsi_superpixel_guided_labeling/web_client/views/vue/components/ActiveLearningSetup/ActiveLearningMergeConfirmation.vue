<script>
import Vue from 'vue';
const _ = girder._;

const ColorPickerInput = girder.plugins.histomicsui.vue.ColorPickerInput;

import { store } from '../store.js';

export default Vue.extend({
    components: {
        ColorPickerInput
    },
    data() {
        return {
            currentCategoryFillColor: 'rgba(0, 0, 0, 0.5)',
            categoryName: 'Merged Labels'
        };
    },
    computed: {
        warningMessage() {
            const numCategories = store.selectedLabels.size;
            const labelCounts = _.reduce([...store.selectedLabels.values()], (acc, selected) => {
                return acc + selected.count;
            }, 0);
            const message = `This will combine ${numCategories} labels into
                          one label containing all ${labelCounts} labeled
                          superpixels.`;
            return message;
        },
        selectedLabels() {
            return store.selectedLabels;
        },
        fillColor() {
            if (store.selectedLabels.size < 1) {
                return 'rgba(0, 0, 0, 0.5)';
            }
            return _.last([...store.selectedLabels.values()]).fillColor;
        }
    },
    watch: {
        fillColor(color) {
            this.currentCategoryFillColor = color;
        },
        selectedLabels() {
            if (store.selectedLabels.size >= 1) {
                this.categoryName = _.last([...store.selectedLabels.values()]).label;
            }
        }
    },
    methods: {
        submit() {
            this.$emit('merge', this.categoryName, this.currentCategoryFillColor);
        },
        togglePicker(event) {
            const picker = this.$refs.colorpicker;
            const colorPicker = picker.$refs.colorPicker;
            if (event.target.className === 'current-color' && colorPicker) {
                // Default to th RGBA input
                colorPicker.fieldsIndex++;
            }
        }
    }
});
</script>

<template>
  <div
    id="mergeConfirmation"
    class="modal fade"
    role="dialog"
  >
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <button
            type="button"
            class="close"
            data-dismiss="modal"
          >
            &times;
          </button>
          <h4 class="modal-title">
            Merge Labels
          </h4>
        </div>
        <div class="modal-body">
          <p> WARNING: Merging labels cannot be undone. {{ warningMessage }} </p>
          <div class="form-group h-form-inputs">
            <label for="usr">New Name:</label>
            <input
              id="category-label"
              v-model="categoryName"
              class="form-control category-input"
            >
            <div @click="(e) => togglePicker(e)">
              <color-picker-input
                ref="colorpicker"
                :key="fillColor"
                v-model="currentCategoryFillColor"
                :color="fillColor"
              />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-default"
            data-dismiss="modal"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-danger"
            data-dismiss="modal"
            @click="submit"
          >
            Merge
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.h-form-inputs {
    display: flex;
    align-items: flex-end;
    justify-content: space-evenly;
}

.category-input {
    width: 35%;
}
</style>
