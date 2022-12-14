<script>
import Vue from 'vue';
import _ from 'underscore';

export default Vue.extend({
    props: ['backboneParent', 'largeImageItem', 'superpixelAnnotation'],
    mounted() {
    },
    data() {
        return {
            categories: '',
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
            console.log('generating initial set of superpixels');
            this.backboneParent.generateInitialSuperpixels(this.radius, this.magnification);
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
            <span>Setting up categories</span>
        </div>
    </div>
</template>

<style scoped>
.h-active-learning-setup-container {
    margin-left: 10px;
}
.h-active-learning-input {
    width: 30%;
}
.h-generate-superpixel-btn {
    display: block;
}
</style>
