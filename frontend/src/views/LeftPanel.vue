<script setup lang="ts">
// Left panel of the Overview module: prompt metadata, the editable prompt text,
// version history, and the action bar.
import { ref, computed, watch } from 'vue';
import { api } from '../api';
import {
  activePromptData, activeVersionId, activeVersionText,
  activeSystemPrompt, savedSystemPrompt, savedConfigId, applyActiveVersion,
  versions, variableValues, showSaveModal, newVersionDraftText,
} from '../store/editor';
import { selectedConfigId } from '../store/configs';
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
// True when the editor text, the version's system prompt, or its default config
// differs from what was last saved for the selected version. (The system prompt
// is edited in the sandbox / A·B advanced panels, and the default config is the
// shared parameter-panel selection, but both belong to the version.)
const isDirty = computed(() =>
  localText.value !== activeVersionText.value
  || activeSystemPrompt.value !== savedSystemPrompt.value
  || selectedConfigId.value !== savedConfigId.value
);

// ── Versions UI ────────────────────────────────────────────────────────────────
// The header dropdown switches the active version; the "Versions" popover holds
// the heavier management (rename, notes, delete) and "Save as new version".
const versionsOpen = ref(false);
const activeVersionMenuOpen = ref(false);

const activeVersion = computed(() => (
  versions.value.find(v => v.id === activeVersionId.value) ?? versions.value[0] ?? null
));

function openNewVersionWizard() {
  newVersionDraftText.value = localText.value;
  showSaveModal.value = true;
  versionsOpen.value = false;
  activeVersionMenuOpen.value = false;
}

function toggleActiveVersionActions() {
  activeVersionMenuOpen.value = !activeVersionMenuOpen.value;
  versionsOpen.value = false;
}

function renameActiveVersion() {
  if (!activeVersion.value) return;
  activeVersionMenuOpen.value = false;
  startRename(activeVersion.value.id, activeVersion.value.name);
  versionsOpen.value = true;
}

function editActiveVersionDescription() {
  if (!activeVersion.value) return;
  activeVersionMenuOpen.value = false;
  startEditDescription(activeVersion.value.id, activeVersion.value.note);
  versionsOpen.value = true;
}

function deleteActiveVersion() {
  if (!activeVersion.value) return;
  activeVersionMenuOpen.value = false;
  void deleteVersion(activeVersion.value.id, activeVersion.value.name);
}

function startRename(versionId: number, name: string) {
  editingNameId.value = versionId;
  nameBuffer.value = name;
  editingNoteId.value = null;
}

function startEditDescription(versionId: number, note: string | null) {
  editingNoteId.value = versionId;
  noteBuffer.value = note ?? '';
  editingNameId.value = null;
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
    activeVersionMenuOpen.value = false;
    return;
  }
  const v = versions.value.find(v => v.id === versionId);
  if (!v) return;
  // Guard against silently discarding unsaved edits when switching versions.
  if (isDirty.value && !confirm('You have unsaved changes that will be lost. Switch version anyway?')) {
    return;
  }
  applyActiveVersion(v);
  localText.value = v.text;
  await api.versions.setCurrent(versionId);
  for (const item of versions.value) item.is_current = item.id === versionId ? 1 : 0;
  versionsOpen.value = false;
  activeVersionMenuOpen.value = false;
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
    // Save the version's text, system prompt, and default config together.
    await api.versions.update(activeVersionId.value, {
      text: localText.value,
      system_prompt: activeSystemPrompt.value,
      default_config_id: selectedConfigId.value,
    });
    activeVersionText.value = localText.value;
    savedSystemPrompt.value = activeSystemPrompt.value;
    savedConfigId.value = selectedConfigId.value;
    // Keep the in-memory version list in sync so other views see the new state
    const v = versions.value.find(v => v.id === activeVersionId.value);
    if (v) {
      v.text = localText.value;
      v.system_prompt = activeSystemPrompt.value;
      v.default_config_id = selectedConfigId.value;
    }
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
        applyActiveVersion(cur);
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

        <div class="entity-controls version-controls">
          <div class="entity-picker-wrap entity-picker-combo versions-menu" :class="{ open: versionsOpen || activeVersionMenuOpen }">
            <button
            class="entity-picker version-picker"
            aria-haspopup="menu"
            :aria-expanded="versionsOpen"
            @click="versionsOpen = !versionsOpen; activeVersionMenuOpen = false"
          >
            <span class="entity-picker-label">
              {{ activeVersion?.name ?? 'No version' }}<span v-if="activeVersion?.is_current" class="version-star"> ★</span>
            </span>
            </button>

            <div class="entity-menu-wrap" @keydown.esc="activeVersionMenuOpen = false">
              <button
                class="entity-kebab"
                type="button"
                aria-label="Current version actions"
                aria-haspopup="menu"
                :aria-expanded="activeVersionMenuOpen"
                :disabled="!activeVersion"
                @click="toggleActiveVersionActions"
              >
                <span>&#8943;</span>
              </button>

              <template v-if="activeVersionMenuOpen">
                <div class="entity-backdrop" @click="activeVersionMenuOpen = false" />
                <div class="entity-menu" role="menu">
                  <button role="menuitem" @click="renameActiveVersion">Rename</button>
                  <button role="menuitem" @click="editActiveVersionDescription">Edit description</button>
                  <button
                    role="menuitem"
                    class="danger"
                    :disabled="versions.length <= 1"
                    :title="versions.length <= 1 ? 'A prompt must keep at least one version' : 'Delete version'"
                    @click="deleteActiveVersion"
                  >Delete</button>
                </div>
              </template>
            </div>

            <button
              class="entity-picker-arrow"
              type="button"
              aria-label="Open version picker"
              :aria-expanded="versionsOpen"
              @click="versionsOpen = !versionsOpen; activeVersionMenuOpen = false"
            >
              <span class="entity-picker-chevron">{{ versionsOpen ? '^' : 'v' }}</span>
            </button>

            <div
            v-if="versionsOpen"
            class="entity-backdrop"
            @click="versionsOpen = false"
            />

            <div v-if="versionsOpen" class="entity-popover version-popover" role="menu">
            <button class="entity-new-row" role="menuitem" @click="openNewVersionWizard">
              <span class="entity-plus">+</span>
              <span>New version</span>
            </button>

            <div class="version-list">
              <div
                v-for="v in versions"
                :key="v.id"
                class="entity-row"
                :class="{ current: v.id === activeVersionId }"
                role="menuitem"
                @click="selectVersion(v.id)"
              >
                <span class="entity-row-main">
                  <span
                    v-if="editingNameId !== v.id"
                    class="entity-row-title"
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
                    class="entity-row-note"
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
                </span>

              </div>
            </div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- System prompt — part of the version, saved alongside the prompt text -->
    <div class="system-prompt-section">
      <p class="section-label">System prompt</p>
      <textarea
        v-model="activeSystemPrompt"
        class="system-prompt-input"
        placeholder="Optional system instruction…"
        rows="3"
        spellcheck="false"
      />
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
  /* Card padding scales with viewport so it doesn't crowd on smaller screens.
     --pc-pad-x is reused by the bleeding action bar below. */
  --pc-pad-x: clamp(18px, 1.9vw, 28px);
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: clamp(18px, 1.8vw, 24px) var(--pc-pad-x) 0;
  overflow: hidden;
  height: 100%;
}

/* Larger, tighter prompt title to anchor the card (mock spec). */
.left-panel :deep(.workspace-title-input),
.left-panel :deep(.workspace-title) {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.section-label {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* The version ★ is one of the few sanctioned accent touches. */
.version-star { color: var(--accent); }

/* ── Prompt text ── */
/* The editor is the one flexible region: it fills the space left over after the
   fixed header / version history / action bar, and scrolls internally. This is
   why the panel itself doesn't scroll — no second, parallel scrollbar. */
.prompt-text-section { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; }

/* ── System prompt ── */
.system-prompt-section { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
/* Inset, sunken field — elevation language: the field sits "into" the card. */
.system-prompt-input {
  width: 100%;
  background: var(--bg-sunken);
  border: 1px solid transparent;
  border-radius: var(--r-inner);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  min-height: 64px;
  max-height: 200px;
  padding: 13px 15px;
  resize: vertical;
  overflow: auto;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.system-prompt-input::placeholder { color: var(--text-faint); }
.system-prompt-input:hover { border-color: var(--border); }
.system-prompt-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }

.prompt-text-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
}

/* ── Version switcher ── */
.version-controls { align-items: center; }

.versions-menu {
  width: 280px;
  max-width: min(36vw, 320px);
  grid-template-columns: minmax(0, 1fr) 24px 24px;
}

/* Sunken pill (soft-surfaces): inset into the card rather than outlined. */
.left-panel :deep(.versions-menu) {
  background: var(--bg-sunken);
  border-color: transparent;
  border-radius: var(--r-inner);
}
.left-panel :deep(.versions-menu:hover),
.left-panel :deep(.versions-menu.open),
.left-panel :deep(.versions-menu:focus-within) {
  border-color: var(--border);
}

.version-picker {
  width: 100%;
  max-width: none;
  min-height: 34px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  padding: 6px 11px;
}

.version-popover { gap: 4px; }

.version-list { display: flex; flex-direction: column; gap: 2px; }

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
/* Pinned to the bottom of the non-scrolling panel. */
.action-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  position: sticky;
  bottom: 0;
  margin: 0 calc(-1 * var(--pc-pad-x));
  padding: 12px var(--pc-pad-x) 18px;
  background: var(--card);
}

.btn-action-primary {
  min-height: 36px;
  padding: 9px 16px;
  background: #1a1a1a;
  border: 1px solid #1a1a1a;
  border-radius: var(--r-inner);
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.btn-action-primary:hover:not(:disabled) { background: #333; border-color: #333; }
/* Disabled (no unsaved changes) = quiet bordered placeholder, per mock. */
.btn-action-primary:disabled {
  background: var(--card);
  border-color: var(--border);
  color: var(--text-faint);
  cursor: not-allowed;
}

@media (max-width: 760px) {
  .version-picker {
    width: min(320px, 100%);
    max-width: none;
  }

  .versions-menu {
    min-width: 0;
  }
}
</style>
