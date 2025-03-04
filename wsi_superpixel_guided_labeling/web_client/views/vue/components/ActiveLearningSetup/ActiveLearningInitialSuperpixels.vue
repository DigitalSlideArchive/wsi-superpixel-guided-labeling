<script>
import Vue from 'vue';

export default Vue.extend({
    props: ['backboneParent', 'certaintyMetrics', 'featureShapes'],
    data() {
        return {
            radius: 100,
            magnification: 5,
            certaintyChoice: '',
            featureChoice: ''
        };
    },
    computed: {
        validForm() {
            return this.radius > 0 && this.magnification > 0;
        }
    },
    mounted() {
        this.certaintyChoice = this.certaintyMetrics[0];
        this.featureChoice = this.featureShapes[0];
    },
    methods: {
        generateInitialSuperpixels() {
            this.backboneParent.generateInitialSuperpixels(
                this.radius,
                this.magnification,
                this.certaintyChoice,
                this.featureChoice
            );
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
    <div class="form-group">
      <label for="certainty-metric">Certainty Metric</label>
      <div class="form-group-description">
        Metric to determine the order that predictions are presented to the user
      </div>
      <select
        id="certainty-metric"
        v-model="certaintyChoice"
      >
        <option
          v-for="option in certaintyMetrics"
          :key="option"
          :value="option"
        >
          {{ option }}
        </option>
      </select>
    </div>
    <div class="form-group">
      <label for="feature-shape">Feature Shape</label>
      <div class="form-group-description">
        Feature is superpixel image data or foundation model vector
      </div>
      <select
        id="feature-shape"
        v-model="featureChoice"
      >
        <option
          v-for="option in featureShapes"
          :key="option"
          :value="option"
        >
          {{ option }}
        </option>
      </select>
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

.h-al-setup-superpixels {
    margin-left: 10px;
}
</style>
