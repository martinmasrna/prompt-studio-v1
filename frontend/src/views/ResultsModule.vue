<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, type Comparison, type Evaluation } from '../api';
import { activePromptData, openIssue } from '../store/editor';
import { renderContent } from '../utils/renderContent';
import { tokenizePrompt } from '../utils/variables';
import ResultActions from '../components/ResultActions.vue';
import ClampBlock from '../components/ClampBlock.vue';

const evaluations = ref<Evaluation[]>([]);
const comparisons = ref<Comparison[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const filter = ref<'all' | 'manual' | 'issues'>('all');

const editingNoteId = ref<number | null>(null);
const noteDraft = ref('');
const savingNote = ref(false);

// Variable values up to this length (and single-line) render inline; longer ones collapse to a chip.
const INLINE_MAX = 60;
// Which long-variable chips are expanded, keyed `${evaluationId}:${variableName}`.
const expandedVars = ref(new Set<string>());

const isShortValue = (value: string) => !value.includes('\n') && value.length <= INLINE_MAX;
const isVarExpanded = (id: number, name: string) => expandedVars.value.has(`${id}:${name}`);

function toggleVar(id: number, name: string) {
  const key = `${id}:${name}`;
  const next = new Set(expandedVars.value);
  next.has(key) ? next.delete(key) : next.add(key);
  expandedVars.value = next;
}

function expandedVarsFor(ev: Evaluation): Array<{ name: string; value: string }> {
  return Object.entries(ev.variables)
    .filter(([name, value]) => value && isVarExpanded(ev.id, name))
    .map(([name, value]) => ({ name, value }));
}

function formatChars(n: number): string {
  if (n < 1000) return `${n} chars`;
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k chars`;
}

// A result is "from an issue" when it was auto-saved as the issue's linked evidence.
const isFromIssue = (value: Evaluation) => value.issue_id != null;

const timeline = computed(() => [
  ...evaluations.value.map(value => ({ kind: 'evaluation' as const, value, at: value.executed_at })),
  ...comparisons.value.map(value => ({
    kind: 'comparison' as const,
    value,
    at: Math.max(...value.evaluations.map(item => item.executed_at), value.created_at),
  })),
].sort((a, b) => b.at - a.at));

const manualCount = computed(() =>
  evaluations.value.filter(value => !isFromIssue(value)).length + comparisons.value.length);
const issuesCount = computed(() => evaluations.value.filter(isFromIssue).length);

const visibleTimeline = computed(() => timeline.value.filter(entry => {
  if (filter.value === 'all') return true;
  // Comparisons are always saved manually; issues never auto-create them.
  const fromIssue = entry.kind === 'evaluation' && isFromIssue(entry.value);
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
  const delta = seconds - Date.now() / 1000; // negative for the past
  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    if (Math.abs(delta) >= unitSeconds || unit === 'second') {
      return relativeTimeFormat.format(Math.round(delta / unitSeconds), unit);
    }
  }
  return relativeTimeFormat.format(0, 'second');
}

function beginNoteEdit(evaluation: Evaluation) {
  editingNoteId.value = evaluation.id;
  noteDraft.value = evaluation.note ?? '';
}

function cancelNoteEdit() {
  editingNoteId.value = null;
  noteDraft.value = '';
}

async function saveNote(evaluation: Evaluation) {
  if (savingNote.value) return;
  savingNote.value = true;
  try {
    const updated = await api.records.updateEvaluation(evaluation.id, { note: noteDraft.value.trim() || null });
    evaluation.note = updated.note;
    editingNoteId.value = null;
  } catch (cause) {
    alert(cause instanceof Error ? cause.message : 'Could not save note');
  } finally {
    savingNote.value = false;
  }
}

// Per-card actions menu (⋮).
const openMenuId = ref<number | null>(null);
function toggleMenu(id: number) { openMenuId.value = openMenuId.value === id ? null : id; }

function menuNote(evaluation: Evaluation) {
  openMenuId.value = null;
  beginNoteEdit(evaluation);
}

// Flag-as-issue modal. Results are always already saved, so we link by evaluation_id.
const flagFor = ref<Evaluation | null>(null);
const flagTitle = ref('');
const flagNote = ref('');
const flagError = ref<string | null>(null);
const flagSaving = ref(false);

function startFlag(evaluation: Evaluation) {
  openMenuId.value = null;
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
    evaluation.issue_id = issue.id;
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

async function removeEvaluation(evaluation: Evaluation) {
  openMenuId.value = null;
  if (!confirm('Delete this saved result?')) return;
  try {
    await api.records.deleteEvaluation(evaluation.id);
    evaluations.value = evaluations.value.filter(item => item.id !== evaluation.id);
  } catch (cause) {
    alert(cause instanceof Error ? cause.message : 'Could not delete result');
  }
}

async function removeComparison(comparison: Comparison) {
  if (!confirm('Delete this saved comparison and both results?')) return;
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
      <button class="btn" @click="load">Refresh</button>
    </header>

    <div class="filters">
      <button :class="{ active: filter === 'all' }" @click="filter = 'all'">All ({{ timeline.length }})</button>
      <button :class="{ active: filter === 'manual' }" @click="filter = 'manual'">Saved ({{ manualCount }})</button>
      <button :class="{ active: filter === 'issues' }" @click="filter = 'issues'">From issues ({{ issuesCount }})</button>
    </div>

    <p v-if="loading" class="empty">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="!timeline.length" class="empty">No saved results yet.</p>
    <p v-else-if="!visibleTimeline.length" class="empty">No results in this filter.</p>

    <div v-else class="timeline">
      <article v-for="entry in visibleTimeline" :key="`${entry.kind}-${entry.value.id}`" class="record-card">
        <template v-if="entry.kind === 'evaluation'">
          <div class="record-head">
            <div>
              <button
                v-if="entry.value.issue_id != null"
                class="badge issue-badge"
                title="Auto-saved as evidence for an issue — open it"
                @click="openIssue(entry.value.issue_id)"
              >From issue</button>
              <strong>{{ entry.value.test_name_snapshot || 'Scratch run' }}</strong>
            </div>
            <div class="menu-wrap">
              <button class="kebab" aria-label="Result actions" @click="toggleMenu(entry.value.id)">⋮</button>
              <template v-if="openMenuId === entry.value.id">
                <div class="menu-backdrop" @click="openMenuId = null" />
                <div class="menu" role="menu">
                  <button role="menuitem" @click="menuNote(entry.value)">{{ entry.value.note ? 'Edit note' : 'Add note' }}</button>
                  <button role="menuitem" @click="startFlag(entry.value)">Flag as issue</button>
                  <button role="menuitem" class="danger" @click="removeEvaluation(entry.value)">Delete</button>
                </div>
              </template>
            </div>
          </div>

          <div v-if="editingNoteId === entry.value.id" class="note-edit">
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
            <button class="btn" :disabled="savingNote" @click="cancelNoteEdit">Cancel</button>
            <button class="btn primary" :disabled="savingNote" @click="saveNote(entry.value)">
              {{ savingNote ? 'Saving…' : 'Save' }}
            </button>
          </div>
          <p v-else-if="entry.value.note" class="note" @click="beginNoteEdit(entry.value)">{{ entry.value.note }}</p>

          <div class="io-grid">
            <section class="io-col">
              <span class="col-label">Prompt</span>
              <div class="prompt-body">
                <template
                  v-for="(seg, i) in tokenizePrompt(entry.value.prompt_template_snapshot, entry.value.variables)"
                  :key="i"
                >
                  <span v-if="seg.type === 'text'" class="tpl-text">{{ seg.value }}</span>
                  <span v-else-if="seg.value === null" class="var-chip empty">{{ seg.name }} · empty</span>
                  <span v-else-if="isShortValue(seg.value)" class="var-inline" :title="seg.name">{{ seg.value }}</span>
                  <button
                    v-else
                    class="var-chip"
                    :class="{ active: isVarExpanded(entry.value.id, seg.name) }"
                    @click="toggleVar(entry.value.id, seg.name)"
                  >{{ seg.name }} · {{ formatChars(seg.value.length) }} {{ isVarExpanded(entry.value.id, seg.name) ? '▾' : '▸' }}</button>
                </template>
              </div>
              <div v-for="v in expandedVarsFor(entry.value)" :key="v.name" class="var-expand">
                <div class="var-expand-head">{{ v.name }}</div>
                <pre>{{ v.value }}</pre>
              </div>
            </section>

            <section class="io-col">
              <span class="col-label">Response</span>
              <ClampBlock>
                <div v-if="entry.value.response_text" class="markdown-body resp-md" v-html="renderContent(entry.value.response_text)" />
                <p v-else-if="entry.value.error_text" class="resp-error">{{ entry.value.error_text }}</p>
                <p v-else class="resp-empty">(empty response)</p>
              </ClampBlock>
            </section>
          </div>

          <div class="card-foot">
            <details class="snapshot">
              <summary>Execution snapshot</summary>
              <dl>
                <dt>Version</dt><dd>{{ entry.value.version_name_snapshot }}</dd>
                <dt>Model</dt><dd>{{ entry.value.model_label_snapshot }}</dd>
                <dt>Rendered prompt</dt><dd><pre>{{ entry.value.rendered_prompt_snapshot }}</pre></dd>
                <dt>System prompt</dt><dd><pre>{{ entry.value.system_prompt || '(none)' }}</pre></dd>
                <dt>Settings</dt><dd>temperature {{ entry.value.temperature }}, top-p {{ entry.value.top_p }}, top-k {{ entry.value.top_k }}, max {{ entry.value.max_tokens }}, thinking {{ entry.value.enable_thinking ? 'on' : 'off' }}</dd>
                <dt>Metrics</dt><dd>{{ entry.value.tokens_used ?? '—' }} tokens · {{ entry.value.latency_ms ?? '—' }} ms</dd>
              </dl>
            </details>
            <span class="date" :title="formatDate(entry.value.executed_at)">{{ formatRelative(entry.value.executed_at) }}</span>
          </div>
        </template>

        <template v-else>
          <div class="record-head">
            <div><span class="badge">A/B</span><strong>Saved comparison</strong></div>
            <span class="date">{{ formatDate(entry.at) }}</span>
          </div>
          <div class="comparison-grid">
            <section v-for="(evaluation, index) in entry.value.evaluations" :key="evaluation.id" class="side">
              <h2>{{ index === 0 ? 'A' : 'B' }} · {{ evaluation.version_name_snapshot }}</h2>
              <ClampBlock>
                <div v-if="evaluation.response_text" class="markdown-body resp-md" v-html="renderContent(evaluation.response_text)" />
                <p v-else-if="evaluation.error_text" class="resp-error">{{ evaluation.error_text }}</p>
                <p v-else class="resp-empty">(empty response)</p>
              </ClampBlock>
              <details>
                <summary>Execution snapshot</summary>
                <pre>{{ evaluation.rendered_prompt_snapshot }}</pre>
              </details>
              <ResultActions :evaluation="evaluation" :saved-id="evaluation.id" />
            </section>
          </div>
          <footer><button class="btn danger" @click="removeComparison(entry.value)">Delete comparison</button></footer>
        </template>
      </article>
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
            <span>Note</span>
            <textarea v-model="flagNote" rows="4" placeholder="Optional context or expected behavior" />
          </label>
          <p v-if="flagError" class="error">{{ flagError }}</p>
          <div class="modal-actions">
            <button class="btn" @click="flagFor = null">Cancel</button>
            <button class="btn primary" :disabled="flagSaving || !flagTitle.trim()" @click="submitFlag">
              {{ flagSaving ? 'Saving…' : 'Create issue' }}
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
h1 { font-size: 22px; font-weight: 600; } header p { margin-top: 5px; color: var(--text-muted); font-size: 13px; }
.filters { display: flex; gap: 4px; margin-bottom: 22px; border-bottom: 1px solid var(--border); }
.filters button { padding: 7px 12px; border: none; border-bottom: 2px solid transparent; background: none; color: var(--text-muted); cursor: pointer; font: inherit; font-size: 12px; }
.filters button.active { border-bottom-color: var(--text-primary); color: var(--text-primary); }
.timeline { display: flex; flex-direction: column; gap: 14px; }
.record-card { padding: 18px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
.record-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.record-head > div { display: flex; align-items: center; gap: 8px; }
.badge { padding: 2px 7px; border-radius: 3px; background: var(--bg-selected); color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.issue-badge { border: none; cursor: pointer; background: #fff2d9; color: #9a5a20; font-family: inherit; letter-spacing: .02em; }
.issue-badge:hover { background: #ffe9c2; }
.date { color: var(--text-muted); font-size: 11px; }
.card-foot { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-top: 14px; }
.card-foot .snapshot { flex: 1; min-width: 0; margin-top: 0; }
.card-foot .date { flex: none; white-space: nowrap; }

/* Actions menu (⋮) */
.menu-wrap { position: relative; }
.kebab { padding: 2px 6px; border: none; border-radius: 4px; background: none; color: var(--text-muted); font-size: 16px; line-height: 1; cursor: pointer; }
.kebab:hover { background: var(--bg-selected); color: var(--text-primary); }
.menu-backdrop { position: fixed; inset: 0; z-index: 1100; }
.menu { position: absolute; top: 100%; right: 0; z-index: 1101; min-width: 140px; margin-top: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); box-shadow: 0 8px 24px rgba(0,0,0,.14); display: flex; flex-direction: column; }
.menu button { padding: 7px 10px; border: none; border-radius: 4px; background: none; color: var(--text-secondary); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.menu button:hover { background: var(--bg-selected); color: var(--text-primary); }
.menu button.danger { color: #b33; } .menu button.danger:hover { background: #fdeaea; }

/* Two-column prompt / response */
.io-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.io-col { min-width: 0; }
.col-label { display: block; margin-bottom: 8px; font-size: 10px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: var(--text-faint); }
.prompt-body { font-family: var(--font-mono); font-size: 12px; line-height: 1.7; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; }
.var-inline { background: var(--bg-selected); border-bottom: 1px dotted var(--text-muted); border-radius: 2px; padding: 0 3px; color: var(--text-primary); }
.var-chip { display: inline-flex; align-items: baseline; gap: 3px; padding: 1px 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-sunken); color: var(--text-secondary); font-family: var(--font-sans); font-size: 11px; cursor: pointer; vertical-align: baseline; white-space: nowrap; }
.var-chip:hover { border-color: #aaa; color: var(--text-primary); }
.var-chip.active { border-color: #9a5a20; color: #9a5a20; background: #fff2d9; }
.var-chip.empty { cursor: default; font-style: italic; color: var(--text-muted); background: none; }
.var-expand { margin-top: 10px; border: 1px solid var(--border); border-radius: 5px; overflow: hidden; }
.var-expand-head { padding: 5px 10px; background: var(--bg-sunken); border-bottom: 1px solid var(--border); font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); }
.var-expand pre { max-height: 240px; overflow: auto; margin: 0; padding: 10px; font-size: 11px; }
.resp-md { font-size: 13px; }
.resp-error { color: #c04040; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
.resp-empty { color: var(--text-faint); font-size: 13px; }
.note { margin: 0 0 16px; padding: 6px 10px; border-left: 3px solid #9a5a20; background: var(--bg-sunken); color: var(--text-secondary); font-size: 12px; line-height: 1.45; cursor: pointer; }
.note:hover { color: var(--text-primary); }
.note-edit { display: flex; gap: 7px; align-items: center; margin: 0 0 16px; }
.note-input { flex: 1; min-width: 0; padding: 7px 10px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg); color: var(--text-primary); font: inherit; font-size: 13px; }
details { margin-top: 12px; color: var(--text-secondary); font-size: 12px; }
summary { cursor: pointer; color: var(--text-muted); }
dl { display: grid; grid-template-columns: 110px 1fr; gap: 8px 12px; margin-top: 12px; } dt { color: var(--text-muted); } dd { min-width: 0; }
pre { overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono); font-size: 11px; }
footer { display: flex; align-items: center; gap: 7px; margin-top: 14px; }
.btn { padding: 5px 11px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text-muted); font: inherit; font-size: 11px; cursor: pointer; }
.btn:hover { color: var(--text-primary); border-color: #aaa; } .btn.danger:hover { color: #b33; border-color: #d99; }
.btn.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
.btn:disabled { opacity: .5; cursor: default; }
.comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.side { min-width: 0; padding: 12px; border: 1px solid var(--border); border-radius: 6px; }
.side h2 { margin-bottom: 9px; font-size: 12px; }
.side :deep(.result-actions) { margin-top: 10px; }
.empty { color: var(--text-faint); font-size: 13px; } .error { color: #c04040; font-size: 13px; }

/* Flag-as-issue modal */
.overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.55); }
.modal { width: min(480px, 90vw); display: flex; flex-direction: column; gap: 14px; padding: 22px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); box-shadow: 0 20px 60px rgba(0,0,0,.25); }
.modal h2 { font-size: 16px; font-weight: 600; }
.modal label { display: flex; flex-direction: column; gap: 6px; color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.modal input, .modal textarea { width: 100%; padding: 9px 10px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg); color: var(--text-primary); font: inherit; font-size: 13px; text-transform: none; letter-spacing: 0; resize: vertical; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }

@media (max-width: 880px) {
  .io-grid { grid-template-columns: 1fr; gap: 14px; }
  .comparison-grid { grid-template-columns: 1fr; }
}
</style>
