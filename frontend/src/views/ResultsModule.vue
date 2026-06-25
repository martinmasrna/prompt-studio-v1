<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, type Comparison, type Evaluation, type Issue } from '../api';
import { activePromptData, openIssue } from '../store/editor';
import { renderContent } from '../utils/renderContent';
import ResultActions from '../components/ResultActions.vue';
import ClampBlock from '../components/ClampBlock.vue';
import ResultCard from '../components/ResultCard.vue';

const evaluations = ref<Evaluation[]>([]);
const comparisons = ref<Comparison[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const filter = ref<'all' | 'manual' | 'issues'>('all');

const editingNoteKey = ref<string | null>(null);
const noteDraft = ref('');
const savingNote = ref(false);

const isFlagged = (value: Evaluation) => value.issue !== null;
const comparisonHasIssue = (value: Comparison) => value.evaluations.some(isFlagged);

const timeline = computed(() => [
  ...evaluations.value.map(value => ({ kind: 'evaluation' as const, value, at: value.executed_at })),
  ...comparisons.value.map(value => ({
    kind: 'comparison' as const,
    value,
    at: Math.max(...value.evaluations.map(item => item.executed_at), value.created_at),
  })),
].sort((a, b) => b.at - a.at));

const manualCount = computed(() =>
  evaluations.value.filter(value => !isFlagged(value)).length +
  comparisons.value.filter(value => !comparisonHasIssue(value)).length);
const issuesCount = computed(() =>
  evaluations.value.filter(isFlagged).length +
  comparisons.value.flatMap(value => value.evaluations).filter(isFlagged).length);

const visibleTimeline = computed(() => timeline.value.filter(entry => {
  if (filter.value === 'all') return true;
  const fromIssue = entry.kind === 'evaluation' ? isFlagged(entry.value) : comparisonHasIssue(entry.value);
  return filter.value === 'issues' ? fromIssue : !fromIssue;
}));

function formatDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleString();
}

const relativeTimeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000], ['month', 2592000], ['day', 86400],
  ['hour', 3600], ['minute', 60], ['second', 1],
];
function formatRelative(seconds: number) {
  const delta = seconds - Date.now() / 1000;
  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    if (Math.abs(delta) >= unitSeconds || unit === 'second') {
      return relativeTimeFormat.format(Math.round(delta / unitSeconds), unit);
    }
  }
  return relativeTimeFormat.format(0, 'second');
}

const evaluationNoteKey = (id: number) => `evaluation-${id}`;
const comparisonNoteKey = (id: number) => `comparison-${id}`;

function beginNoteEdit(evaluation: Evaluation) {
  editingNoteKey.value = evaluationNoteKey(evaluation.id);
  noteDraft.value = evaluation.note ?? '';
}

function beginComparisonNoteEdit(comparison: Comparison) {
  editingNoteKey.value = comparisonNoteKey(comparison.id);
  noteDraft.value = comparison.note ?? '';
}

function cancelNoteEdit() {
  editingNoteKey.value = null;
  noteDraft.value = '';
}

async function saveNote(evaluation: Evaluation) {
  if (savingNote.value) return;
  savingNote.value = true;
  try {
    const updated = await api.records.updateEvaluation(evaluation.id, { note: noteDraft.value.trim() || null });
    evaluation.note = updated.note;
    editingNoteKey.value = null;
  } catch (cause) {
    alert(cause instanceof Error ? cause.message : 'Could not save note');
  } finally {
    savingNote.value = false;
  }
}

async function saveComparisonNote(comparison: Comparison) {
  if (savingNote.value) return;
  savingNote.value = true;
  try {
    const updated = await api.records.updateComparison(comparison.id, { note: noteDraft.value.trim() || null });
    comparison.note = updated.note;
    editingNoteKey.value = null;
  } catch (cause) {
    alert(cause instanceof Error ? cause.message : 'Could not save note');
  } finally {
    savingNote.value = false;
  }
}

const openMenuId = ref<string | null>(null);
function toggleMenu(id: string) { openMenuId.value = openMenuId.value === id ? null : id; }

function menuNote(evaluation: Evaluation) {
  openMenuId.value = null;
  beginNoteEdit(evaluation);
}

function menuComparisonNote(comparison: Comparison) {
  openMenuId.value = null;
  beginComparisonNoteEdit(comparison);
}

const flagFor = ref<Evaluation | null>(null);
const flagTitle = ref('');
const flagNote = ref('');
const flagError = ref<string | null>(null);
const flagSaving = ref(false);

function applyIssue(evaluation: Evaluation, issue: Issue) {
  evaluation.issue = issue;
}

function clearIssue(evaluation: Evaluation) {
  evaluation.issue = null;
}

function startFlag(evaluation: Evaluation) {
  openMenuId.value = null;
  if (evaluation.issue) {
    openIssue(evaluation.id);
    return;
  }
  flagFor.value = evaluation;
  flagTitle.value = '';
  flagNote.value = '';
  flagError.value = null;
}

async function submitFlag() {
  const evaluation = flagFor.value;
  if (!evaluation || !flagTitle.value.trim() || flagSaving.value) return;
  flagSaving.value = true;
  flagError.value = null;
  try {
    const issue = await api.issues.create(evaluation.prompt_id, {
      title: flagTitle.value.trim(),
      note: flagNote.value.trim() || null,
      evaluation_id: evaluation.id,
    });
    applyIssue(evaluation, issue);
    flagFor.value = null;
  } catch (cause) {
    flagError.value = cause instanceof Error ? cause.message : 'Could not create issue';
  } finally {
    flagSaving.value = false;
  }
}

async function load() {
  const promptId = activePromptData.value?.id;
  if (!promptId) return;
  loading.value = true;
  error.value = null;
  try {
    const result = await api.records.list(promptId);
    evaluations.value = result.evaluations;
    comparisons.value = result.comparisons;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load results';
  } finally {
    loading.value = false;
  }
}

async function unflagEvaluation(evaluation: Evaluation) {
  await api.issues.delete(evaluation.id);
  clearIssue(evaluation);
}

async function removeEvaluation(evaluation: Evaluation) {
  openMenuId.value = null;
  try {
    if (evaluation.issue) {
      if (confirm('Remove the issue flag and keep this saved result?')) {
        await unflagEvaluation(evaluation);
        return;
      }
      if (!confirm('Delete this saved result and its issue metadata?')) return;
    } else if (!confirm('Delete this saved result?')) {
      return;
    }
    await api.records.deleteEvaluation(evaluation.id);
    evaluations.value = evaluations.value.filter(item => item.id !== evaluation.id);
  } catch (cause) {
    alert(cause instanceof Error ? cause.message : 'Could not delete result');
  }
}

async function removeComparison(comparison: Comparison) {
  openMenuId.value = null;
  const flaggedCount = comparison.evaluations.filter(isFlagged).length;
  const message = flaggedCount
    ? `This comparison contains ${flaggedCount} flagged result${flaggedCount === 1 ? '' : 's'}. Delete the comparison and its issue metadata?`
    : 'Delete this saved comparison and both results?';
  if (!confirm(message)) return;
  try {
    await api.records.deleteComparison(comparison.id);
    comparisons.value = comparisons.value.filter(item => item.id !== comparison.id);
  } catch (cause) {
    alert(cause instanceof Error ? cause.message : 'Could not delete comparison');
  }
}

watch(() => activePromptData.value?.id, load, { immediate: true });
</script>

<template>
  <div class="records-view">
    <header>
      <div>
        <h1>Results</h1>
        <p>Explicitly saved run evidence and comparisons.</p>
      </div>
    </header>

    <div class="filters">
      <button :class="{ active: filter === 'all' }" @click="filter = 'all'">All ({{ timeline.length }})</button>
      <button :class="{ active: filter === 'manual' }" @click="filter = 'manual'">Saved ({{ manualCount }})</button>
      <button :class="{ active: filter === 'issues' }" @click="filter = 'issues'">Issues ({{ issuesCount }})</button>
    </div>

    <p v-if="loading" class="empty">Loading...</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="!timeline.length" class="empty">No saved results yet.</p>
    <p v-else-if="!visibleTimeline.length" class="empty">No results in this filter.</p>

    <div v-else class="timeline">
      <template v-for="entry in visibleTimeline" :key="`${entry.kind}-${entry.value.id}`">
        <ResultCard v-if="entry.kind === 'evaluation'" :evaluation="entry.value">
          <template #badge>
            <button
              v-if="entry.value.issue"
              class="badge issue-badge"
              title="Open issue"
              @click.stop="openIssue(entry.value.id)"
            >Issue</button>
          </template>
          <template #actions>
            <div class="menu-wrap">
              <button class="kebab" aria-label="Result actions" @click.stop="toggleMenu(evaluationNoteKey(entry.value.id))">&#8942;</button>
              <template v-if="openMenuId === evaluationNoteKey(entry.value.id)">
                <div class="menu-backdrop" @click.stop="openMenuId = null" />
                <div class="menu" role="menu" @click.stop>
                  <button role="menuitem" @click="menuNote(entry.value)">{{ entry.value.note ? 'Edit result note' : 'Add result note' }}</button>
                  <button role="menuitem" @click="startFlag(entry.value)">{{ entry.value.issue ? 'Open issue' : 'Flag as issue' }}</button>
                  <button role="menuitem" class="danger" @click="removeEvaluation(entry.value)">Delete</button>
                </div>
              </template>
            </div>
          </template>
          <template #note>
            <div v-if="editingNoteKey === evaluationNoteKey(entry.value.id)" class="note-edit">
              <input
                v-model="noteDraft"
                class="note-input"
                placeholder="Short note about this result"
                autofocus
                @keydown.enter="saveNote(entry.value)"
                @keydown.ctrl.s.prevent="saveNote(entry.value)"
                @keydown.meta.s.prevent="saveNote(entry.value)"
                @keydown.esc="cancelNoteEdit"
              />
              <button class="btn" :disabled="savingNote" @click.stop="cancelNoteEdit">Cancel</button>
              <button class="btn primary" :disabled="savingNote" @click.stop="saveNote(entry.value)">
                {{ savingNote ? 'Saving...' : 'Save' }}
              </button>
            </div>
            <p v-else-if="entry.value.note" class="note" @click.stop="beginNoteEdit(entry.value)">{{ entry.value.note }}</p>
          </template>
        </ResultCard>

        <article v-else class="record-card">
          <div class="record-head">
            <div><span class="badge">A/B</span><strong>Saved comparison</strong></div>
            <div class="menu-wrap">
              <button class="kebab" aria-label="Comparison actions" @click="toggleMenu(comparisonNoteKey(entry.value.id))">&#8942;</button>
              <template v-if="openMenuId === comparisonNoteKey(entry.value.id)">
                <div class="menu-backdrop" @click="openMenuId = null" />
                <div class="menu" role="menu">
                  <button role="menuitem" @click="menuComparisonNote(entry.value)">{{ entry.value.note ? 'Edit note' : 'Add note' }}</button>
                  <button role="menuitem" class="danger" @click="removeComparison(entry.value)">Delete</button>
                </div>
              </template>
            </div>
          </div>
          <div v-if="editingNoteKey === comparisonNoteKey(entry.value.id)" class="note-edit">
            <input
              v-model="noteDraft"
              class="note-input"
              placeholder="Short note about this comparison"
              autofocus
              @keydown.enter="saveComparisonNote(entry.value)"
              @keydown.ctrl.s.prevent="saveComparisonNote(entry.value)"
              @keydown.meta.s.prevent="saveComparisonNote(entry.value)"
              @keydown.esc="cancelNoteEdit"
            />
            <button class="btn" :disabled="savingNote" @click="cancelNoteEdit">Cancel</button>
            <button class="btn primary" :disabled="savingNote" @click="saveComparisonNote(entry.value)">
              {{ savingNote ? 'Saving...' : 'Save' }}
            </button>
          </div>
          <p v-else-if="entry.value.note" class="note" @click="beginComparisonNoteEdit(entry.value)">{{ entry.value.note }}</p>
          <div class="comparison-grid">
            <section v-for="(evaluation, index) in entry.value.evaluations" :key="evaluation.id" class="side">
              <h2>
                <button
                  v-if="evaluation.issue"
                  class="badge issue-badge"
                  title="Open issue"
                  @click="openIssue(evaluation.id)"
                >Issue</button>
                {{ index === 0 ? 'A' : 'B' }} - {{ evaluation.version_name_snapshot }}
              </h2>
              <ClampBlock>
                <div v-if="evaluation.response_text" class="markdown-body resp-md" v-html="renderContent(evaluation.response_text)" />
                <p v-else-if="evaluation.error_text" class="resp-error">{{ evaluation.error_text }}</p>
                <p v-else class="resp-empty">(empty response)</p>
              </ClampBlock>
              <details>
                <summary>Execution snapshot</summary>
                <pre>{{ evaluation.rendered_prompt_snapshot }}</pre>
              </details>
              <ResultActions
                :evaluation="evaluation"
                :saved-id="evaluation.id"
                :copy-text="evaluation.response_text ?? ''"
                @issue-created="applyIssue(evaluation, $event)"
              />
            </section>
          </div>
          <div class="card-foot comparison-foot">
            <span></span>
            <span class="date" :title="formatDate(entry.at)">{{ formatRelative(entry.at) }}</span>
          </div>
        </article>
      </template>
    </div>

    <Teleport to="body">
      <div v-if="flagFor" class="overlay" @click.self="flagFor = null" @keydown.esc.window="flagFor = null">
        <div class="modal">
          <h2>Flag result as issue</h2>
          <label>
            <span>Title</span>
            <input v-model="flagTitle" autofocus placeholder="What went wrong?" @keydown.enter="submitFlag" />
          </label>
          <label>
            <span>Issue note</span>
            <textarea v-model="flagNote" rows="4" placeholder="Optional context or expected behavior" />
          </label>
          <p v-if="flagError" class="error">{{ flagError }}</p>
          <div class="modal-actions">
            <button class="btn" @click="flagFor = null">Cancel</button>
            <button class="btn primary" :disabled="flagSaving || !flagTitle.trim()" @click="submitFlag">
              {{ flagSaving ? 'Saving...' : 'Create issue' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.records-view { flex: 1; overflow-y: auto; padding: 32px 38px 60px; background: var(--bg); }
header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
h1 { font-size: 22px; font-weight: 600; }
header p { margin-top: 5px; color: var(--text-muted); font-size: 13px; }
.filters { display: flex; gap: 4px; margin-bottom: 22px; border-bottom: 1px solid var(--border); }
.filters button { padding: 7px 12px; border: none; border-bottom: 2px solid transparent; background: none; color: var(--text-muted); cursor: pointer; font: inherit; font-size: 12px; }
.filters button.active { border-bottom-color: var(--text-primary); color: var(--text-primary); }
.timeline { display: flex; flex-direction: column; gap: 14px; }
.record-card { padding: 18px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
.record-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.record-head > div { display: flex; align-items: center; gap: 8px; }
.badge { padding: 2px 7px; border: none; border-radius: 3px; background: var(--bg-selected); color: var(--text-muted); font: inherit; font-size: 10px; font-weight: 700; text-transform: uppercase; }
.issue-badge { cursor: pointer; background: #fff2d9; color: #9a5a20; letter-spacing: .02em; }
.issue-badge:hover { background: #ffe9c2; }
.date { color: var(--text-muted); font-size: 11px; }
.card-foot { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-top: 14px; }
.card-foot .date { flex: none; white-space: nowrap; }
.comparison-foot { justify-content: flex-end; }
.menu-wrap { position: relative; }
.kebab { padding: 2px 6px; border: none; border-radius: 4px; background: none; color: var(--text-muted); font-size: 16px; line-height: 1; cursor: pointer; }
.kebab:hover { background: var(--bg-selected); color: var(--text-primary); }
.menu-backdrop { position: fixed; inset: 0; z-index: 1100; }
.menu { position: absolute; top: 100%; right: 0; z-index: 1101; min-width: 150px; margin-top: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); box-shadow: 0 8px 24px rgba(0,0,0,.14); display: flex; flex-direction: column; }
.menu button { padding: 7px 10px; border: none; border-radius: 4px; background: none; color: var(--text-secondary); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.menu button:hover { background: var(--bg-selected); color: var(--text-primary); }
.menu button.danger { color: #b33; }
.menu button.danger:hover { background: #fdeaea; }
.resp-md { font-size: 13px; }
.resp-error { color: #c04040; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
.resp-empty { color: var(--text-faint); font-size: 13px; }
.note { margin: 0 0 16px; padding: 6px 10px; border-left: 3px solid #9a5a20; background: var(--bg-sunken); color: var(--text-secondary); font-size: 12px; line-height: 1.45; cursor: pointer; white-space: pre-wrap; }
.note:hover { color: var(--text-primary); }
.note-edit { display: flex; gap: 7px; align-items: center; margin: 0 0 16px; }
.note-input { flex: 1; min-width: 0; padding: 7px 10px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg); color: var(--text-primary); font: inherit; font-size: 13px; }
details { margin-top: 12px; color: var(--text-secondary); font-size: 12px; }
summary { cursor: pointer; color: var(--text-muted); }
pre { overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono); font-size: 11px; }
.btn { padding: 5px 11px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text-muted); font: inherit; font-size: 11px; cursor: pointer; }
.btn:hover { color: var(--text-primary); border-color: #aaa; }
.btn.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
.btn:disabled { opacity: .5; cursor: default; }
.comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.side { min-width: 0; padding: 12px; border: 1px solid var(--border); border-radius: 6px; }
.side h2 { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; font-size: 12px; }
.side :deep(.result-actions) { margin-top: 10px; }
.empty { color: var(--text-faint); font-size: 13px; }
.error { color: #c04040; font-size: 13px; }
.overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.55); }
.modal { width: min(480px, 90vw); display: flex; flex-direction: column; gap: 14px; padding: 22px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); box-shadow: 0 20px 60px rgba(0,0,0,.25); }
.modal h2 { font-size: 16px; font-weight: 600; }
.modal label { display: flex; flex-direction: column; gap: 6px; color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.modal input, .modal textarea { width: 100%; padding: 9px 10px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg); color: var(--text-primary); font: inherit; font-size: 13px; text-transform: none; letter-spacing: 0; resize: vertical; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }

@media (max-width: 880px) {
  .comparison-grid { grid-template-columns: 1fr; }
}
</style>
