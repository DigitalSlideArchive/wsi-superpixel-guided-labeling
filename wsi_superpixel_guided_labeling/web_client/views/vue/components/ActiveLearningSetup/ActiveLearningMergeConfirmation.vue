<script>
import Vue from 'vue';

import ColorPickerInput from '@girder/histomicsui/vue/components/ColorPickerInput.vue';

export default Vue.extend({
    components: {
        ColorPickerInput
    },
    props: ['callback', 'categoryName', 'fillColor'],
    data() {
        return {
            currentCategoryLabel: 'Merged Categories',
            currentCategoryFillColor: 'rgba(0, 0, 0, 0.5)',
            newFillColor: 'rgba(0, 0, 0, 0.5)'
        };
    },
    watch: {
        categoryName(name) {
            this.currentCategoryLabel = name;
        },
        fillColor(color) {
            this.newFillColor = color;
            this.currentCategoryFillColor = color;
        }
    },
    methods: {
        submit() {
            this.callback(this.currentCategoryLabel, this.currentCategoryFillColor);
        }
    }
});
</script>

<template>
  <div
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
            Merge Categories
          </h4>
        </div>
        <div class="modal-body">
          <p> WARNING: Merging categories cannot be undone. </p>
          <div class="form-group h-form-inputs">
            <label for="usr">New Name:</label>
            <input
              id="category-label"
              v-model="currentCategoryLabel"
              class="form-control category-input"
            >
            <color-picker-input
              :key="fillColor"
              v-model="currentCategoryFillColor"
              class="condensed-color-picker"
              :color="newFillColor"
            />
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
