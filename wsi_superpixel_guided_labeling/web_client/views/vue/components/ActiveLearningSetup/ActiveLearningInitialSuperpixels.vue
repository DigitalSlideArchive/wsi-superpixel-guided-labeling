<script>
import Vue from 'vue';

export default Vue.extend({
    props: ['backboneParent'],
    data() {
        return {
            radius: 100,
            magnification: 5
        };
    },
    computed: {
        validForm() {
            return this.radius > 0 && this.magnification > 0;
        }
    },
    methods: {
        generateInitialSuperpixels() {
            this.backboneParent.generateInitialSuperpixels(this.radius, this.magnification);
        }
    }
});
</script>

<template>
  <div class="h-al-setup-superpixels">
    <div class="form-group">
      <label for="radius">Superpixel Radius</label>
      <div class="form-group-description">
        Approximate superpixel radius
      </div>
      <input
        id="radius"
        v-model.number="radius"
        class="form-control input-sm h-active-learning-input"
        type="number"
      >
    </div>
    <div class="form-group">
      <label for="magnification">Magnification</label>
      <div class="form-group-description">
        Image magnification for superpixel generation
      </div>
      <input
        id="magnification"
        v-model.number="magnification"
        class="form-control input-sm h-active-learning-input"
        type="number"
      >
    </div>
    <button
      class="btn btn-primary h-generate-superpixel-btn"
      :disabled="!validForm"
      @click="generateInitialSuperpixels"
    >
      Generate Superpixels
    </button>
  </div>
</template>

<style scoped>
.h-active-learning-input {
    width: 30%;
}

.h-generate-superpixel-btn {
    display: block;
}
</style>
