<script>
import { store } from '../store.js';

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
  <div class="h-stats-icon-tooltip">
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
.h-stats-icon-tooltip {
    position: absolute;
    bottom: 200px;
    right: 35px;
}

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
    right: 0px;
    z-index: 100;
}

.h-al-no-display {
    display: none;
}

</style>
