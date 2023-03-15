<script>
import Vue from 'vue';
import _ from 'underscore';
import ActiveLearningInitialSuperpixels from './ActiveLearningInitialSuperpixels.vue';
import ActiveLearningInitialLabels from './ActiveLearningInitialLabels.vue'

export default Vue.extend({
    props: ['backboneParent', 'imageNamesById', 'annotationsByImageId', 'activeLearningStep'],
    components: {
        ActiveLearningInitialSuperpixels,
        ActiveLearningInitialLabels
    }
});
</script>

<template>
    <div class="h-active-learning-container">
        <active-learning-initial-superpixels
            v-if="activeLearningStep === 0"
            :backboneParent="backboneParent"
        />
        <active-learning-initial-labels
            v-else
            :backboneParent="backboneParent"
            :imageNamesById="imageNamesById"
            :annotationsByImageId="annotationsByImageId"
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
