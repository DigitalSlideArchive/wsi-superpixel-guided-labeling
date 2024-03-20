<script>
import Vue from 'vue';

import { store } from './store';
import { viewMode } from './constants';

export default Vue.extend({
    props: ['pixelmapPaintBrush'],
    data() {
        return {
            showInfoContainer: true
        };
    },
    computed: {
        labeling() {
            return store.mode === viewMode.Labeling;
        }
    },
    watch: {
        labeling() {
            this.showInfoContainer = this.labeling;
        }
    },
    mounted() {
        // Default to hidden when we are not in the setup step
        this.showInfoContainer = this.labeling;
    }
});
</script>

<template>
  <div :class="{'h-setup-categories-information': true, 'h-collapsed': !showInfoContainer}">
    <div>
      <h6 v-if="labeling">
        Annotations
      </h6>
      <ul
        v-if="labeling"
        class="h-controls"
      >
        <li>Left-click: Label/unlabel single superpixel</li>
        <li v-if="pixelmapPaintBrush">
          Left-drag: Continuously label/unlabel superpixels
        </li>
        <li v-else>
          Shift-left-drag: Continuously label/unlabel superpixels
        </li>
      </ul>
      <h6>Pan</h6>
      <ul class="h-controls">
        <li v-if="pixelmapPaintBrush">
          Shift-left-drag
        </li>
        <li v-else>
          Left-drag
        </li>
        <li v-if="!pixelmapPaintBrush">
          Middle-drag: This works even when editing annotations.
        </li>
        <li v-if="!pixelmapPaintBrush">
          Single touch drag
        </li>
        <li v-if="labeling">
          Arrow keys / Shift-arrow keys
        </li>
      </ul>
      <h6>Zoom</h6>
      <ul class="h-controls">
        <li>Right-drag</li>
        <li>Mouse wheel</li>
        <li>Multi-touch spread or contract</li>
        <li v-if="labeling">
          Plus, minus / Shift-plus, shift-minus
        </li>
      </ul>
      <h6>Rotate</h6>
      <ul class="h-controls">
        <li>Left-ctrl-drag</li>
        <li>Ctrl-mouse wheel</li>
        <li>Multi-touch rotate</li>
        <li v-if="labeling">
          &lt;, &gt; (also . or ,) rotate the image a small amount. If shift is held down, &lt; and &gt; rotate the image 90 degrees.
        </li>
      </ul>
    </div>
    <i class="icon-info-circled" />
    <button
      class="h-collapse-button"
      @click="showInfoContainer = !showInfoContainer"
    >
      <i
        v-if="showInfoContainer"
        class="icon-angle-double-right"
        data-toggle="tooltip"
        title="Hide info panel"
      />
      <i
        v-else
        class="icon-angle-double-left"
        data-toggle="tooltip"
        title="Show info panel"
      />
    </button>
  </div>
</template>

<style scoped>
.h-setup-categories-information {
    z-index: 1000;
    position: absolute;
    top: 45px;
    right: 20px;
    width: 350px;
    display: flex;
    background-color: #fff;
    border-radius: 5px;
    box-shadow: 5px 5px 5px rgba(0, 0, 0, 0.5);
    padding: 5px;
}

.h-collapsed {
    max-width: fit-content;
    height: auto;
}

.h-collapse-button {
    border: none;
    background-color: transparent;
    width: fit-content;
    height: fit-content;
}

.h-controls-container {
  margin-right: 15px;
}

.h-controls-header {
    display: flex;
    justify-content: space-between;
}

.h-controls-toggle {
    background-color: transparent;
    border: none;
}

.h-controls {
    font-size: 12px;
}

h6 {
  margin-bottom: 0px;
}
</style>
