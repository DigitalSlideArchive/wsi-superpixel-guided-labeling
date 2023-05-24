<script>
import Vue from 'vue';

import ColorPickerInput from '@girder/histomicsui/vue/components/ColorPickerInput.vue';

export default Vue.extend({
    components: { ColorPickerInput },
    props: ['showModal', 'initialLabel', 'initialFillColor'],
    data() {
        return {
            editCategoryLabel: '',
            editCategoryColor: ''
        };
    },
    mounted() {
        this.editCategoryLabel = this.initialLabel;
        this.editCategoryColor = this.initialFillColor;
    },
    methods: {
        confirm() {
            this.$emit('confirm', this.editCategoryLabel, this.editCategoryColor);
        },
        cancel() {
            this.$emit('cancel');
        }
    }
});
</script>

<template>
  <div
    v-if="showModal"
    class="modal-wrapper"
  >
    <div class="modal-content">
      <div class="modal-header">
        Edit Category
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="category-label">Label</label>
          <input
            id="category-label"
            v-model="editCategoryLabel"
            class="form-control input-sm h-active-learning-input"
          >
        </div>
        <div class="form-group">
          <label for="fill-color">Fill Color</label>
          <color-picker-input
            v-model="editCategoryColor"
            class="h-active-learning-input"
            :color="editCategoryColor"
          />
        </div>
      </div>
      <div class="modal-footer">
        <button
          class="btn btn-primary"
          @click="confirm"
        >
          Ok
        </button>
        <button
          class="btn"
          @click="cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-wrapper {
  position: fixed;
  z-index: 9990;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  transition: opacity 0.1s ease;

  display: flex;
  flex-direction: column;
  justify-content: center;
}

.modal-content {
  display: flex;
  justify-content: space-around;
  flex-direction: column;
  width: 35%;
  height: 35%;
}
</style>
