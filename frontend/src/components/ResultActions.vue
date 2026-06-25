<script setup lang="ts">
import { ref } from 'vue';
import { api, type EvaluationInput, type EvaluationIssue, type Issue } from '../api';

const props = defineProps<{
  evaluation: EvaluationInput & { issue?: EvaluationIssue | null };
  savedId: number | null;
  copyText: string;
}>();
const emit = defineEmits<{
  saved: [id: number];
  issueCreated: [issue: Issue];
}>();

const saving = ref(false);
const showIssue = ref(false);
const title = ref('');
const note = ref('');
const error = ref<string | null>(null);

// Copy gives no other feedback, so the icon briefly swaps to a checkmark.
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;
function copy() {
  if (!props.copyText) return;
  navigator.clipboard.writeText(props.copyText);
  copied.value = true;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copied.value = false), 1500);
}

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
  if (props.evaluation.issue) return;
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
    const data = { title: title.value.trim(), note: note.value.trim() || null };
    const issue = props.savedId
      ? await api.issues.createForEvaluation(props.savedId, data)
      : await api.issues.createFromPrompt(props.evaluation.prompt_id, { ...data, evaluation: props.evaluation });
    if (issue.evaluation_id) emit('saved', issue.evaluation_id);
    showIssue.value = false;
    emit('issueCreated', issue);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not create issue';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="result-actions">
    <!-- Copy output -->
    <button class="icon-btn" :class="{ done: copied }" :title="copied ? 'Copied' : 'Copy output'" @click="copy">
      <svg v-if="copied" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
    </button>

    <!-- Save result -->
    <button
      class="icon-btn"
      :class="{ saved: savedId }"
      :disabled="saving || !!savedId"
      :title="savedId ? 'Saved' : (saving ? 'Saving…' : 'Save result')"
      @click="saveResult"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" :fill="savedId ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
    </button>

    <!-- Flag as issue -->
    <button
      class="icon-btn issue"
      :disabled="saving || !!evaluation.issue"
      :title="evaluation.issue ? 'Already flagged as issue' : 'Flag as issue'"
      @click="openIssue"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
        <line x1="4" y1="22" x2="4" y2="15"/>
      </svg>
    </button>
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
.result-actions { display: flex; align-items: center; gap: 2px; }
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--text-faint);
  cursor: pointer;
  transition: color .12s, background .12s;
}
.icon-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-hover); }
.icon-btn:disabled { cursor: default; }
.icon-btn.done { color: #4f7a52; }
.icon-btn.saved { color: #4f7a52; }
/* Flag keeps an amber tint at rest so it reads as the heavier action. */
.icon-btn.issue { color: #b88a55; }
.icon-btn.issue:hover:not(:disabled) { color: #9a5a20; }
/* Modal "Create issue" button retains the labelled-button styling. */
.result-btn { padding: 4px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text-muted); font: inherit; font-size: 11px; cursor: pointer; }
.result-btn:hover:not(:disabled) { color: var(--text-primary); border-color: #aaa; }
.result-btn:disabled { opacity: .5; cursor: default; }
.result-btn.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
.action-error { margin-top: 6px; color: #c04040; font-size: 11px; }
.overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.55); }
.modal { width: min(480px, 90vw); display: flex; flex-direction: column; gap: 16px; padding: 22px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); box-shadow: 0 20px 60px rgba(0,0,0,.25); }
.modal h2 { font-size: 16px; font-weight: 600; }
.modal label { display: flex; flex-direction: column; gap: 6px; color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.modal input, .modal textarea { width: 100%; padding: 9px 10px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg); color: var(--text-primary); font: inherit; font-size: 13px; text-transform: none; letter-spacing: 0; }
.modal textarea { resize: vertical; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
