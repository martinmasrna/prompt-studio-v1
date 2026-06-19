<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, type Comparison, type Evaluation } from '../api';
import { activePromptData } from '../store/editor';
import ResultActions from '../components/ResultActions.vue';

const evaluations = ref<Evaluation[]>([]);
const comparisons = ref<Comparison[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const timeline = computed(() => [
  ...evaluations.value.map(value => ({ kind: 'evaluation' as const, value, at: value.executed_at })),
  ...comparisons.value.map(value => ({
    kind: 'comparison' as const,
    value,
    at: Math.max(...value.evaluations.map(item => item.executed_at), value.created_at),
  })),
].sort((a, b) => b.at - a.at));

function formatDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleString();
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

    <p v-if="loading" class="empty">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="!timeline.length" class="empty">No saved results yet.</p>

    <div v-else class="timeline">
      <article v-for="entry in timeline" :key="`${entry.kind}-${entry.value.id}`" class="record-card">
        <template v-if="entry.kind === 'evaluation'">
          <div class="record-head">
            <div>
              <span class="badge">{{ entry.value.source }}</span>
              <strong>{{ entry.value.test_name_snapshot || 'Scratch run' }}</strong>
              <span class="meta">{{ entry.value.version_name_snapshot }} · {{ entry.value.model_label_snapshot }}</span>
            </div>
            <span class="date">{{ formatDate(entry.value.executed_at) }}</span>
          </div>
          <div class="response">{{ entry.value.response_text || entry.value.error_text || '(empty response)' }}</div>
          <details>
            <summary>Execution snapshot</summary>
            <dl>
              <dt>Variables</dt><dd><pre>{{ JSON.stringify(entry.value.variables, null, 2) }}</pre></dd>
              <dt>Rendered prompt</dt><dd><pre>{{ entry.value.rendered_prompt_snapshot }}</pre></dd>
              <dt>System prompt</dt><dd><pre>{{ entry.value.system_prompt || '(none)' }}</pre></dd>
              <dt>Settings</dt><dd>temperature {{ entry.value.temperature }}, top-p {{ entry.value.top_p }}, top-k {{ entry.value.top_k }}, max {{ entry.value.max_tokens }}, thinking {{ entry.value.enable_thinking ? 'on' : 'off' }}</dd>
              <dt>Metrics</dt><dd>{{ entry.value.tokens_used ?? '—' }} tokens · {{ entry.value.latency_ms ?? '—' }} ms</dd>
            </dl>
          </details>
          <footer>
            <button class="btn danger" @click="removeEvaluation(entry.value)">Delete</button>
            <ResultActions :evaluation="entry.value" :saved-id="entry.value.id" />
          </footer>
        </template>

        <template v-else>
          <div class="record-head">
            <div><span class="badge">A/B</span><strong>Saved comparison</strong></div>
            <span class="date">{{ formatDate(entry.at) }}</span>
          </div>
          <div class="comparison-grid">
            <section v-for="(evaluation, index) in entry.value.evaluations" :key="evaluation.id" class="side">
              <h2>{{ index === 0 ? 'A' : 'B' }} · {{ evaluation.version_name_snapshot }}</h2>
              <div class="response">{{ evaluation.response_text || evaluation.error_text || '(empty response)' }}</div>
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
  </div>
</template>

<style scoped>
.records-view { flex: 1; overflow-y: auto; padding: 32px 38px 60px; background: var(--bg); }
header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 26px; }
h1 { font-size: 22px; font-weight: 600; } header p { margin-top: 5px; color: var(--text-muted); font-size: 13px; }
.timeline { display: flex; flex-direction: column; gap: 14px; }
.record-card { padding: 18px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
.record-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.record-head > div { display: flex; align-items: center; gap: 8px; }
.badge { padding: 2px 7px; border-radius: 3px; background: var(--bg-selected); color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.meta, .date { color: var(--text-muted); font-size: 11px; }
.response { padding: 12px 14px; border-radius: 5px; background: var(--bg-sunken); color: var(--text-primary); font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
details { margin-top: 12px; color: var(--text-secondary); font-size: 12px; }
summary { cursor: pointer; color: var(--text-muted); }
dl { display: grid; grid-template-columns: 110px 1fr; gap: 8px 12px; margin-top: 12px; } dt { color: var(--text-muted); } dd { min-width: 0; }
pre { overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono); font-size: 11px; }
footer { display: flex; align-items: center; margin-top: 14px; }
.btn { padding: 5px 11px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text-muted); font: inherit; font-size: 11px; cursor: pointer; }
.btn:hover { color: var(--text-primary); border-color: #aaa; } .btn.danger:hover { color: #b33; border-color: #d99; }
.comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.side { min-width: 0; padding: 12px; border: 1px solid var(--border); border-radius: 6px; }
.side h2 { margin-bottom: 9px; font-size: 12px; }
.side :deep(.result-actions) { margin-top: 10px; }
.empty { color: var(--text-faint); font-size: 13px; } .error { color: #c04040; font-size: 13px; }
</style>
