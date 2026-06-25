<script setup lang="ts">
// Config selector: picks the prompt-scoped sampling parameter set to run with.
// Mirrors TestCaseControls, but for the "how to decode" axis. The parameter
// sliders themselves (in the advanced panel) edit the selected config.
import { computed, ref } from 'vue';
import {
  configs, selectedConfigId, selectedConfig, isConfigDirty,
  configsLoading, configSaving, configsError,
  selectConfig, saveNewConfig, saveSelectedConfig, renameSelectedConfig,
  renameConfig, deleteSelectedConfig, deleteConfig,
} from '../store/configs';

defineProps<{ showActions?: boolean; compact?: boolean }>();

const selectorOpen = ref(false);
const menuOpen = ref(false);
const rowMenuId = ref<number | null>(null);

const compactLabel = computed(() => selectedConfig.value?.name ?? 'Scratch (not saved)');

function choose(event: Event) {
  const select = event.target as HTMLSelectElement;
  const previous = selectedConfigId.value;
  const next = select.value ? Number(select.value) : null;
  if (!selectConfig(next)) select.value = previous?.toString() ?? '';
}

function chooseId(id: number | null): void {
  if (selectConfig(id)) {
    selectorOpen.value = false;
    menuOpen.value = false;
    rowMenuId.value = null;
  }
}

async function saveAsNew() {
  const name = prompt('Name this preset');
  if (!name?.trim()) return;
  try {
    await saveNewConfig(name);
  } catch {
    // The shared error message is rendered below.
  }
}

async function rename() {
  const selected = selectedConfig.value;
  if (!selected) return;
  const name = prompt('Rename preset', selected.name);
  if (!name?.trim()) return;
  try {
    await renameSelectedConfig(name);
  } catch {
    // The shared error message is rendered below.
  }
}

async function renameRow(id: number, currentName: string) {
  rowMenuId.value = null;
  const name = prompt('Rename preset', currentName);
  if (!name?.trim()) return;
  try {
    await renameConfig(id, name);
  } catch {
    // The shared error message is rendered below.
  }
}

async function menuSaveAsNew() {
  selectorOpen.value = false;
  await saveAsNew();
}

async function menuRename() {
  menuOpen.value = false;
  await rename();
}

async function save() {
  try {
    await saveSelectedConfig();
  } catch {
    // The shared error message is rendered below.
  }
}

async function remove() {
  const selected = selectedConfig.value;
  if (!selected || !confirm(`Delete saved config "${selected.name}"?`)) return;
  try {
    await deleteSelectedConfig();
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Could not delete config');
  }
}

async function removeRow(id: number, name: string) {
  rowMenuId.value = null;
  if (!confirm(`Delete saved config "${name}"?`)) return;
  try {
    await deleteConfig(id);
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Could not delete config');
  }
}

async function menuRemove() {
  menuOpen.value = false;
  await remove();
}
</script>

<template>
  <!-- Compact corner control: just the selector plus icon actions, for a box header -->
  <div v-if="compact" class="entity-controls compact-control">
    <div class="entity-picker-wrap">
      <button
        class="entity-picker compact-picker"
        :class="{ open: selectorOpen }"
        type="button"
        aria-haspopup="menu"
        :aria-expanded="selectorOpen"
        :disabled="configsLoading"
        @click="selectorOpen = !selectorOpen; menuOpen = false; rowMenuId = null"
      >
        <span class="entity-picker-label">{{ compactLabel }}</span>
        <span class="entity-picker-chevron">{{ selectorOpen ? '^' : 'v' }}</span>
      </button>
      <div v-if="selectorOpen" class="entity-backdrop" @click="selectorOpen = false; rowMenuId = null" />
      <div v-if="selectorOpen" class="entity-popover compact-popover" role="menu">
        <button class="entity-new-row" role="menuitem" :disabled="configSaving" @click="menuSaveAsNew">
          <span class="entity-plus">+</span>
          <span>New preset</span>
        </button>
        <button
          class="entity-row"
          :class="{ current: selectedConfigId === null }"
          role="menuitem"
          @click="chooseId(null)"
        >
          <span class="entity-row-main">
            <span class="entity-row-title">Scratch</span>
            <span class="entity-row-note">Not saved</span>
          </span>
        </button>
        <div
          v-for="config in configs"
          :key="config.id"
          class="entity-row"
          :class="{ current: selectedConfigId === config.id }"
          role="menuitem"
          @click="chooseId(config.id)"
        >
          <span class="entity-row-main">
            <span class="entity-row-title">{{ config.name }}</span>
            <span class="entity-row-note">
              T {{ config.temperature }} · P {{ config.top_p }} · K {{ config.top_k }}
            </span>
          </span>
          <span class="entity-row-actions">
            <button
              class="entity-kebab"
              type="button"
              aria-label="Preset actions"
              :aria-expanded="rowMenuId === config.id"
              @click.stop="rowMenuId = rowMenuId === config.id ? null : config.id"
            >
              <span>&#8942;</span>
            </button>
            <template v-if="rowMenuId === config.id">
              <div class="entity-backdrop" @click.stop="rowMenuId = null" />
              <div class="entity-menu" role="menu" @click.stop>
                <button role="menuitem" :disabled="configSaving" @click="renameRow(config.id, config.name)">Rename</button>
                <button role="menuitem" class="danger" :disabled="configSaving" @click="removeRow(config.id, config.name)">Delete</button>
              </div>
            </template>
          </span>
        </div>
      </div>
    </div>
    <span v-if="selectedConfig && isConfigDirty" class="entity-dirty-dot" title="Unsaved changes" />
    <button
      v-if="selectedConfig"
      class="entity-save"
      :disabled="configSaving || !isConfigDirty"
      @click="save"
    >
      {{ configSaving ? 'Saving...' : 'Save' }}
    </button>
    <div class="entity-menu-wrap" @keydown.esc="menuOpen = false">
      <button
        class="entity-kebab"
        type="button"
        aria-label="Config actions"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen; selectorOpen = false; rowMenuId = null"
      >
        <span>&#8942;</span>
      </button>
      <div v-if="menuOpen" class="entity-menu" role="menu">
        <button v-if="selectedConfig" role="menuitem" :disabled="configSaving" @click="menuRename">Rename</button>
        <button v-if="selectedConfig" role="menuitem" class="danger" :disabled="configSaving" @click="menuRemove">Delete</button>
        <button v-if="!selectedConfig" role="menuitem" disabled>No saved preset selected</button>
      </div>
    </div>
    <p v-if="configsError" class="cc-error">{{ configsError }}</p>
  </div>

  <div v-else class="config-controls">
    <span class="config-label">Config</span>
    <select class="config-select" aria-label="Saved config" :value="selectedConfigId ?? ''" :disabled="configsLoading" @change="choose">
      <option value="">Scratch (not saved)</option>
      <option v-for="config in configs" :key="config.id" :value="config.id">
        {{ config.name }}
      </option>
    </select>

    <template v-if="showActions !== false">
      <span class="divider" />

      <button v-if="selectedConfig" class="config-btn primary" :disabled="configSaving || !isConfigDirty" @click="save">
        {{ configSaving ? 'Saving…' : 'Save' }}
      </button>
      <button class="config-btn" :disabled="configSaving" @click="saveAsNew">New preset</button>

      <template v-if="selectedConfig">
        <span class="divider" />
        <button class="icon-btn" title="Delete config" :disabled="configSaving" @click="remove">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </template>
    </template>

    <span v-if="selectedConfig" class="config-status" :class="{ dirty: isConfigDirty }" :title="isConfigDirty ? 'Unsaved config changes' : 'All changes saved'">
      <span class="status-dot" />
      {{ isConfigDirty ? 'Unsaved changes' : 'Saved' }}
    </span>
  </div>
  <p v-if="configsError" class="config-error">{{ configsError }}</p>
</template>

<style scoped>
.cc-error { color: #c04040; font-size: 11px; width: 100%; text-align: right; margin: 2px 0 0; }

.config-controls { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.config-label { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
.config-select { min-width: 150px; max-width: 260px; min-height: 34px; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--text-secondary); font: inherit; font-size: 12px; padding: 6px 9px; }
.config-btn { min-height: 34px; padding: 6px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--text-secondary); font-size: 11px; cursor: pointer; white-space: nowrap; }
.config-btn:hover:not(:disabled) { color: var(--text-primary); border-color: #aaa; }
.config-btn:disabled { opacity: 0.45; cursor: default; }
.config-btn.primary { color: var(--text-primary); border-color: var(--text-muted); font-weight: 600; }
.config-btn.primary:disabled { font-weight: 400; }

.divider { width: 1px; height: 16px; background: var(--border); flex-shrink: 0; }

.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; background: none; border: none; border-radius: 5px; color: var(--text-muted); cursor: pointer; transition: color .12s, background .12s; }
.icon-btn:hover:not(:disabled) { color: #b33; background: var(--bg-hover); }
.icon-btn:disabled { opacity: 0.45; cursor: default; }

.config-status { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); white-space: nowrap; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #4f7a52; }
.config-status.dirty { color: #9a6a18; }
.config-status.dirty .status-dot { background: #d6a13a; }

.config-error { color: #c04040; font-size: 11px; margin-top: 6px; }
</style>
