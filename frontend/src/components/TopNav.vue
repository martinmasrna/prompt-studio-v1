<script setup lang="ts">
// Top navigation bar. Renders only when a prompt is selected.
// Owns the version-selector dropdown and the save-version modal.
import { ref, computed, watch } from 'vue';
import { api } from '../api';
import {
  activeModule, activePromptData, activeVersionId,
  activeVersionText, versions, showSaveModal, type ModuleTab,
} from '../store/editor';

// ── Module tabs ────────────────────────────────────────────────────────────────
const TABS: { id: ModuleTab; label: string }[] = [
  { id: 'overview',   label: 'Overview' },
  { id: 'ab-tester',  label: 'A/B Tester' },
];

// ── Version selector ──────────────────────────────────────────────────────────
// v-model value is the active version ID as a string (native select uses strings)
const selectedVersionId = computed({
  get: () => String(activeVersionId.value ?? ''),
  set: async (val: string) => {
    const id = Number(val);
    const v = versions.value.find(v => v.id === id);
    if (v) {
      activeVersionId.value = id;
      activeVersionText.value = v.text;
      // Persist the is_current flag so the selection survives reload
      await api.versions.setCurrent(id);
    }
  },
});

// ── Save-as-new-version modal ─────────────────────────────────────────────────
// showSaveModal lives in the editor store so LeftPanel can trigger it directly.
const saveName = ref('');
const saveNote = ref('');
const saving   = ref(false);

async function confirmSaveVersion() {
  if (!activePromptData.value || !saveName.value.trim()) return;
  saving.value = true;
  try {
    const result = await api.prompts.createVersion(activePromptData.value.id, {
      text: activeVersionText.value,
      name: saveName.value.trim(),
      note: saveNote.value.trim() || undefined,
    });
    // Refresh version list and update active version
    versions.value = await api.prompts.versions(activePromptData.value.id);
    activeVersionId.value = result.id;
    showSaveModal.value = false;
    saveName.value = '';
    saveNote.value = '';
  } finally {
    saving.value = false;
  }
}

// Reset fields when modal opens
watch(showSaveModal, open => { if (open) { saveName.value = ''; saveNote.value = ''; } });
</script>

<template>
  <header class="topnav">
    <!-- Left: module tabs -->
    <nav class="tabs">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="tab"
        :class="{ active: activeModule === tab.id }"
        @click="activeModule = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- Right: version controls -->
    <div class="version-controls">
      <select
        v-model="selectedVersionId"
        class="version-select"
        title="Switch version"
      >
        <option v-for="v in versions" :key="v.id" :value="String(v.id)">
          {{ v.name }}{{ v.is_current ? ' ✦' : '' }}
        </option>
      </select>

      <button class="btn-ghost" @click="showSaveModal = true">Save as new version</button>
    </div>
  </header>

  <!-- Save-as-new-version modal -->
  <Teleport to="body">
    <div v-if="showSaveModal" class="overlay" @click.self="showSaveModal = false">
      <div class="modal">
        <h2 class="modal-title">Save as new version</h2>

        <input
          v-model="saveName"
          class="modal-input"
          placeholder="Version name (e.g. concise rewrite, v2, formal-tone)"
          @keydown.enter="confirmSaveVersion"
          autofocus
        />

        <textarea
          v-model="saveNote"
          class="modal-textarea"
          placeholder="Optional note about this version…"
          rows="3"
        />

        <div class="modal-actions">
          <button class="btn-ghost" @click="showSaveModal = false">Cancel</button>
          <button class="btn-primary" :disabled="saving || !saveName.trim()" @click="confirmSaveVersion">
            {{ saving ? 'Saving…' : 'Save version' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.topnav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 16px;
}

/* ── Tabs ── */
.tabs {
  display: flex;
  gap: 2px;
}

.tab {
  padding: 5px 12px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.12s, background 0.12s;
  white-space: nowrap;
}

.tab:hover  { color: var(--text-secondary); background: var(--bg-hover); }
.tab.active { color: var(--text-primary); }

/* ── Version controls ── */
.version-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.version-select {
  background: var(--bg-hover);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  max-width: 200px;
}

.version-select:focus { outline: none; border-color: #aaa; }

.btn-ghost {
  padding: 5px 10px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.12s, border-color 0.12s;
}

.btn-ghost:hover { color: var(--text-primary); border-color: #aaa; }

/* ── Modals (rendered via Teleport, not scoped — use :global or unscoped) ── */
</style>

<!-- Modal styles must be global because Teleport moves them outside this component's root -->
<style>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg);
  border: 1px solid var(--border);
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  border-radius: 8px;
  padding: 24px;
  width: 400px;
  max-width: calc(100vw - 40px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.modal-sub {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: -8px;
}

.modal-textarea,
.modal-input {
  width: 100%;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  padding: 8px 10px;
  resize: vertical;
}

.modal-input { resize: none; }

.modal-textarea:focus,
.modal-input:focus { outline: none; border-color: #aaa; }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-primary {
  padding: 6px 14px;
  background: #1a1a1a;
  border: none;
  border-radius: 4px;
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s;
}

.btn-primary:hover:not(:disabled) { background: #333333; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
