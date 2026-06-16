<script setup lang="ts">
// Left panel of the Overview module: prompt metadata, variable inputs,
// the editable prompt text, version history, and the action bar.
import { ref, computed, watch } from 'vue';
import { api } from '../api';
import {
  activePromptData, activeBranchId, activeVersionId, activeVersionText,
  branchTree, variableValues, showSaveModal,
} from '../store/editor';
import { useAppState } from '../store/app';
import { extractVariables } from '../utils/variables';

const { folders, prompts, selectedPromptId } = useAppState();

// ── Local editable copies of metadata ─────────────────────────────────────────
const localName     = ref('');
const localDescription = ref('');
const localFolderId = ref<number | null>(null);
const localTags     = ref<string[]>([]);
const tagInput      = ref('');
const showTagInput  = ref(false);

// ── Editable prompt text ───────────────────────────────────────────────────────
// Local copy — user edits here but changes don't persist until "Save as new version"
const localText = ref('');

watch(activeVersionText, t => { localText.value = t; }, { immediate: true });

// ── Sync local fields from store when prompt changes ──────────────────────────
watch(activePromptData, data => {
  if (!data) return;
  localName.value        = data.name;
  localDescription.value = data.description ?? '';
  localFolderId.value    = data.folder_id;
  localTags.value     = [...data.tags];
}, { immediate: true });

// ── Variables ─────────────────────────────────────────────────────────────────
const detectedVars = computed(() => extractVariables(localText.value));

// Prune variableValues when vars disappear, seed new ones with empty string
watch(detectedVars, vars => {
  const next: Record<string, string> = {};
  for (const v of vars) next[v] = variableValues.value[v] ?? '';
  variableValues.value = next;
}, { immediate: true });

// ── Metadata auto-save helpers ────────────────────────────────────────────────
async function saveName() {
  if (!activePromptData.value || localName.value === activePromptData.value.name) return;
  await api.prompts.patch(activePromptData.value.id, { name: localName.value });
  activePromptData.value = { ...activePromptData.value, name: localName.value };
  // Update sidebar list
  const p = prompts.value.find(p => p.id === activePromptData.value!.id);
  if (p) p.name = localName.value;
}

async function saveMeta() {
  if (!activePromptData.value) return;
  await api.prompts.patch(activePromptData.value.id, {
    description: localDescription.value || null,
    folder_id:   localFolderId.value,
  });
  activePromptData.value = {
    ...activePromptData.value,
    description: localDescription.value || null,
    folder_id:   localFolderId.value,
  };
}

async function saveTags() {
  if (!activePromptData.value) return;
  await api.prompts.patch(activePromptData.value.id, { tags: localTags.value });
  activePromptData.value = { ...activePromptData.value, tags: [...localTags.value] };
}

function addTag() {
  const t = tagInput.value.trim().toLowerCase();
  if (t && !localTags.value.includes(t)) { localTags.value.push(t); saveTags(); }
  tagInput.value = '';
  showTagInput.value = false;
}

function removeTag(tag: string) {
  localTags.value = localTags.value.filter(t => t !== tag);
  saveTags();
}

// ── Version history (current branch) ─────────────────────────────────────────
const currentBranchVersions = computed(() => {
  const branch = branchTree.value.find(b => b.id === activeBranchId.value);
  return branch?.versions ?? [];
});

async function selectVersion(versionId: number) {
  for (const branch of branchTree.value) {
    const v = branch.versions.find(v => v.id === versionId);
    if (v) {
      activeVersionId.value = versionId;
      activeBranchId.value = branch.id;
      activeVersionText.value = v.text;
      localText.value = v.text;
      await api.versions.setCurrent(versionId);
      return;
    }
  }
}

// Inline note editing
const editingNoteId = ref<number | null>(null);
const noteBuffer    = ref('');

async function saveNote(versionId: number) {
  await api.versions.updateNote(versionId, noteBuffer.value.trim() || null as never);
  // Update cached branchTree
  for (const branch of branchTree.value) {
    const v = branch.versions.find(v => v.id === versionId);
    if (v) { v.note = noteBuffer.value.trim() || null; break; }
  }
  editingNoteId.value = null;
}

// ── Delete actions ─────────────────────────────────────────────────────────────
async function deleteVersion() {
  if (!activeVersionId.value) return;
  if (!confirm('Delete this version? This cannot be undone.')) return;
  try {
    await api.versions.delete(activeVersionId.value);
    branchTree.value = await api.prompts.branches(activePromptData.value!.id);
    // Switch to whatever version is now current on this branch
    const branch = branchTree.value.find(b => b.id === activeBranchId.value);
    const cur = branch?.versions.find(v => v.is_current);
    if (cur) {
      activeVersionId.value = cur.id;
      activeVersionText.value = cur.text;
      localText.value = cur.text;
    }
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Could not delete version');
  }
}

async function deletePrompt() {
  if (!activePromptData.value) return;
  if (!confirm(`Delete "${activePromptData.value.name}" and all its data? This cannot be undone.`)) return;
  const id = activePromptData.value.id;
  await api.prompts.delete(id);
  selectedPromptId.value = null;
  activePromptData.value = null;
  prompts.value = prompts.value.filter(p => p.id !== id);
  [folders.value, prompts.value] = await Promise.all([api.folders.list(), api.prompts.list()]);
}

// ── Formatting helpers ─────────────────────────────────────────────────────────
function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function versionLabel(major: number, minor: number): string {
  return `v${major}.${minor}`;
}

</script>

<template>
  <div class="left-panel" v-if="activePromptData">
    <!-- Prompt name -->
    <input
      class="prompt-name"
      v-model="localName"
      @blur="saveName"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
    />

    <!-- Metadata row -->
    <div class="meta-row">
      <!-- Tags -->
      <div class="meta-tags">
        <span v-for="tag in localTags" :key="tag" class="tag">
          {{ tag }}
          <button class="tag-remove" @click="removeTag(tag)">×</button>
        </span>
        <template v-if="showTagInput">
          <input
            v-model="tagInput"
            class="tag-input"
            placeholder="tag name"
            @blur="addTag"
            @keydown.enter="addTag"
            @keydown.escape="showTagInput = false"
            autofocus
          />
        </template>
        <button v-else class="add-tag-btn" @click="showTagInput = true">+ tag</button>
      </div>

      <!-- Dates -->
      <span class="meta-date">Created {{ formatDate(activePromptData.created_at) }}</span>
      <span class="meta-date">Modified {{ formatDate(activePromptData.updated_at) }}</span>
    </div>

    <!-- Description -->
    <div class="field">
      <label class="field-label">Description</label>
      <input v-model="localDescription" class="field-input" placeholder="What is this prompt for?" @blur="saveMeta" />
    </div>


    <!-- Prompt text -->
    <div class="prompt-text-section">
      <p class="section-label">Prompt text</p>
      <textarea v-model="localText" class="prompt-textarea" rows="20" spellcheck="false" />
    </div>

    <!-- Version history -->
    <div class="version-history">
      <p class="section-label">Version history</p>
      <div class="version-list">
        <div
          v-for="v in currentBranchVersions"
          :key="v.id"
          class="version-row"
          :class="{ current: v.id === activeVersionId }"
          @click="selectVersion(v.id)"
        >
          <span class="ver-label">{{ versionLabel(v.major, v.minor) }}</span>
          <span class="ver-date">{{ formatDate(v.created_at) }}</span>

          <!-- Note: inline editable -->
          <span
            v-if="editingNoteId !== v.id"
            class="ver-note"
            @click.stop="editingNoteId = v.id; noteBuffer = v.note ?? ''"
          >
            {{ v.note || '—' }}
          </span>
          <input
            v-else
            class="ver-note-input"
            v-model="noteBuffer"
            @blur="saveNote(v.id)"
            @keydown.enter="saveNote(v.id)"
            @keydown.escape="editingNoteId = null"
            @click.stop
            autofocus
          />
        </div>
      </div>
    </div>

    <!-- Action bar -->
    <div class="action-bar">
      <button class="btn-action-primary" @click="activeVersionText = localText; showSaveModal = true">Save changes</button>
      <div class="action-bar-right">
        <button class="btn-action-danger" @click="deleteVersion">Delete version</button>
        <button class="btn-action-danger" @click="deletePrompt">Delete prompt</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.left-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 32px 36px 48px;
  overflow-y: auto;
  height: 100%;
}

/* ── Name ── */
.prompt-name {
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.02em;
  width: 100%;
  padding: 0;
}
.prompt-name:focus { outline: none; }

/* ── Metadata row ── */
.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.meta-tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--bg-selected);
  border-radius: 3px;
  font-size: 11px;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
}

.tag-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0 2px;
}
.tag-remove:hover { color: var(--text-secondary); }

.tag-input {
  background: none;
  border: none;
  border-bottom: 1px solid #2a2a2a;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  padding: 2px 4px;
  width: 90px;
}
.tag-input:focus { outline: none; border-color: #555; }

.add-tag-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
}
.add-tag-btn:hover { color: var(--text-secondary); }

.meta-date {
  font-size: 11px;
  color: var(--text-faint);
}

/* ── Description ── */
.field { display: flex; flex-direction: column; gap: 6px; }

.field-label { font-size: 10px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-faint); }

.field-input {
  background: none;
  border: none;
  border-bottom: 1px solid #1e1e1e;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: inherit;
  padding: 4px 0;
}
.field-input:focus { outline: none; border-color: #aaa; }

/* ── Variables ── */
.variables-panel {
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.var-grid { display: grid; grid-template-columns: 120px 1fr; gap: 8px 12px; align-items: center; }

.var-label { font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono); }

.var-input {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  padding: 5px 8px;
}
.var-input:focus { outline: none; border-color: #aaa; }

/* ── Prompt text ── */
.prompt-text-section { display: flex; flex-direction: column; gap: 10px; }

.prompt-textarea {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.65;
  padding: 14px 16px;
  resize: vertical;
  min-height: 360px;
}
.prompt-textarea:focus { outline: none; border-color: #aaa; }

/* ── Version history ── */
.version-history { display: flex; flex-direction: column; gap: 10px; }

.version-list { display: flex; flex-direction: column; gap: 2px; }

.version-row {
  display: grid;
  grid-template-columns: 48px 110px 1fr;
  align-items: center;
  gap: 12px;
  padding: 7px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}
.version-row:hover { background: var(--bg-hover); }
.version-row.current { background: var(--bg-selected); }

.ver-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); font-family: var(--font-mono); }
.version-row.current .ver-label { color: var(--text-white); }

.ver-date { font-size: 11px; color: var(--text-faint); }

.ver-note { font-size: 12px; color: var(--text-muted); cursor: text; }
.ver-note-input {
  background: none;
  border: none;
  border-bottom: 1px solid #3a3a3a;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  width: 100%;
}
.ver-note-input:focus { outline: none; }

/* ── Action bar ── */
.action-bar { display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
.action-bar-right { margin-left: auto; display: flex; gap: 8px; }

.btn-action-primary {
  padding: 6px 14px;
  background: #1a1a1a;
  border: none;
  border-radius: 4px;
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
}
.btn-action-primary:hover { background: #333; }

.btn-action-danger {
  padding: 6px 14px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.btn-action-danger:hover { border-color: #f0c0c0; color: #c04040; }
</style>
