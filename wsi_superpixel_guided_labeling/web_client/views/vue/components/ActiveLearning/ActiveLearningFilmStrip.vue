<script>
import _ from 'underscore';

import ActiveLearningFilmStripCard from './ActiveLearningFilmStripCard.vue';
import ActiveLearningStats from './ActiveLearningStats.vue';
import { store } from '../store.js';

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
        selectedIndex() {
            return store.selectedIndex;
        },
        superpixelsToDisplay() {
            return store.superpixelsToDisplay;
        },
        page() {
            return store.page;
        },
        slideName() {
            if (this.superpixelsToDisplay.length) {
                const id = this.superpixelsToDisplay[this.selectedIndex].imageId;
                return store.backboneParent.imageItemsById[id].name;
            }
            return '';
        }
    },
    watch: {
        selectedIndex: {
            handler(idx) {
                if (this.superpixelsToDisplay.length) {
                    store.currentImageId = this.superpixelsToDisplay[idx].imageId;
                }
            },
            immediate: true
        }
    },
    methods: {
        previousPage() {
            store.page = store.page - 1;
        },
        nextPage() {
            store.page = store.page + 1;
        },
        agreeAll() {
            _.forEach(this.superpixelsToDisplay, (superpixel) => {
                superpixel.selectedCategory = superpixel.prediction;
            });
        },
        resetAll() {
            _.forEach(this.superpixelsToDisplay, (superpixel) => {
                superpixel.selectedCategory = 0;
            });
        }
    }
};
</script>

<template>
  <div class="h-filmstrip">
    <!-- previous button -->
    <button
      class="h-filmstrip-page-btn h-filmstrip-page-btn--prev btn"
      :disabled="page === 0"
      @click="previousPage"
    >
      <i class="icon-left-circled h-filmstrip-page-icon" />
    </button>
    <div
      id="filmstrip-cards"
      class="h-filmstrip-cards"
    >
      <active-learning-film-strip-card
        v-for="superpixel, index in superpixelsToDisplay"
        :key="`${superpixel.imageId}_${superpixel.index}`"
        :index="index"
      />
    </div>
    <button
      class="h-filmstrip-page-btn h-filmstrip-page-btn--next btn"
      :disabled="page === maxPage"
      @click="nextPage"
    >
      <i class="icon-right-circled h-filmstrip-page-icon" />
    </button>
    <div class="h-filmstrip-workflow-btns">
      <active-learning-stats />
      <button
        class="h-filmstrip-workflow-btn btn btn-primary btn-block"
        @click="resetAll"
      >
        Reset All
      </button>
      <button
        class="h-filmstrip-workflow-btn btn btn-primary btn-block"
        @click="agreeAll"
      >
        Agree to All
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
    padding-top: 35px;
    padding-bottom: 10px;
    background-color: rgba(0, 0, 0, 0.6);
    z-index: 50;
}

.h-filmstrip-cards {
    display: flex;
    width: 85%;
    justify-content: space-evenly;
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
}

.h-filmstrip-workflow-btn {
    display: flex;
}
</style>
