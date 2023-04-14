<script>
import Vue from 'vue';

import ActiveLearningInitialSuperpixels from './ActiveLearningInitialSuperpixels.vue';
import ActiveLearningInitialLabels from './ActiveLearningInitialLabels.vue';

export default Vue.extend({
    components: {
        ActiveLearningInitialSuperpixels,
        ActiveLearningInitialLabels
    },
    props: ['backboneParent', 'imageNamesById', 'annotationsByImageId', 'activeLearningStep']
});
</script>

<template>
  <div class="h-active-learning-container">
    <active-learning-initial-superpixels
      v-if="activeLearningStep === 0"
      :backbone-parent="backboneParent"
    />
    <active-learning-initial-labels
      v-else
      :backbone-parent="backboneParent"
      :image-names-by-id="imageNamesById"
      :annotations-by-image-id="annotationsByImageId"
    />
  </div>
</template>

<style scoped>
.h-active-learning-container {
    margin-left: 10px;
    width: 100%;
    height: 100%;
    position: absolute;
}
</style>
