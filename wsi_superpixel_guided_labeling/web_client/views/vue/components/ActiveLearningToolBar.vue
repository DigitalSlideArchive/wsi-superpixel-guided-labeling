<script>
import Vue from 'vue';

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
        :class="[selected === 0 && 'btn-primary']"
        @click="selected = 0"
      >
        <i class="icon-pencil" />
      </button>
      <button
        class="btn btn-default"
        :class="[selected === 1 && 'btn-primary']"
        @click="selected = 1"
      >
        <i class="icon-video" />
      </button>
      <button
        class="btn btn-default"
        :class="[selected === 2 && 'btn-primary']"
        :disabled="true"
        @click="selected = 2"
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
