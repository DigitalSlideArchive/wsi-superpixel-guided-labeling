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
        editMode: {
            get() {
                return store.editingHotkeys;
            },
            set(mode) {
                store.editingHotkeys = mode;
            }
        }
    },
    watch: {
        editMode(editing) {
            if (!editing) this.resetEditingValues();
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
            if (newKey in assignedHotkeys ||
                  (event.key === 'Enter' && this.currentlyEditing !== -1)) {
                event.preventDefault();
            }
            if (event.key === 'Enter') {
                // The user has finalized their hotkey selection
                const hotKey = this.hotkeyFromIndex(this.currentlyEditing);
                assignHotkey(hotKey, newKey);
                this.resetEditingValues();
                store.backboneParent.updateHistomicsYamlConfig();
                return;
            }
            this.currentInput = this.parseUserHotkeys(event);
        },
        keydownListener(event) {
            if (this.editMode) {
                this.editKeydownListener(event);
            } else {
                this.categoryKeydownListener(event);
            }
        },
        resetEditingValues() {
            this.currentlyEditing = -1;
            this.currentInput = [];
        },
        hotkeyFromIndex(index) {
            return _.find([...this.hotkeys], ([, v]) => v === index)[0];
        },
        editHotkey(index) {
            if (this.currentlyEditing >= 0) {
                // We're editing a new key, reset what we were working on
                this.resetEditingValues();
            }
            this.currentlyEditing = index;
        },
        editModeText(index) {
            if (this.currentlyEditing === index) {
                return this.currentInput.join('+') || 'Editing';
            }
            return this.hotkeyFromIndex(index);
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
      <div class="h-hotkeys-header">
        <h6>Labeling</h6>
        <button
          class="h-hotkeys-toggle"
          @click="editMode = !editMode"
        >
          <i
            v-if="editMode"
            class="icon-ok"
          />
          <i
            v-else
            class="icon-pencil"
          />
        </button>
      </div>
      <p
        v-if="editMode"
        class="h-hotkeys-edit-subtitle"
      >
        Click on a hotkey to edit. Press enter to accept change.
      </p>
      <div v-if="editMode">
        <span class="h-hotkey">
          <button
            class="h-hotkey-edit-button"
            :style="[currentlyEditing === 0 && {'font-style': 'italic'}]"
            @click="() => editHotkey(0)"
          >
            {{ editModeText(0) }}
          </button>
          <span> - Reset Selection</span>
        </span>
        <span
          v-for="(category, index) in nonDefaultCategories"
          :key="category.label"
          class="h-hotkey"
        >
          <button
            class="h-hotkey-edit-button"
            :style="[currentlyEditing === (index + 1) && {'font-style': 'italic'}]"
            @click="() => editHotkey(index + 1)"
          >
            {{ editModeText(index + 1) }}
          </button>
          <span> - {{ category.label }}</span>
        </span>
      </div>
      <div v-else>
        <span class="h-hotkey">{{ hotkeyFromIndex(0) }} - Reset selection</span>
        <span
          v-for="(category, index) in nonDefaultCategories"
          :key="category.label"
          class="h-hotkey"
        >
          {{ hotkeyFromIndex(index + 1) }} - {{ category.label }}
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

.h-hotkey-edit-button {
    width: 40%;
    font-size: smaller;
    border: ridge;
    background-color: transparent;
}

.h-hotkeys-edit-subtitle {
    font-size: x-small;
    font-style: italic;
}
</style>
