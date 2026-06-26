<script setup lang="ts" generic="TItem extends { id: number; name: string }">
// The compact corner control for a prompt-scoped collection: a picker that shows
// the selected item, a kebab (Rename / Delete), a popover to switch or create,
// and a Save button when there are unsaved edits. All collection behaviour lives
// in the passed-in store; this component is the shared UI. Callers fill the
// per-item secondary line via the #row-note slot.
import { computed, ref } from 'vue';
import type { CollectionStore } from '../store/collection';

interface EntityLabels {
  newItem: string;
  namePrompt: string;
  renamePrompt: string;
  emptyMenu: string;
  actionsLabel: string;
  pickerLabel: string;
  confirmDelete: (name: string) => string;
  deleteError: string;
}

const props = defineProps<{ store: CollectionStore<TItem>; labels: EntityLabels }>();
const {
  items, selected, selectedId, isDirty, loading, saving, error,
  select, saveNew, saveSelected, renameSelected, removeSelected,
} = props.store;

const selectorOpen = ref(false);
const menuOpen = ref(false);
const compactLabel = computed(() => selected.value?.name ?? 'Scratch (not saved)');

function chooseId(id: number) {
  if (select(id)) {
    selectorOpen.value = false;
    menuOpen.value = false;
  }
}

async function saveAsNew() {
  const name = prompt(props.labels.namePrompt);
  if (!name?.trim()) return;
  try { await saveNew(name); } catch { /* the shared error is rendered below */ }
}

async function rename() {
  const current = selected.value;
  if (!current) return;
  const name = prompt(props.labels.renamePrompt, current.name);
  if (!name?.trim()) return;
  try { await renameSelected(name); } catch { /* the shared error is rendered below */ }
}

async function menuSaveAsNew() { selectorOpen.value = false; await saveAsNew(); }
async function menuRename() { menuOpen.value = false; await rename(); }

async function save() {
  try { await saveSelected(); } catch { /* the shared error is rendered below */ }
}

async function remove() {
  const current = selected.value;
  if (!current || !confirm(props.labels.confirmDelete(current.name))) return;
  try { await removeSelected(); }
  catch (cause) { alert(cause instanceof Error ? cause.message : props.labels.deleteError); }
}

async function menuRemove() { menuOpen.value = false; await remove(); }
</script>

<template>
  <div class="entity-controls compact-control">
    <div class="entity-picker-wrap entity-picker-combo" :class="{ open: selectorOpen || menuOpen }">
      <button
        class="entity-picker compact-picker"
        type="button"
        aria-haspopup="menu"
        :aria-expanded="selectorOpen"
        :disabled="loading"
        @click="selectorOpen = !selectorOpen; menuOpen = false"
      >
        <span class="entity-picker-label">{{ compactLabel }}</span>
      </button>
      <div class="entity-menu-wrap" @keydown.esc="menuOpen = false">
        <button
          class="entity-kebab"
          type="button"
          :aria-label="labels.actionsLabel"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen; selectorOpen = false"
        >
          <span>&#8943;</span>
        </button>
        <div v-if="menuOpen" class="entity-backdrop" @click="menuOpen = false" />
        <div v-if="menuOpen" class="entity-menu" role="menu">
          <button v-if="selected" role="menuitem" :disabled="saving" @click="menuRename">Rename</button>
          <button v-if="selected" role="menuitem" class="danger" :disabled="saving" @click="menuRemove">Delete</button>
          <button v-if="!selected" role="menuitem" disabled>{{ labels.emptyMenu }}</button>
        </div>
      </div>
      <button
        class="entity-picker-arrow"
        type="button"
        :aria-label="labels.pickerLabel"
        :aria-expanded="selectorOpen"
        :disabled="loading"
        @click="selectorOpen = !selectorOpen; menuOpen = false"
      >
        <span class="entity-picker-chevron">{{ selectorOpen ? '^' : 'v' }}</span>
      </button>
      <div v-if="selectorOpen" class="entity-backdrop" @click="selectorOpen = false" />
      <div v-if="selectorOpen" class="entity-popover compact-popover" role="menu">
        <button class="entity-new-row" role="menuitem" :disabled="saving" @click="menuSaveAsNew">
          <span class="entity-plus">+</span>
          <span>{{ labels.newItem }}</span>
        </button>
        <div
          v-for="item in items"
          :key="item.id"
          class="entity-row"
          :class="{ current: selectedId === item.id }"
          role="menuitem"
          @click="chooseId(item.id)"
        >
          <span class="entity-row-main">
            <span class="entity-row-title">{{ item.name }}</span>
            <slot name="row-note" :item="item" />
          </span>
        </div>
      </div>
    </div>
    <span v-if="selected && isDirty" class="entity-dirty-dot" title="Unsaved changes" />
    <button
      v-if="selected && (isDirty || saving)"
      class="entity-save"
      :disabled="saving || !isDirty"
      @click="save"
    >
      {{ saving ? 'Saving...' : 'Save' }}
    </button>
    <p v-if="error" class="cc-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.cc-error { color: #c04040; font-size: 11px; width: 100%; text-align: right; margin: 2px 0 0; }
</style>
