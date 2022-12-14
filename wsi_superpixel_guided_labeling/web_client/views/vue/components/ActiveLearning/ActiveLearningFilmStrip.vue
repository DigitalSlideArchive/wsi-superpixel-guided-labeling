<script>
import _ from 'underscore';

import ActiveLearningFilmStripCard from './ActiveLearningFilmStripCard.vue';
import ActiveLearningStats from './ActiveLearningStats.vue';
import store from './store.js';

export default {
    components: {
        ActiveLearningFilmStripCard,
        ActiveLearningStats
    },
    data() {
        return {
            maxPage: 500
        };
    },
    computed: {
        apiRoot() {
            return store.apiRoot;
        },
        selectedIndex() {
            return store.selectedIndex;
        },
        superpixelsToDisplay() {
            return store.superpixelsToDisplay;
        },
        page() {
            return store.page;
        },
        backboneParent() {
            return store.backboneParent;
        }
    },
    methods: {
        previousPage() {
            store.page = store.page - 1;
        },
        nextPage() {
            store.page = store.page + 1;
        },
        togglePredictions() {
            store.predictions = !store.predictions;
        },
        agreeAll() {
            _.forEach(this.superpixelsToDisplay, (superpixel) => {
                superpixel.agreeChoice = 'Yes';
            });
        },
        resetAll() {
            _.forEach(this.superpixelsToDisplay, (superpixel) => {
                superpixel.agreeChoice = undefined;
            });
        },
        triggerRetrain() {
            this.backboneParent.retrain();
        }
    },
    mounted() {
    }
}
</script>

<template>
    <div class="h-filmstrip">
        <!-- previous button -->
        <button
            class="h-filmstrip-page-btn h-filmstrip-page-btn--prev btn"
            @click="previousPage"
            :disabled="page === 0"
        >
            <i class="icon-left-circled h-filmstrip-page-icon"></i>
        </button>
        <active-learning-film-strip-card
            v-for="superpixel, index in superpixelsToDisplay"
            :key="`${superpixel.imageId}_${superpixel.index}`"
            :superpixel="superpixel"
            :index="index"
        />
        <button
            class="h-filmstrip-page-btn h-filmstrip-page-btn--next btn"
            @click="nextPage"
            :disabled="page === maxPage"
        >
            <i class="icon-right-circled h-filmstrip-page-icon"></i>
        </button>
        <div class="h-filmstrip-workflow-btns">
            <active-learning-stats />
            <button
                class="h-filmstrip-workflow-btn btn btn-primary"
                title="Show or hide the most recent predictions"
                @click="togglePredictions"
            >
                Show/hide predictions
            </button>
            <button
                class="h-filmstrip-workflow-btn btn btn-primary"
                @click="resetAll"
            >
                Reset All
            </button>
            <button
                class="h-filmstrip-workflow-btn btn btn-primary"
                @click="agreeAll"
            >
                Agree to All
            </button>
            <button
                class="h-filmstrip-workflow-btn btn btn-success"
                @click="triggerRetrain"
            >
                Retrain
            </button>
        </div>
    </div>
</template>

<style scoped>
.h-filmstrip {
    position: absolute;
    display: flex;
    flex-direction: row;
    justify-content: space-evenly;
    align-items: center;
    bottom: 0px;
    width: 100%;
    padding-top: 10px;
    padding-bottom: 10px;
    background-color: rgba(0, 0, 0, 0.6);
    z-index: 50;
}

.h-filmstrip-page-btn {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 40px;
    width: 40px;
    z-index: 80;
    background: transparent;
}

.h-filmstrip-page-icon {
    font-size: 40px;
    color: white;
}

.h-filmstrip-workflow-btns {
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    height: 150px;
}

.h-filmstrip-workflow-btn {
    display: flex;
}

.h-superpixel-card {
    display: flex;
    flex-direction: column;
    column-gap: 0px;
    background-color: white;
}

.h-superpixel-container {
    position: relative;
    height: 125px;
    width: 125px;
}

.h-wsi-region {
    position: absolute;
    left: 0px;
    top: 0px;
    z-index: 10;
}

.h-superpixel-region {
    position: absolute;
    left: 0px;
    top: 0px;
    z-index: 20;
}
</style>
