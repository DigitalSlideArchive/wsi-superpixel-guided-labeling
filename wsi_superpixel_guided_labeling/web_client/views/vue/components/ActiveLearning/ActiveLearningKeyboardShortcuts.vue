<script>
import Vue from 'vue';

import _ from 'underscore';

import { comboHotkeys } from './constants';
import { store, previousCard, nextCard, assignHotkey } from '../store.js';

import MouseAndKeyboardControls from '../MouseAndKeyboardControls.vue';

export default Vue.extend({
    components: {
        MouseAndKeyboardControls
    },
    data() {
        return {
            showShortcuts: true,
            currentlyEditing: -1,
            currentInput: []
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
        },
        hotkeys() {
            return store.hotkeys;
        },
        editingText() {
            return this.currentInput.join(',');
        }
    },
    watch: {
        currentlyEditing(newIndex, oldIndex) {
            if (newIndex !== oldIndex && oldIndex !== -1) {
                // We were previously editing a different key, save what we were working on
                this.commitHotkeyChange();
                this.currentInput = [];
            }
        }
    },
    mounted() {
        store.lastCategorySelected = null;
        window.addEventListener('keydown', this.keydownListener);
    },
    destroyed() {
        window.removeEventListener('keydown', this.keydownListener);
        store.lastCategorySelected = null;
    },
    methods: {
        parseUserHotkeys(event) {
            // Combine the list of selected keys
            const pressed = _.filter(comboHotkeys, (key) => event[`${key}Key`]);
            if (!(event.key in pressed)) pressed.push(event.key);
            return pressed;
        },
        categoryKeydownListener(event) {
            // Using hotkeys to select categories
            // In order to accommodate more than 9 categories map default and
            // user-defined hotkeys to each category index
            const userHotkeys = this.parseUserHotkeys(event);
            const idx = this.hotkeys.get(userHotkeys.join('+'));
            if (!_.isUndefined(idx)) {
                store.lastCategorySelected = idx;
                return;
            }
            switch (event.key) {
                case 'ArrowRight':
                    nextCard();
                    break;
                case 'ArrowLeft':
                    previousCard();
                    break;
            }
        },
        editKeydownListener(event) {
            // Using keyboard to set hotkeys
            const newKey = this.currentInput.join('+');
            const assignedHotkeys = _.filter(this.hotkeys, (_key, idx) => {
                return idx < this.categories.length;
            });
            if (newKey in assignedHotkeys) {
                event.preventDefault();
            }
            this.currentInput = this.parseUserHotkeys(event);
            this.commitHotkeyChange();
        },
        keydownListener(event) {
            if (this.currentlyEditing !== -1) {
                this.editKeydownListener(event);
            } else {
                this.categoryKeydownListener(event);
            }
        },
        hotkeyFromIndex(index) {
            return _.find([...this.hotkeys], ([, v]) => v === index)[0];
        },
        commitHotkeyChange() {
            // Hotkeys should either be a single alpha-numeric value or be
            // preceded by one or more modifiers (ctrl, shift, alt)
            const okayModifiers = _.every(_.initial(this.currentInput), (mod) => {
                return comboHotkeys.includes(mod);
            });
            const okayKey = /^[a-zA-Z0-9]$/.test(_.last(this.currentInput));
            const validHotkey = okayModifiers && okayKey;
            if (!_.isEmpty(this.currentInput) && validHotkey && this.currentlyEditing > -1) {
                // Accept user input as finalized hotkey selection
                const newKey = this.currentInput.join('+');
                const hotKey = this.hotkeyFromIndex(this.currentlyEditing);
                assignHotkey(hotKey, newKey);
                store.backboneParent.updateHistomicsYamlConfig();
                this.currentlyEditing = -1;
            }
        },
        rowSelected(event, index) {
            this.currentlyEditing = index;
            this.$nextTick(() => {
                // Force focus on the input element
                const el = event.target.getElementsByTagName('input')[0];
                if (el) el.focus();
            });
        }
    }
});
</script>

<template>
  <div class="h-hotkeys-container">
    <mouse-and-keyboard-controls
      :active-learning-setup="false"
      :pixelmap-paint-brush="false"
    />
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
      <p class="h-hotkeys-edit-subtitle">
        Click a hotkey to edit.
      </p>
      <div>
        <span
          class="h-hotkey"
          @click="(e) => rowSelected(e, 0)"
        >
          <span v-if="currentlyEditing === 0">
            <input
              class="h-hotkey-edit-input"
              :value="editingText"
              readonly
              @blur="currentlyEditing = -1"
            >
            <span> - Reset Selection</span>
          </span>
          <span v-else>
            {{ hotkeyFromIndex(0) }} - Reset selection
          </span>
        </span>
        <span
          v-for="(category, index) in nonDefaultCategories"
          :key="category.label"
          class="h-hotkey"
          @click="(e) => rowSelected(e, index + 1)"
        >
          <span v-if="currentlyEditing === (index + 1)">
            <input
              class="h-hotkey-edit-input"
              :value="editingText"
              readonly
              @blur="currentlyEditing = -1"
            >
            <span> - {{ category.label }}</span>
          </span>
          <span v-else>
            {{ hotkeyFromIndex(index + 1) }} - {{ category.label }}
          </span>
        </span>
      </div>
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
    min-width: 250px;
    max-width: 250px;
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

.h-bindings {
    font-size: 12px;
}

.h-hotkey-edit-input {
    width: 40%;
    font-size: smaller;
    text-align: center;
}

.h-hotkeys-edit-subtitle {
    font-size: x-small;
    font-style: italic;
}
</style>
