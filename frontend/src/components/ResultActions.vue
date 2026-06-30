<script setup lang="ts">
import { ref } from 'vue';
import { api, type EvaluationInput, type EvaluationIssue, type Issue } from '../api';
import FlagIssueModal from './FlagIssueModal.vue';

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
  showIssue.value = true;
}

function onIssueCreated(issue: Issue) {
  if (issue.evaluation_id) emit('saved', issue.evaluation_id);
  emit('issueCreated', issue);
  showIssue.value = false;
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

  <FlagIssueModal
    v-if="showIssue"
    :evaluation="evaluation"
    :saved-id="savedId"
    @close="showIssue = false"
    @created="onIssueCreated"
  />
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
.icon-btn.done { color: var(--success); }
.icon-btn.saved { color: var(--success); }
/* Flag keeps a warning tint at rest so it reads as the heavier action. */
.icon-btn.issue { color: color-mix(in srgb, var(--warning), var(--text-faint) 35%); }
.icon-btn.issue:hover:not(:disabled) { color: var(--warning-ink); }
.action-error { margin-top: 6px; color: var(--danger-ink); font-size: 11px; }
</style>
