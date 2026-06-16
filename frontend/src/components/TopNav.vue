<script setup lang="ts">
// Top navigation bar. Renders only when a prompt is selected.
// Owns the version-selector dropdown and both modals (save version, new branch).
import { ref, computed, watch } from 'vue';
import { api } from '../api';
import {
  activeModule, activePromptData, activeBranchId, activeVersionId,
  activeVersionText, branchTree, showSaveModal, type ModuleTab,
} from '../store/editor';

// ── Module tabs ────────────────────────────────────────────────────────────────
const TABS: { id: ModuleTab; label: string }[] = [
  { id: 'overview',   label: 'Overview' },
  { id: 'ab-tester',  label: 'A/B Tester' },
  { id: 'doctor',     label: 'Prompt Doctor' },
  { id: 'brancher',   label: 'Prompt Brancher' },
];

// ── Version selector ──────────────────────────────────────────────────────────
// Flatten branch tree into <optgroup> + <option> pairs keyed by version ID
const versionOptions = computed(() =>
  branchTree.value.map(branch => ({
    branchName: branch.name,
    versions: branch.versions.map(v => ({
      value: v.id,
      label: `${branch.name} ${v.major}.${v.minor}${v.is_current ? ' ✦' : ''}`,
      text: v.text,
      branchId: branch.id,
    })),
  }))
);

// v-model value is the active version ID as a string (native select uses strings)
const selectedVersionId = computed({
  get: () => String(activeVersionId.value ?? ''),
  set: async (val: string) => {
    const id = Number(val);
    // Find in cached branchTree so we don't need a round-trip for the text
    for (const branch of branchTree.value) {
      const v = branch.versions.find(v => v.id === id);
      if (v) {
        activeVersionId.value = id;
        activeBranchId.value = branch.id;
        activeVersionText.value = v.text;
        // Persist the is_current flag so the selection survives reload
        await api.versions.setCurrent(id);
        return;
      }
    }
  },
});

// ── Save-as-new-version modal ─────────────────────────────────────────────────
// showSaveModal lives in the editor store so LeftPanel can trigger it directly.
const saveBump       = ref<'minor' | 'major'>('minor');
const saveNote       = ref('');
const saving         = ref(false);

// Compute the preview label for the next version number
const nextVersionLabel = computed(() => {
  const branch = branchTree.value.find(b => b.id === activeBranchId.value);
  const cur = branch?.versions.find(v => v.is_current);
  if (!cur) return '';
  return saveBump.value === 'major'
    ? `${cur.major + 1}.0`
    : `${cur.major}.${cur.minor + 1}`;
});

async function confirmSaveVersion() {
  if (!activeBranchId.value) return;
  saving.value = true;
  try {
    const result = await api.branches.createVersion(activeBranchId.value, {
      text: activeVersionText.value,
      bump: saveBump.value,
      note: saveNote.value.trim() || undefined,
    });
    // Refresh branch tree and update active version
    branchTree.value = await api.prompts.branches(activePromptData.value!.id);
    activeVersionId.value = result.id;
    activeVersionText.value = activeVersionText.value; // unchanged
    showSaveModal.value = false;
    saveNote.value = '';
  } finally {
    saving.value = false;
  }
}

// ── New branch modal ──────────────────────────────────────────────────────────
const showBranchModal = ref(false);
const newBranchName   = ref('');
const creatingBranch  = ref(false);

async function confirmNewBranch() {
  if (!newBranchName.value.trim() || !activePromptData.value) return;
  creatingBranch.value = true;
  try {
    const result = await api.prompts.createBranch(activePromptData.value.id, newBranchName.value.trim());
    branchTree.value = await api.prompts.branches(activePromptData.value.id);
    // Switch to the new branch's v1.0
    activeBranchId.value = result.id;
    activeVersionId.value = result.version_id;
    const newBranch = branchTree.value.find(b => b.id === result.id);
    activeVersionText.value = newBranch?.versions[0]?.text ?? '';
    showBranchModal.value = false;
    newBranchName.value = '';
  } finally {
    creatingBranch.value = false;
  }
}

// Reset bump + note when modal opens
watch(showSaveModal, open => { if (open) { saveBump.value = 'minor'; saveNote.value = ''; } });
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
        <optgroup
          v-for="group in versionOptions"
          :key="group.branchName"
          :label="group.branchName"
        >
          <option v-for="opt in group.versions" :key="opt.value" :value="String(opt.value)">
            {{ opt.label }}
          </option>
        </optgroup>
      </select>

      <button class="btn-ghost" @click="showSaveModal = true">Save as new version</button>
      <button class="btn-ghost" @click="showBranchModal = true">+ New branch</button>
    </div>
  </header>

  <!-- Save-as-new-version modal -->
  <Teleport to="body">
    <div v-if="showSaveModal" class="overlay" @click.self="showSaveModal = false">
      <div class="modal">
        <h2 class="modal-title">Save as new version</h2>

        <div class="radio-group">
          <label class="radio-label">
            <input v-model="saveBump" type="radio" value="minor" />
            Minor bump
            <span class="radio-hint">small improvement, same intent</span>
          </label>
          <label class="radio-label">
            <input v-model="saveBump" type="radio" value="major" />
            Major bump
            <span class="radio-hint">significant rewrite or change of direction</span>
          </label>
        </div>

        <p class="version-preview">Will save as version <strong>{{ nextVersionLabel }}</strong></p>

        <textarea
          v-model="saveNote"
          class="modal-textarea"
          placeholder="Optional note about this version…"
          rows="3"
        />

        <div class="modal-actions">
          <button class="btn-ghost" @click="showSaveModal = false">Cancel</button>
          <button class="btn-primary" :disabled="saving" @click="confirmSaveVersion">
            {{ saving ? 'Saving…' : 'Save version' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- New branch modal -->
  <Teleport to="body">
    <div v-if="showBranchModal" class="overlay" @click.self="showBranchModal = false">
      <div class="modal">
        <h2 class="modal-title">New branch</h2>
        <p class="modal-sub">Starts at v1.0, copied from the current version's text.</p>
        <input
          v-model="newBranchName"
          class="modal-input"
          placeholder="Branch name (e.g. formal, concise)"
          @keydown.enter="confirmNewBranch"
        />
        <div class="modal-actions">
          <button class="btn-ghost" @click="showBranchModal = false">Cancel</button>
          <button
            class="btn-primary"
            :disabled="!newBranchName.trim() || creatingBranch"
            @click="confirmNewBranch"
          >
            {{ creatingBranch ? 'Creating…' : 'Create branch' }}
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

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.radio-label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.radio-label input { accent-color: #888; cursor: pointer; }

.radio-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.version-preview {
  font-size: 12px;
  color: var(--text-muted);
}

.version-preview strong { color: var(--text-secondary); }

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
