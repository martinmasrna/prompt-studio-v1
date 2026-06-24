<script setup lang="ts">
// Left panel of the Overview module: prompt metadata, the editable prompt text,
// version history, and the action bar.
import { ref, computed, watch } from 'vue';
import { api } from '../api';
import {
  activePromptData, activeVersionId, activeVersionText,
  versions, variableValues, showSaveModal, newVersionDraftText,
} from '../store/editor';
import { useAppState } from '../store/app';
import { extractVariables } from '../utils/variables';
import PromptEditor from '../components/PromptEditor.vue';

const { prompts } = useAppState();

// ── Local editable copies of metadata ─────────────────────────────────────────
const localName = ref('');

// ── Editable prompt text ───────────────────────────────────────────────────────
// Local copy — user edits here but changes don't persist until "Save as new version"
const localText = ref('');

watch(activeVersionText, t => { localText.value = t; }, { immediate: true });

// ── Sync local fields from store when prompt changes ──────────────────────────
watch(activePromptData, data => {
  if (!data) return;
  localName.value = data.name;
}, { immediate: true });

// ── Dirty state ────────────────────────────────────────────────────────────────
// True when the editor text differs from the saved text of the selected version.
const isDirty = computed(() => localText.value !== activeVersionText.value);

// ── Versions UI ────────────────────────────────────────────────────────────────
// The header dropdown switches the active version; the "Versions" popover holds
// the heavier management (rename, notes, delete) and "Save as new version".
const versionsOpen = ref(false);
const versionActionMenuId = ref<number | null>(null);

const activeVersion = computed(() => (
  versions.value.find(v => v.id === activeVersionId.value) ?? versions.value[0] ?? null
));

function openNewVersionWizard() {
  newVersionDraftText.value = localText.value;
  showSaveModal.value = true;
  versionsOpen.value = false;
  versionActionMenuId.value = null;
}

function toggleVersionActions(versionId: number) {
  versionActionMenuId.value = versionActionMenuId.value === versionId ? null : versionId;
}

function startRename(versionId: number, name: string) {
  editingNameId.value = versionId;
  nameBuffer.value = name;
  editingNoteId.value = null;
  versionActionMenuId.value = null;
}

function startEditDescription(versionId: number, note: string | null) {
  editingNoteId.value = versionId;
  noteBuffer.value = note ?? '';
  editingNameId.value = null;
  versionActionMenuId.value = null;
}

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

// ── Version history ────────────────────────────────────────────────────────────
async function selectVersion(versionId: number) {
  if (versionId === activeVersionId.value) {
    versionsOpen.value = false;
    versionActionMenuId.value = null;
    return;
  }
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
  for (const item of versions.value) item.is_current = item.id === versionId ? 1 : 0;
  versionsOpen.value = false;
  versionActionMenuId.value = null;
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
  versionActionMenuId.value = null;
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
    <div class="workspace-title-row">
      <input
        class="workspace-title-input"
        v-model="localName"
        @blur="saveName"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />

      <div class="workspace-title-actions">
        <span v-if="isDirty" class="workspace-status dirty" title="Unsaved changes">
          <span class="workspace-status-dot" />
          Unsaved
        </span>

        <div class="versions-menu">
          <button
            class="workspace-switcher"
            :class="{ open: versionsOpen }"
            aria-haspopup="menu"
            :aria-expanded="versionsOpen"
            @click="versionsOpen = !versionsOpen"
          >
            <span class="workspace-switcher-label">
              {{ activeVersion?.name ?? 'No version' }}{{ activeVersion?.is_current ? ' · current' : '' }}
            </span>
            <svg class="chevron" width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <div
            v-if="versionsOpen"
            class="popover-backdrop"
            @click="versionsOpen = false; versionActionMenuId = null"
          />

          <div v-if="versionsOpen" class="versions-popover" role="menu">
            <button class="new-version-row" role="menuitem" @click="openNewVersionWizard">
              <span class="new-version-plus">+</span>
              <span>New version</span>
            </button>

            <div class="version-list">
              <div
                v-for="v in versions"
                :key="v.id"
                class="version-row"
                :class="{ current: v.id === activeVersionId }"
                @click="selectVersion(v.id)"
              >
                <div class="ver-main">
                  <span
                    v-if="editingNameId !== v.id"
                    class="ver-label"
                  >{{ v.name }}</span>
                  <input
                    v-else
                    class="ver-label-input"
                    v-model="nameBuffer"
                    @blur="saveVersionName(v.id)"
                    @keydown.enter="saveVersionName(v.id)"
                    @keydown.esc="editingNameId = null"
                    @click.stop
                    autofocus
                  />

                  <span
                    v-if="editingNoteId !== v.id"
                    class="ver-note"
                  >
                    {{ v.note || 'No description' }}
                  </span>
                  <input
                    v-else
                    class="ver-note-input"
                    v-model="noteBuffer"
                    @blur="saveNote(v.id)"
                    @keydown.enter="saveNote(v.id)"
                    @keydown.esc="editingNoteId = null"
                    @click.stop
                    autofocus
                  />
                </div>

                <span v-if="v.id === activeVersionId" class="ver-current">Current</span>

                <div class="version-actions">
                  <button
                    class="ver-kebab"
                    aria-label="Version actions"
                    aria-haspopup="menu"
                    :aria-expanded="versionActionMenuId === v.id"
                    @click.stop="toggleVersionActions(v.id)"
                  >⋮</button>

                  <template v-if="versionActionMenuId === v.id">
                    <div class="action-backdrop" @click.stop="versionActionMenuId = null" />
                    <div class="action-menu" role="menu" @click.stop>
                      <button role="menuitem" @click="startRename(v.id, v.name)">Rename</button>
                      <button role="menuitem" @click="startEditDescription(v.id, v.note)">Edit description</button>
                      <button
                        role="menuitem"
                        class="danger"
                        :disabled="versions.length <= 1"
                        :title="versions.length <= 1 ? 'A prompt must keep at least one version' : 'Delete version'"
                        @click="deleteVersion(v.id, v.name)"
                      >Delete</button>
                    </div>
                  </template>
                </div>
              </div>
            </div>
        </div>
      </div>
    </div>
    </div>

    <!-- Prompt text -->
    <div class="prompt-text-section">
      <div class="prompt-text-header">
        <p class="section-label">Prompt text</p>
      </div>
      <PromptEditor v-model="localText" @save="saveChanges" />
    </div>

    <!-- Action bar -->
    <div class="action-bar">
      <button
        class="btn-action-primary"
        :disabled="savingChanges || !activeVersionId || !isDirty"
        @click="saveChanges"
        title="Save changes (Ctrl+S)"
      >{{ savingChanges ? 'Saving…' : 'Save changes' }}</button>
    </div>
  </div>
</template>

<style scoped>
.left-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 28px 36px 0;
  overflow: hidden;
  height: 100%;
}

.prompt-title-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
}

.title-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

/* ── Name ── */
.prompt-name {
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 21px;
  font-weight: 550;
  letter-spacing: 0;
  width: 100%;
  min-width: 0;
  padding: 0;
}
.prompt-name:focus { outline: none; }

.section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* ── Prompt text ── */
/* The editor is the one flexible region: it fills the space left over after the
   fixed header / version history / action bar, and scrolls internally. This is
   why the panel itself doesn't scroll — no second, parallel scrollbar. */
.prompt-text-section { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; }

.prompt-text-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
}

.unsaved-dot { color: #c79a3a; font-size: 11px; font-family: var(--font-mono); white-space: nowrap; }

/* ── Version switcher ── */
.version-switcher {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 12.5px;
  min-height: 34px;
  width: 280px;
  max-width: min(36vw, 320px);
  padding: 6px 11px;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}
.version-switcher:hover,
.version-switcher.open,
.version-switcher:focus { outline: none; color: var(--text-primary); border-color: #aaa; }
.version-switcher-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.version-switcher .chevron { flex: 0 0 auto; transition: transform 0.15s; }
.version-switcher.open .chevron { transform: rotate(180deg); }

.versions-menu { position: relative; }

/* Transparent catcher so a click anywhere outside closes the popover. */
.popover-backdrop { position: fixed; inset: 0; z-index: 50; }

.versions-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 51;
  width: min(380px, calc(100vw - 32px));
  max-height: 60vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}

.new-version-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  padding: 7px 10px;
  cursor: pointer;
  text-align: left;
}
.new-version-row:hover { background: var(--bg-hover); color: var(--text-primary); }
.new-version-plus { font-family: var(--font-mono); font-size: 15px; line-height: 1; }

.version-list { display: flex; flex-direction: column; gap: 2px; }

.version-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: start;
  gap: 8px;
  min-height: 44px;
  padding: 7px 6px 7px 10px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.1s;
}
.version-row:hover { background: var(--bg-hover); }
.version-row.current { background: var(--bg-selected); }

.ver-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

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

.ver-note {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
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

.ver-current {
  align-self: center;
  color: var(--text-muted);
  font-size: 10px;
  font-family: var(--font-mono);
  text-transform: uppercase;
}

.version-actions { position: relative; align-self: center; }

.ver-kebab {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: none;
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.ver-kebab:hover,
.ver-kebab[aria-expanded="true"] { background: var(--bg-hover); color: var(--text-primary); }

.action-backdrop { position: fixed; inset: 0; z-index: 52; }
.action-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 53;
  min-width: 150px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  box-shadow: 0 8px 24px rgba(0,0,0,.14);
  display: flex;
  flex-direction: column;
}
.action-menu button {
  padding: 7px 10px;
  border: none;
  border-radius: 5px;
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.action-menu button:hover:not(:disabled) { background: var(--bg-selected); color: var(--text-primary); }
.action-menu button.danger { color: #b33; }
.action-menu button.danger:hover:not(:disabled) { background: #fdeaea; }
.action-menu button:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Action bar ── */
/* Pinned to the bottom of the non-scrolling panel. */
.action-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  position: sticky;
  bottom: 0;
  margin: 0 -36px;
  padding: 7px 36px 18px;
  background: var(--bg);
}

.btn-action-primary {
  min-height: 34px;
  padding: 6px 14px;
  background: #1a1a1a;
  border: none;
  border-radius: 5px;
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
}
.btn-action-primary:hover:not(:disabled) { background: #333; }
.btn-action-primary:disabled { opacity: 0.4; cursor: not-allowed; }

@media (max-width: 760px) {
  .prompt-title-row {
    grid-template-columns: 1fr;
    align-items: start;
    gap: 12px;
  }

  .title-actions {
    width: 100%;
    justify-content: space-between;
  }

  .version-switcher {
    width: min(320px, 100%);
    max-width: none;
  }

  .versions-menu {
    min-width: 0;
  }
}
</style>
