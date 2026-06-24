<script setup lang="ts">
// Config selector: picks the prompt-scoped sampling parameter set to run with.
// Mirrors TestCaseControls, but for the "how to decode" axis. The parameter
// sliders themselves (in the advanced panel) edit the selected config.
import {
  configs, selectedConfigId, selectedConfig, isConfigDirty,
  configsLoading, configSaving, configsError,
  selectConfig, saveNewConfig, saveSelectedConfig, deleteSelectedConfig,
} from '../store/configs';

defineProps<{ showActions?: boolean; compact?: boolean }>();

function choose(event: Event) {
  const select = event.target as HTMLSelectElement;
  const previous = selectedConfigId.value;
  const next = select.value ? Number(select.value) : null;
  if (!selectConfig(next)) select.value = previous?.toString() ?? '';
}

async function saveAsNew() {
  const name = prompt('Name this config');
  if (!name?.trim()) return;
  try {
    await saveNewConfig(name);
  } catch {
    // The shared error message is rendered below.
  }
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
</script>

<template>
  <!-- Compact corner control: just the selector plus icon actions, for a box header -->
  <div v-if="compact" class="cc-compact">
    <select class="cc-select" aria-label="Saved config" :value="selectedConfigId ?? ''" :disabled="configsLoading" @change="choose">
      <option value="">Scratch (not saved)</option>
      <option v-for="config in configs" :key="config.id" :value="config.id">{{ config.name }}</option>
    </select>
    <span v-if="selectedConfig && isConfigDirty" class="cc-dot" title="Unsaved changes" />
    <button class="cc-icon" title="Save config" :disabled="!selectedConfig || configSaving || !isConfigDirty" @click="save">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>
      </svg>
    </button>
    <button class="cc-icon" title="Save as new config" :disabled="configSaving" @click="saveAsNew">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>
      </svg>
    </button>
    <button v-if="selectedConfig" class="cc-icon danger" title="Delete config" :disabled="configSaving" @click="remove">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    </button>
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
      <button class="config-btn" :disabled="configSaving" @click="saveAsNew">Save as new</button>

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
/* Compact corner control (box headers) */
.cc-compact { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.cc-select { min-width: 130px; max-width: 220px; min-height: 30px; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--text-secondary); font: inherit; font-size: 12px; padding: 4px 8px; }
.cc-select:focus { outline: none; border-color: #aaa; }
.cc-dot { width: 6px; height: 6px; border-radius: 50%; background: #d6a13a; flex-shrink: 0; }
.cc-icon { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; background: none; border: none; border-radius: 5px; color: var(--text-muted); cursor: pointer; transition: color .12s, background .12s; }
.cc-icon:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-hover); }
.cc-icon.danger:hover:not(:disabled) { color: #b33; background: #fff5f5; }
.cc-icon:disabled { opacity: 0.4; cursor: default; }
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
