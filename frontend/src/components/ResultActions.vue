<script setup lang="ts">
import { ref } from 'vue';
import { api, type EvaluationInput } from '../api';

const props = defineProps<{
  evaluation: EvaluationInput;
  savedId: number | null;
}>();
const emit = defineEmits<{
  saved: [id: number];
  issueCreated: [];
}>();

const saving = ref(false);
const showIssue = ref(false);
const title = ref('');
const note = ref('');
const error = ref<string | null>(null);

async function saveResult() {
  if (props.savedId || saving.value) return;
  saving.value = true;
  error.value = null;
  try {
    const saved = await api.records.createEvaluation(props.evaluation);
    emit('saved', saved.id);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not save result';
  } finally {
    saving.value = false;
  }
}

function openIssue() {
  title.value = '';
  note.value = '';
  error.value = null;
  showIssue.value = true;
}

async function createIssue() {
  if (!title.value.trim() || saving.value) return;
  saving.value = true;
  error.value = null;
  try {
    const issue = await api.issues.create(props.evaluation.prompt_id, {
      title: title.value.trim(),
      note: note.value.trim() || null,
      ...(props.savedId
        ? { evaluation_id: props.savedId }
        : { evaluation: props.evaluation }),
    });
    if (issue.evaluation_id) emit('saved', issue.evaluation_id);
    showIssue.value = false;
    emit('issueCreated');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not create issue';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="result-actions">
    <span v-if="savedId" class="saved-label">Saved</span>
    <button v-else class="result-btn" :disabled="saving" @click="saveResult">
      {{ saving ? 'Saving…' : 'Save result' }}
    </button>
    <button class="result-btn issue" :disabled="saving" @click="openIssue">Flag as issue</button>
  </div>
  <p v-if="error && !showIssue" class="action-error">{{ error }}</p>

  <Teleport to="body">
    <div v-if="showIssue" class="overlay" @click.self="showIssue = false" @keydown.esc.window="showIssue = false">
      <div class="modal">
        <h2>Flag result as issue</h2>
        <label>
          <span>Title</span>
          <input v-model="title" autofocus placeholder="What went wrong?" @keydown.enter="createIssue" />
        </label>
        <label>
          <span>Note</span>
          <textarea v-model="note" rows="5" placeholder="Optional context or expected behavior" />
        </label>
        <p v-if="error" class="action-error">{{ error }}</p>
        <div class="modal-actions">
          <button class="result-btn" @click="showIssue = false">Cancel</button>
          <button class="result-btn primary" :disabled="saving || !title.trim()" @click="createIssue">
            {{ saving ? 'Saving…' : 'Create issue' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.result-actions { display: flex; align-items: center; gap: 7px; margin-left: auto; }
.result-btn { padding: 4px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text-muted); font: inherit; font-size: 11px; cursor: pointer; }
.result-btn:hover:not(:disabled) { color: var(--text-primary); border-color: #aaa; }
.result-btn:disabled { opacity: .5; cursor: default; }
.result-btn.issue { color: #9a5a20; }
.result-btn.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
.saved-label { color: #4f7a52; font-size: 11px; }
.action-error { margin-top: 6px; color: #c04040; font-size: 11px; }
.overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.55); }
.modal { width: min(480px, 90vw); display: flex; flex-direction: column; gap: 16px; padding: 22px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); box-shadow: 0 20px 60px rgba(0,0,0,.25); }
.modal h2 { font-size: 16px; font-weight: 600; }
.modal label { display: flex; flex-direction: column; gap: 6px; color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.modal input, .modal textarea { width: 100%; padding: 9px 10px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg); color: var(--text-primary); font: inherit; font-size: 13px; text-transform: none; letter-spacing: 0; }
.modal textarea { resize: vertical; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
