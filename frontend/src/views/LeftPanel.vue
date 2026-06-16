<script setup lang="ts">
// Left panel of the Overview module: prompt metadata, the editable prompt text,
// version history, and the action bar.
import { ref, computed, watch } from 'vue';
import { api } from '../api';
import {
  activePromptData, activeVersionId, activeVersionText,
  versions, variableValues, showSaveModal,
} from '../store/editor';
import { useAppState } from '../store/app';
import { extractVariables } from '../utils/variables';

const { prompts, selectedPromptId } = useAppState();

// ── Local editable copies of metadata ─────────────────────────────────────────
const localName     = ref('');
const localDescription = ref('');

// ── Editable prompt text ───────────────────────────────────────────────────────
// Local copy — user edits here but changes don't persist until "Save as new version"
const localText = ref('');

watch(activeVersionText, t => { localText.value = t; }, { immediate: true });

// ── Sync local fields from store when prompt changes ──────────────────────────
watch(activePromptData, data => {
  if (!data) return;
  localName.value        = data.name;
  localDescription.value = data.description ?? '';
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
  });
  activePromptData.value = {
    ...activePromptData.value,
    description: localDescription.value || null,
  };
}

// ── Version history ────────────────────────────────────────────────────────────
async function selectVersion(versionId: number) {
  const v = versions.value.find(v => v.id === versionId);
  if (v) {
    activeVersionId.value = versionId;
    activeVersionText.value = v.text;
    localText.value = v.text;
    await api.versions.setCurrent(versionId);
  }
}

// Inline note editing
const editingNoteId = ref<number | null>(null);
const noteBuffer    = ref('');

async function saveNote(versionId: number) {
  await api.versions.updateNote(versionId, noteBuffer.value.trim() || null);
  const v = versions.value.find(v => v.id === versionId);
  if (v) v.note = noteBuffer.value.trim() || null;
  editingNoteId.value = null;
}

// ── Delete actions ─────────────────────────────────────────────────────────────
async function deleteVersion() {
  if (!activeVersionId.value) return;
  if (!confirm('Delete this version? This cannot be undone.')) return;
  try {
    await api.versions.delete(activeVersionId.value);
    versions.value = await api.prompts.versions(activePromptData.value!.id);
    // Switch to whatever version is now current
    const cur = versions.value.find(v => v.is_current);
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
  prompts.value = await api.prompts.list();
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
          v-for="v in versions"
          :key="v.id"
          class="version-row"
          :class="{ current: v.id === activeVersionId }"
          @click="selectVersion(v.id)"
        >
          <span class="ver-label">{{ v.name }}</span>

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

.section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-faint);
}

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
  grid-template-columns: 160px 1fr;
  align-items: center;
  gap: 12px;
  padding: 7px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}
.version-row:hover { background: var(--bg-hover); }
.version-row.current { background: var(--bg-selected); }

.ver-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.version-row.current .ver-label { color: var(--text-white); }

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
