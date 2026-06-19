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

const { prompts } = useAppState();

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

// ── Dirty state ────────────────────────────────────────────────────────────────
// True when the editor text differs from the saved text of the selected version.
const isDirty = computed(() => localText.value !== activeVersionText.value);

// Name of the version the editor is currently bound to (what "Save changes" targets).
const currentVersionName = computed(() =>
  versions.value.find(v => v.id === activeVersionId.value)?.name ?? null
);

// ── Variables ─────────────────────────────────────────────────────────────────
const detectedVars = computed(() => extractVariables(localText.value));

// Seed new variables without deleting values saved for other prompt versions.
watch(detectedVars, vars => {
  const next = { ...variableValues.value };
  for (const v of vars) next[v] ??= '';
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
  if (versionId === activeVersionId.value) return;
  const v = versions.value.find(v => v.id === versionId);
  if (!v) return;
  // Guard against silently discarding unsaved edits when switching versions.
  if (isDirty.value && !confirm('You have unsaved changes that will be lost. Switch version anyway?')) {
    return;
  }
  activeVersionId.value = versionId;
  activeVersionText.value = v.text;
  localText.value = v.text;
  await api.versions.setCurrent(versionId);
}

// Inline name editing
const editingNameId = ref<number | null>(null);
const nameBuffer    = ref('');

async function saveVersionName(versionId: number) {
  const name = nameBuffer.value.trim();
  const v = versions.value.find(v => v.id === versionId);
  editingNameId.value = null;
  if (!v || !name || name === v.name) return;
  await api.versions.updateName(versionId, name);
  v.name = name;
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

// ── Save changes to the current version (in place) ────────────────────────────
const savingChanges = ref(false);

async function saveChanges() {
  if (!activeVersionId.value || savingChanges.value) return;
  savingChanges.value = true;
  try {
    await api.versions.updateText(activeVersionId.value, localText.value);
    activeVersionText.value = localText.value;
    // Keep the in-memory version list in sync so other views see the new text
    const v = versions.value.find(v => v.id === activeVersionId.value);
    if (v) v.text = localText.value;
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Could not save changes');
  } finally {
    savingChanges.value = false;
  }
}

// ── Delete a version ─────────────────────────────────────────────────────────
async function deleteVersion(versionId: number, name: string) {
  if (!confirm(`Delete version "${name}"? This cannot be undone.`)) return;
  try {
    await api.versions.delete(versionId);
    versions.value = await api.prompts.versions(activePromptData.value!.id);
    // If the deleted version was active, switch to whatever version is now current
    if (activeVersionId.value === versionId) {
      const cur = versions.value.find(v => v.is_current) ?? versions.value[0];
      if (cur) {
        activeVersionId.value = cur.id;
        activeVersionText.value = cur.text;
        localText.value = cur.text;
      }
    }
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Could not delete version');
  }
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
      <div class="prompt-text-header">
        <p class="section-label">Prompt text</p>
        <span v-if="currentVersionName" class="editing-target">
          Editing: <strong>{{ currentVersionName }}</strong>
          <span v-if="isDirty" class="unsaved-dot" title="Unsaved changes">• unsaved</span>
        </span>
      </div>
      <textarea
        v-model="localText"
        class="prompt-textarea"
        aria-label="Prompt text"
        rows="20"
        spellcheck="false"
        @keydown.ctrl.s.prevent="saveChanges"
        @keydown.meta.s.prevent="saveChanges"
      />
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
          <span
            v-if="editingNameId !== v.id"
            class="ver-label"
            title="Double-click to rename"
            @dblclick.stop="editingNameId = v.id; nameBuffer = v.name"
          >{{ v.name }}</span>
          <input
            v-else
            class="ver-label-input"
            v-model="nameBuffer"
            @blur="saveVersionName(v.id)"
            @keydown.enter="saveVersionName(v.id)"
            @keydown.escape="editingNameId = null"
            @click.stop
            autofocus
          />


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

          <!-- Delete this version (disabled when it's the only one) -->
          <button
            class="ver-delete"
            :disabled="versions.length <= 1"
            :title="versions.length <= 1 ? 'A prompt must keep at least one version' : 'Delete version'"
            @click.stop="deleteVersion(v.id, v.name)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Action bar -->
    <div class="action-bar">
      <button
        class="btn-action-primary"
        :disabled="savingChanges || !activeVersionId || !isDirty"
        @click="saveChanges"
        title="Save changes (Ctrl+S)"
      >{{ savingChanges ? 'Saving…' : 'Save changes' }}</button>
      <button class="btn-action-secondary" @click="activeVersionText = localText; showSaveModal = true">Save as new version</button>
    </div>
  </div>
</template>

<style scoped>
.left-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 32px 36px 0;
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

.prompt-text-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.editing-target {
  font-size: 11px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  white-space: nowrap;
}
.editing-target strong { color: var(--text-secondary); font-weight: 600; }

.unsaved-dot { color: #c79a3a; margin-left: 8px; }

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
  grid-template-columns: 160px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 7px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}
.version-row:hover { background: var(--bg-hover); }
.version-row.current { background: var(--bg-selected); }

/* Delete button — revealed on row hover */
.ver-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s;
}
.version-row:hover .ver-delete { opacity: 1; }
.ver-delete:hover:not(:disabled) { color: #c04040; }
.ver-delete:disabled { opacity: 0.35; cursor: not-allowed; }
.version-row:hover .ver-delete:disabled { opacity: 0.35; }

.ver-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.version-row.current .ver-label { color: var(--text-white); }

.ver-label-input {
  background: none;
  border: none;
  border-bottom: 1px solid #3a3a3a;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  width: 100%;
}
.ver-label-input:focus { outline: none; }

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
/* Sticky to the bottom of the scrolling panel so Save is always reachable.
   Negative horizontal margins + matching padding let it span the panel's full
   width; the solid background keeps scrolled content from showing through. */
.action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  position: sticky;
  bottom: 0;
  margin: 0 -36px;
  padding: 12px 36px;
  background: var(--bg);
  border-top: 1px solid var(--border);
}

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
.btn-action-primary:hover:not(:disabled) { background: #333; }
.btn-action-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-action-secondary {
  padding: 6px 14px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}
.btn-action-secondary:hover { color: var(--text-primary); border-color: #aaa; }
</style>
