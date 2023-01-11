<script>
import Vue from 'vue';

export default Vue.extend({
    data() {
        return {
            categories: [
                { label: 'Background' },
                { label: 'Marker' },
                { label: 'Tissue' }
            ]
        };
    }
});
</script>

<template>
    <div class="h-hotkeys-container">
        <h4>
            Hotkeys
        </h4>
        <span
            v-for="(category, index) in categories"
            :key="category.label"
        >
             {{ index + 1}} - {{ category.label }}
        </span>
    </div>
</template>

<style scoped>
.h-hotkeys-container {
    z-index: 1000;
    position: absolute;
    top: 5px;
    left: 5px;
    padding: 5px;
    display: flex;
    flex-direction: column;
    background-color: white;
    border-radius: 1px;
    box-shadow: 5px 5px 5px rgba(0, 0, 0, 0.5);
}
</style>
