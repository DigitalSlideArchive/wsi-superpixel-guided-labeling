<script>
import Vue from 'vue';

import { viewMode } from './constants.js';
import { store } from './store.js';

export default Vue.extend({
    computed: {
        selected: {
            get() {
                return store.mode;
            },
            set(newMode) {
                store.mode = newMode;
            }
        },
        viewMode() {
            return viewMode;
        }
    },
    methods: {}
});
</script>

<template>
  <div class="active-learning-toolbar row">
    <div class="col-sm-9" />
    <div class="btn-group col-sm-3 active-learning-mode-buttons">
      <button
        class="btn btn-default"
        :class="[selected === viewMode.Labeling && 'btn-primary']"
        @click="selected = viewMode.Labeling"
      >
        <i class="icon-pencil" />
      </button>
      <button
        class="btn btn-default"
        :class="[selected === viewMode.Guided && 'btn-primary']"
        @click="selected = viewMode.Guided"
      >
        <i class="icon-video" />
      </button>
      <button
        class="btn btn-default"
        :class="[selected === viewMode.Review && 'btn-primary']"
        :disabled="true"
        @click="selected = viewMode.Review"
      >
        <i class="icon-th" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.active-learning-toolbar {
    height: 50px;
    width: calc(100% - 375px);
    position: absolute;
    left: 200px;
    display: flex;
}

.active-learning-mode-buttons {
    display: flex;
    align-items: center;
    justify-content: flex-end;
}
</style>
