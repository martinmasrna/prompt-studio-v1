<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Evaluation } from '../api';
import { tokenizePrompt } from '../utils/variables';
import { formatDate, formatRelative } from '../utils/time';
import ClampBlock from './ClampBlock.vue';
import EvaluationResponse from './EvaluationResponse.vue';

const props = withDefaults(defineProps<{
  evaluation: Evaluation;
  title?: string;
  dateAt?: number;
}>(), {
  title: undefined,
  dateAt: undefined,
});

const INLINE_MAX = 60;
const expandedVars = ref(new Set<string>());

const cardTitle = computed(() => props.title ?? props.evaluation.test_name_snapshot ?? 'Scratch run');
const timestamp = computed(() => props.dateAt ?? props.evaluation.executed_at);
const isShortValue = (value: string) => !value.includes('\n') && value.length <= INLINE_MAX;
const isVarExpanded = (name: string) => expandedVars.value.has(name);

function toggleVar(name: string) {
  const next = new Set(expandedVars.value);
  next.has(name) ? next.delete(name) : next.add(name);
  expandedVars.value = next;
}

function formatChars(n: number): string {
  if (n < 1000) return `${n} chars`;
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k chars`;
}

</script>

<template>
  <article class="record-card">
    <div class="record-head">
      <div class="record-title">
        <slot name="badge" />
        <strong>{{ cardTitle }}</strong>
      </div>
      <slot name="actions" />
    </div>

    <slot name="note" />

    <div class="io-grid">
      <section class="io-col">
        <span class="col-label">Prompt</span>
        <ClampBlock>
          <div class="prompt-body">
            <template
              v-for="(seg, i) in tokenizePrompt(evaluation.prompt_template_snapshot, evaluation.variables)"
              :key="i"
            >
              <span v-if="seg.type === 'text'" class="tpl-text">{{ seg.value }}</span>
              <span v-else-if="seg.value === null" class="var-chip empty">{{ seg.name }} - empty</span>
              <span v-else-if="isShortValue(seg.value)" class="var-inline" :title="seg.name">{{ seg.value }}</span>
              <template v-else>
                <button
                  class="var-chip"
                  :class="{ active: isVarExpanded(seg.name) }"
                  @click.stop="toggleVar(seg.name)"
                >{{ seg.name }} - {{ formatChars(seg.value.length) }} {{ isVarExpanded(seg.name) ? 'v' : '>' }}</button>
                <span v-if="isVarExpanded(seg.name)" class="var-expand">
                  <pre>{{ seg.value }}</pre>
                </span>
              </template>
            </template>
          </div>
        </ClampBlock>
      </section>

      <section class="io-col">
        <span class="col-label">Response</span>
        <EvaluationResponse :response-text="evaluation.response_text" :error-text="evaluation.error_text" />
      </section>
    </div>

    <slot name="after-evidence" />

    <div class="card-foot">
      <details class="snapshot">
        <summary>Execution snapshot</summary>
        <dl>
          <dt>Version</dt><dd>{{ evaluation.version_name_snapshot }}</dd>
          <dt>Model</dt><dd>{{ evaluation.model_label_snapshot }}</dd>
          <dt>Rendered prompt</dt><dd><pre>{{ evaluation.rendered_prompt_snapshot }}</pre></dd>
          <dt>System prompt</dt><dd><pre>{{ evaluation.system_prompt || '(none)' }}</pre></dd>
          <dt>Settings</dt><dd>temperature {{ evaluation.temperature }}, top-p {{ evaluation.top_p }}, top-k {{ evaluation.top_k }}, max {{ evaluation.max_tokens }}, thinking {{ evaluation.enable_thinking ? 'on' : 'off' }}</dd>
          <dt>Metrics</dt><dd>{{ evaluation.tokens_used ?? '-' }} tokens - {{ evaluation.latency_ms ?? '-' }} ms</dd>
        </dl>
      </details>
      <span class="date" :title="formatDate(timestamp)">{{ formatRelative(timestamp) }}</span>
    </div>
  </article>
</template>

<style scoped>
.record-card { padding: 18px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
.record-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.record-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.record-title strong { min-width: 0; overflow-wrap: anywhere; }
.date { color: var(--text-muted); font-size: 11px; }
.card-foot { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-top: 14px; }
.card-foot .snapshot { flex: 1; min-width: 0; margin-top: 0; }
.card-foot .date { flex: none; white-space: nowrap; }
.io-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.io-col { min-width: 0; }
.col-label { display: block; margin-bottom: 8px; font-size: 10px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: var(--text-faint); }
.prompt-body { font-family: var(--font-mono); font-size: 12px; line-height: 1.7; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; }
.var-inline { background: var(--bg-selected); border-bottom: 1px dotted var(--text-muted); border-radius: 2px; padding: 0 3px; color: var(--text-primary); }
.var-chip { display: inline-flex; align-items: baseline; gap: 3px; padding: 1px 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-sunken); color: var(--text-secondary); font-family: var(--font-sans); font-size: 11px; cursor: pointer; vertical-align: baseline; white-space: nowrap; }
.var-chip:hover { border-color: #aaa; color: var(--text-primary); }
.var-chip.active { border-color: #9a5a20; color: #9a5a20; background: #fff2d9; }
.var-chip.empty { cursor: default; font-style: italic; color: var(--text-muted); background: none; }
.var-expand { display: block; margin: 4px 0 0; border: 1px solid var(--border); border-radius: 5px; overflow: hidden; }
.var-expand pre { max-height: 240px; overflow: auto; margin: 0; padding: 10px; font-size: 11px; line-height: 1.5; }
details { margin-top: 12px; color: var(--text-secondary); font-size: 12px; }
summary { cursor: pointer; color: var(--text-muted); }
dl { display: grid; grid-template-columns: 110px 1fr; gap: 8px 12px; margin-top: 12px; }
dt { color: var(--text-muted); }
dd { min-width: 0; }
pre { overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono); font-size: 11px; }

@media (max-width: 880px) {
  .io-grid { grid-template-columns: 1fr; gap: 14px; }
}
</style>
