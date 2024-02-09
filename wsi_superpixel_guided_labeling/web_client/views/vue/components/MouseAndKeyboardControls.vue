<script>
import Vue from 'vue';

export default Vue.extend({
    props: ['activeLearningSetup'],
    data() {
        return {
            showControls: true
        };
    },
    mounted() {
        // Default to hidden when we are not in the setup step
        this.showControls = this.activeLearningSetup;
    }
});
</script>

<template>
  <div :class="{'h-controls-container': activeLearningSetup}">
    <div
      v-if="!activeLearningSetup"
      class="h-controls-header"
    >
      <h5>Mouse and Keyboard Controls</h5>
      <button
        class="h-controls-toggle"
        @click="showControls = !showControls"
      >
        <i
          v-if="showControls"
          class="icon-up-open"
        />
        <i
          v-else
          class="icon-down-open"
        />
      </button>
    </div>
    <div v-if="showControls">
      <h6 v-if="activeLearningSetup">
        Annotations
      </h6>
      <ul
        v-if="activeLearningSetup"
        class="h-controls"
      >
        <li>Left-click: Label single superpixel</li>
        <li>Shift-left-drag: Continuously label superpixels</li>
      </ul>
      <h6>Pan</h6>
      <ul class="h-controls">
        <li>Left-drag</li>
        <li>Middle-drag: This works even when editing annotations.</li>
        <li>Single touch drag</li>
        <li v-if="activeLearningSetup">
          Arrow keys / Shift-arrow keys / Shift-ctrl-arrow keys
        </li>
      </ul>
      <h6>Zoom</h6>
      <ul class="h-controls">
        <li>Right-drag</li>
        <li>Mouse wheel</li>
        <li>Multi-touch spread or contract</li>
        <li v-if="activeLearningSetup">
          Plus, minus / Shift-plus, shift-minus / Shift-ctrl-plus, shift-ctrl-minus
        </li>
        <li v-if="activeLearningSetup">
          1 - 7: The number keys 1 - 7 will zoom to discrete zoom levels.
        </li>
        <li>Shift-left-drag, shift-right-drag: Zoom into or out of the selected rectangle</li>
      </ul>
      <h6>Rotate</h6>
      <ul class="h-controls">
        <li>Left-ctrl-drag</li>
        <li>Ctrl-mouse wheel</li>
        <li>Multi-touch rotate</li>
        <li v-if="activeLearningSetup">
          &lt;, &gt; (also . or ,) rotate the image a small amount. If shift is held down, &lt; and &gt; rotate the image 90 degrees.
        </li>
        <li v-if="activeLearningSetup">
          0: 0 returns the image to the default orientation.
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
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
