<script setup lang="ts">
// Flag-a-result-as-issue modal. Rendered (via v-if) by whoever owns the trigger;
// it collects a title + note and creates the issue. Handles both a saved result
// (createForEvaluation) and an unsaved one (createFromPrompt, which persists the
// evaluation first) so the same modal serves the Sandbox/A·B and Results views.
import { ref } from 'vue';
import { api, type EvaluationInput, type Issue } from '../api';
import BaseModal from './BaseModal.vue';

const props = defineProps<{
  evaluation: EvaluationInput;
  savedId: number | null;
}>();
const emit = defineEmits<{
  close: [];
  created: [issue: Issue];
}>();

const title = ref('');
const note = ref('');
const error = ref<string | null>(null);
const saving = ref(false);

async function create() {
  if (!title.value.trim() || saving.value) return;
  saving.value = true;
  error.value = null;
  try {
    const data = { title: title.value.trim(), note: note.value.trim() || null };
    const issue = props.savedId
      ? await api.issues.createForEvaluation(props.savedId, data)
      : await api.issues.createFromPrompt(props.evaluation.prompt_id, { ...data, evaluation: props.evaluation });
    emit('created', issue);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not create issue';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseModal @close="emit('close')">
    <template #title>Flag result as issue</template>

    <label>
      <span>Title</span>
      <input v-model="title" autofocus placeholder="What went wrong?" @keydown.enter="create" />
    </label>
    <label>
      <span>Note</span>
      <textarea v-model="note" rows="5" placeholder="Optional context or expected behavior" />
    </label>
    <p v-if="error" class="action-error">{{ error }}</p>

    <template #actions>
      <button class="result-btn" @click="emit('close')">Cancel</button>
      <button class="result-btn primary" :disabled="saving || !title.trim()" @click="create">
        {{ saving ? 'Saving…' : 'Create issue' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
label { display: flex; flex-direction: column; gap: 6px; color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
input, textarea { width: 100%; padding: 9px 10px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg); color: var(--text-primary); font: inherit; font-size: 13px; text-transform: none; letter-spacing: 0; }
textarea { resize: vertical; }
.action-error { margin-top: 6px; color: #c04040; font-size: 11px; }
.result-btn { padding: 4px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text-muted); font: inherit; font-size: 11px; cursor: pointer; }
.result-btn:hover:not(:disabled) { color: var(--text-primary); border-color: #aaa; }
.result-btn:disabled { opacity: .5; cursor: default; }
.result-btn.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
</style>
