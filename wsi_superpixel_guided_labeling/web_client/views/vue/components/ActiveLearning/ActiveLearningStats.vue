<script>
import { store } from './store.js';

export default {
    data() {
        return {
            showStatsCard: false
        };
    },
    computed: {
        averageCertainty() {
            return store.currentAverageCertainty;
        }
    },
    methods: {
        iconClicked() {
            this.showStatsCard = !this.showStatsCard;
        }
    }
};
</script>

<template>
  <div>
    <div :class="{ 'h-al-stats-card': true, 'h-al-no-display': !showStatsCard }">
      Avg. Certainty this epoch: {{ averageCertainty }}
    </div>
    <span
      class="icon-help-circled h-al-stats-anchor"
      title="Click to show epoch statistics"
      @click="iconClicked"
    />
  </div>
</template>

<style scoped>
.h-al-stats-anchor {
    position: inherit;
    float: right;
    font-size: 18px;
    color: white;
}

.h-al-stats-card {
    position: absolute;
    border-radius: 1px;
    background: white;
    padding: 2px;
    right: 40px;
    top: -9px;
    z-index: 100;
}

.h-al-no-display {
    display: none;
}

</style>
