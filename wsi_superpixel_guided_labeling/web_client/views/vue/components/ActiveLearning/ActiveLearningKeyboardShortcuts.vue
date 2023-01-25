<script>
import Vue from 'vue';
import store from './store.js';
import _ from 'underscore';

export default Vue.extend({
    data() {
        return {
            showShortcuts: true
        };
    },
    computed: {
        categories() {
            return store.categories;
        },
        nonDefaultCategories() {
            // Expect 'default' to be at index 0 ALWAYS
            return _.filter(store.categories, (category) => {
                return category.label !== 'default';
            });
        }
    },
    methods: {
        selectPreviousCard() {
            if (store.selectedIndex === 0) {
                if (store.page !== 0) {
                    store.selectedIndex = 7;
                }
                store.page = Math.max(0, store.page - 1);
            } else {
                store.selectedIndex--;
            }
        },
        selectNextCard() {
            if (store.selectedIndex === 7) {
                // TODO prevent going past the max
                store.page += 1;
                store.selectedIndex = 0;
            } else {
                store.selectedIndex++;
            }
        },
        keydownListener(event) {
            switch(event.key) {
                case 'ArrowRight':
                    this.selectNextCard();
                    break;
                case 'ArrowLeft':
                    this.selectPreviousCard();
                    break;
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                case '0':
                    store.lastKeyPressed = event.key;
                default:
                    break;
            }
        }
    },
    mounted() {
        window.addEventListener('keydown', this.keydownListener);
    }
});
</script>

<template>
    <div class="h-hotkeys-container">
        <div class="h-hotkeys-header">
        <h5>Hotkeys</h5>
        <button
            class="h-hotkeys-toggle"
            @click="showShortcuts = !showShortcuts"
        >
            <i
                v-if="showShortcuts"
                class="icon-up-open"
            />
            <i
                v-else
                class="icon-down-open"
            />
        </button>
        </div>
        <div v-if="showShortcuts">
            <h6>Navigation</h6>
            <span class="h-hotkey">
                Right Arrow - Next Superpixel
            </span>
            <span class="h-hotkey">
                Left Arrow - Previous Superpixel
            </span>
            <h6>Labeling</h6>
            <span class="h-hotkey">0 - Reset selection</span>
            <span
                class="h-hotkey"
                v-for="(category, index) in nonDefaultCategories"
                :key="category.label"
            >
                {{ index + 1}} - {{ category.label }}
            </span>
        </div>
    </div>
</template>

<style scoped>
.h-hotkeys-container {
    z-index: 1000;
    position: absolute;
    top: 5px;
    left: 5px;
    padding: 5px;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    background-color: white;
    border-radius: 1px;
    box-shadow: 5px 5px 5px rgba(0, 0, 0, 0.5);
}

.h-hotkeys-header {
    display: flex;
    justify-content: space-between;
}

.h-hotkeys-toggle {
    background-color: transparent;
    border: none;
}

.h-hotkey {
    font-size: 12px;
    display: flex;
}
</style>
