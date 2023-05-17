<script>
import _ from 'underscore';

import ActiveLearningFilmStripCard from './ActiveLearningFilmStripCard.vue';
import ActiveLearningStats from './ActiveLearningStats.vue';
import { store } from './store.js';

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
        },
        guidedLabelingMode() {
            return store.guidedLabelingMode;
        },
        categories() {
            return [
                {
                    label: 'Background',
                    fillColor: 'rgba(0, 0, 255, 0.5)',
                    strokeColor: 'rgba(0, 0, 0)'
                }
            ];
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
        },
        changeMode() {
            store.guidedLabelingMode = !store.guidedLabelingMode;
        }
    }
};
</script>

<template>
  <div class="h-filmstrip">
    <button
      class="h-filmstrip-change-mode btn btn-primary"
      @click="changeMode"
    >
      Change Mode
    </button>
    <div
      v-if="guidedLabelingMode"
      class="h-filmstrip-guided-labeling"
    >
      <button
        class="h-filmstrip-page-btn h-filmstrip-page-btn--prev btn"
        :disabled="page === 0"
        @click="previousPage"
      >
        <i class="icon-left-circled h-filmstrip-page-icon" />
      </button>
      <active-learning-film-strip-card
        v-for="superpixel, index in superpixelsToDisplay"
        :key="`${superpixel.imageId}_${superpixel.index}`"
        :index="index"
      />
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
    <div
      v-else
      class="h-filmstrip-manual-labeling"
    >
      <div class="h-filmstrip-categories">
        <div class="h-filmstrip-categories-header">
          <h4 style="color: #ffffff">
            Categories
          </h4>
          <button
            class="btn btn-primary"
          >
            <i class="icon-plus" />
            Add category
          </button>
        </div>
        <div class="table-container">
          <table class="h-filmstrip-categories-table">
            <tr class="header-row">
              <th class="ct-col-number" />
              <th class="ct-color-col">
                Fill Color
              </th>
              <th class="ct-label-col">
                Label
              </th>
              <th class="ct-count-col">
                No. of superpixels labeled
              </th>
              <th class="ct-edit-btn-col" />
            </tr>
            <tr
              v-for="category, index in categories"
              :key="index"
              class="category-row"
            >
              <td class="ct-col-number">
                {{ index + 1 }}
              </td>
              <td>
                <div class="color-cell-contents">
                  <div
                    class="color-chip"
                    :style="{ 'background-color': category.fillColor }"
                  />
                </div>
              </td>
              <td>
                {{ category.label }}
              </td>
              <td>
                {{ 100 }}
              </td>
              <td>
                <button class="btn btn-primary edit-category-btn">
                  <i class="icon-pencil" />
                </button>
              </td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.h-filmstrip {
    position: absolute;
    bottom: 0px;
    width: 100%;
    height: 220px;
    padding-top: 10px;
    padding-bottom: 10px;
    background-color: rgba(0, 0, 0, 0.6);
    z-index: 50;
}

.h-filmstrip-change-mode {
  position: absolute;
  bottom: 225px;
  z-index: 50px;
  left: 5px;
}

.h-filmstrip-guided-labeling {
  display: flex;
  flex-direction: row;
  justify-content: space-evenly;
  align-items: center;
}

.h-filmstrip-manual-labeling {
  height: 100%;
}

.h-filmstrip-categories {
  width: 650px;
  margin-left: 10px;
  height: 100%;
}

.table-container {
  height: 80%;
  background-color: #f8f8f8;
}

.h-filmstrip-categories-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 2px;
}

.h-filmstrip-categories-table {
  background-color: #f8f8f8;
  width: 100%;
}

.header-row {
  background-color: #ffffff;
  color: #757575;
  height: 15px;
}

.spacer-row {
  height: 100%;
  background-color: #f8f8f8;
}

.ct-col-number {
  width: 5%;
  text-align: center;
}

.ct-color-col {
  text-align: center;
  width: 15%;
}

.ct-label-col {
  width: 40%;
}

.ct-count-col {
  width: 35%;
}

.ct-edit-btn {
  width: 5%;
}

.color-cell-contents {
  display: flex;
  justify-content: center;
}

.color-chip {
  height: 15px;
  width: 15px;
}

.edit-category-btn {
  padding: 0px;
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
