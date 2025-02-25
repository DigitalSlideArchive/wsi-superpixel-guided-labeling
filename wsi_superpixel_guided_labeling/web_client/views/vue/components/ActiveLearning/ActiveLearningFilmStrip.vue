<script>
import _ from 'underscore';

import ActiveLearningFilmStripCard from './ActiveLearningFilmStripCard.vue';
import ActiveLearningStats from './ActiveLearningStats.vue';
import { store, updateSelectedPage } from '../store.js';
import { viewMode } from '../constants';

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
            if (store.superpixelsToDisplay.length) {
                const id = store.superpixelsToDisplay[this.selectedIndex].imageId;
                return store.backboneParent.imageItemsById[id].name;
            }
            return '';
        }
    },
    watch: {
        selectedIndex: {
            handler() {
                this.updateSelectedCard();
            },
            immediate: true
        },
        page() {
            this.updateSelectedCard();
        }
    },
    activated() {
        window.addEventListener('resize', () => { this.$nextTick(() => this.updatePageSize()); });
        this.$nextTick(() => this.updatePageSize());
    },
    deactivated() {
        window.removeEventListener('resize', () => { this.$nextTick(() => this.updatePageSize()); });
    },
    methods: {
        previousPage() {
            store.page = store.page - 1;
            updateSelectedPage();
            store.selectedIndex = store.pageSize - 1;
        },
        nextPage() {
            store.page = store.page + 1;
            updateSelectedPage();
            store.selectedIndex = 0;
        },
        updateAll(usePrediction) {
            _.forEach(store.superpixelsToDisplay, (superpixel) => {
                // Account for missing "default" category in predictions
                const value = usePrediction ? superpixel.prediction + 1 : 0;
                superpixel.selectedCategory = value;
            });
        },
        agreeAll() {
            this.updateAll(true);
        },
        resetAll() {
            this.updateAll(false);
        },
        updatePageSize() {
            if (store.mode !== viewMode.Guided) {
                return;
            }
            // get element sizes to compute how many cards to show
            const container = document.getElementById('filmstrip-cards-container');
            const { width } = container.getBoundingClientRect();
            // update page size
            const currentIndex = store.page * store.pageSize + store.selectedIndex;
            const cardWidth = 140; // Hard-coded in ActiveLearningFilmstripCard
            const padding = 10;
            store.pageSize = Math.floor(width / (cardWidth + padding));
            // update page
            store.page = Math.floor(currentIndex / store.pageSize);
            store.maxPage = Math.ceil((store.sortedSuperpixelIndices.length) / store.pageSize) - 1;
            this.maxPage = store.maxPage;
            // update selected index
            store.selectedIndex = currentIndex - (store.pageSize * store.page);
            updateSelectedPage();
        },
        updateSelectedCard() {
            if (!store.superpixelsToDisplay.length) {
                return;
            }
            const newImageId = store.superpixelsToDisplay[store.selectedIndex].imageId;
            if (store.superpixelsToDisplay.length && newImageId !== store.currentImageId) {
                store.currentImageId = store.superpixelsToDisplay[store.selectedIndex].imageId;
            }
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
      id="filmstrip-cards-container"
      class="h-filmstrip-cards"
    >
      <active-learning-film-strip-card
        v-for="superpixel, index in superpixelsToDisplay"
        ref="filmstripCards"
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
    z-index: 100;
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
