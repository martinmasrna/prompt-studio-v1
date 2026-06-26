<script setup lang="ts">
// Save-as-new-version modal. Triggered from anywhere via showSaveModal (currently
// LeftPanel's "Save changes" button). The overlay/teleport live in BaseModal.
import { ref, watch } from 'vue';
import { api } from '../api';
import {
  activePromptData, activeVersionId, activeVersionText,
  activeSystemPrompt, savedSystemPrompt, savedConfigId,
  versions, showSaveModal, newVersionDraftText,
} from '../store/editor';
import { selectedConfigId } from '../store/configs';
import BaseModal from './BaseModal.vue';

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
  <BaseModal v-if="showSaveModal" @close="showSaveModal = false">
    <template #title>New version</template>

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

    <template #actions>
      <button class="btn-ghost" @click="showSaveModal = false">Cancel</button>
      <button class="btn-primary" :disabled="saving || !saveName.trim()" @click="confirmSaveVersion">
        {{ saving ? 'Creating...' : 'Create version' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.modal-input,
.modal-textarea {
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
.modal-input:focus,
.modal-textarea:focus { outline: none; border-color: #aaa; }
</style>
