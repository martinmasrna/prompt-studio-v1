<script setup lang="ts">
// Save-as-new-version modal. Triggered from anywhere via showSaveModal (currently
// LeftPanel's "Save changes" button). Teleported to body so it overlays everything.
import { ref, watch } from 'vue';
import { api } from '../api';
import {
  activePromptData, activeVersionId, activeVersionText,
  activeSystemPrompt, savedSystemPrompt, savedConfigId,
  versions, showSaveModal, newVersionDraftText,
} from '../store/editor';
import { selectedConfigId } from '../store/configs';

const saveName = ref('');
const saveNote = ref('');
const saving   = ref(false);

async function confirmSaveVersion() {
  if (!activePromptData.value || !saveName.value.trim()) return;
  saving.value = true;
  try {
    const text = newVersionDraftText.value ?? activeVersionText.value;
    // The new version captures the current system prompt and the selected config
    // as its default — both are part of the version, not the scenario.
    const result = await api.prompts.createVersion(activePromptData.value.id, {
      text,
      name: saveName.value.trim(),
      note: saveNote.value.trim() || undefined,
      system_prompt: activeSystemPrompt.value,
      default_config_id: selectedConfigId.value,
    });
    // Refresh version list and update active version
    versions.value = await api.prompts.versions(activePromptData.value.id);
    activeVersionId.value = result.id;
    activeVersionText.value = text;
    savedSystemPrompt.value = activeSystemPrompt.value;
    savedConfigId.value = selectedConfigId.value;
    showSaveModal.value = false;
    saveName.value = '';
    saveNote.value = '';
    newVersionDraftText.value = null;
  } finally {
    saving.value = false;
  }
}

// Reset fields when modal opens
watch(showSaveModal, open => {
  if (open) {
    saveName.value = '';
    saveNote.value = '';
  } else {
    newVersionDraftText.value = null;
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="showSaveModal" class="overlay" @click.self="showSaveModal = false">
      <div class="modal">
        <h2 class="modal-title">New version</h2>

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
          placeholder="Description"
          rows="3"
        />

        <div class="modal-actions">
          <button class="btn-ghost" @click="showSaveModal = false">Cancel</button>
          <button class="btn-primary" :disabled="saving || !saveName.trim()" @click="confirmSaveVersion">
            {{ saving ? 'Creating...' : 'Create version' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<!-- Modal styles are global because Teleport moves the markup outside this component's root -->
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
