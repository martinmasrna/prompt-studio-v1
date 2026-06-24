<script setup lang="ts">
// A/B Tester. Compares two runs that differ along exactly one axis — the prompt
// version OR the sampling config — while the other two axes and the scenario's
// variables stay fixed, so any difference in output is attributable to the one
// thing that changed. The system prompt travels with the version and the
// sampling parameters travel with the config, so each side runs with its own
// version's system prompt and its own config's parameters.
import { ref, computed, watch } from 'vue';
import { renderContent } from '../utils/renderContent';
import { api } from '../api';
import type { EvaluationInput, SandboxRunResult } from '../api';
import { activePromptData, activeVersionId, versions, variableValues } from '../store/editor';
import { activeModelId } from '../store/settings';
import {
  configs, selectedConfigId,
  temperature, topP, topK, maxTokens, enableThinking,
} from '../store/configs';
import TestCaseControls from '../components/TestCaseControls.vue';
import ResultActions from '../components/ResultActions.vue';
import VariablesPanel from '../components/VariablesPanel.vue';
import { extractVariables, missingVariables, substituteVariables } from '../utils/variables';
import { captureEvaluationContext, completeEvaluation, type RunSettings } from '../utils/evaluations';

// ── Vary axis ────────────────────────────────────────────────────────────────
type VaryAxis = 'version' | 'config';
const varyAxis = ref<VaryAxis>('version');

// ── Run state ──────────────────────────────────────────────────────────────────
const outputA  = ref<SandboxRunResult | null>(null);
const outputB  = ref<SandboxRunResult | null>(null);
const runningA = ref(false);
const runningB = ref(false);
const errorA   = ref<string | null>(null);
const errorB   = ref<string | null>(null);
const evaluationA = ref<EvaluationInput | null>(null);
const evaluationB = ref<EvaluationInput | null>(null);
const savedA = ref<number | null>(null);
const savedB = ref<number | null>(null);
const savedComparison = ref<number | null>(null);
const comparisonError = ref<string | null>(null);

// ── Axis selections ────────────────────────────────────────────────────────────
// Per-side selectors for the varied axis, plus a shared selector for the held one.
const aVersionId = ref<number | null>(null);
const bVersionId = ref<number | null>(null);
const sharedVersionId = ref<number | null>(null);
const aConfigId = ref<number | null>(null);
const bConfigId = ref<number | null>(null);
const sharedConfigId = ref<number | null>(null);

function resetRun() {
  outputA.value = null; outputB.value = null;
  errorA.value = null; errorB.value = null;
  evaluationA.value = null; evaluationB.value = null;
  savedA.value = null; savedB.value = null;
  savedComparison.value = null; comparisonError.value = null;
}

// Reset selections and outputs whenever the active prompt changes.
watch(() => activePromptData.value?.id, () => {
  aVersionId.value = activeVersionId.value;
  bVersionId.value = activeVersionId.value;
  sharedVersionId.value = activeVersionId.value;
  aConfigId.value = selectedConfigId.value;
  bConfigId.value = selectedConfigId.value;
  sharedConfigId.value = selectedConfigId.value;
  resetRun();
}, { immediate: true });

// ── Resolve each side's effective version and config ───────────────────────────
const versionAId = computed(() => varyAxis.value === 'version' ? aVersionId.value : sharedVersionId.value);
const versionBId = computed(() => varyAxis.value === 'version' ? bVersionId.value : sharedVersionId.value);
const configAId  = computed(() => varyAxis.value === 'config'  ? aConfigId.value  : sharedConfigId.value);
const configBId  = computed(() => varyAxis.value === 'config'  ? bConfigId.value  : sharedConfigId.value);

const textFor = (versionId: number | null) => versions.value.find(v => v.id === versionId)?.text ?? '';
const systemPromptFor = (versionId: number | null) => versions.value.find(v => v.id === versionId)?.system_prompt ?? '';

// A config's parameters come from the saved config; "Scratch" (no config) falls
// back to the live parameter state shared with the sandbox.
function settingsFor(versionId: number | null, configId: number | null): RunSettings {
  const c = configId === null ? null : configs.value.find(x => x.id === configId);
  const params = c
    ? { temperature: c.temperature, top_p: c.top_p, top_k: c.top_k, max_tokens: c.max_tokens, enable_thinking: c.enable_thinking }
    : { temperature: temperature.value, top_p: topP.value, top_k: topK.value, max_tokens: maxTokens.value, enable_thinking: enableThinking.value };
  return { system_prompt: systemPromptFor(versionId), ...params };
}

const aText = computed(() => textFor(versionAId.value));
const bText = computed(() => textFor(versionBId.value));

// ── Variables (union of both sides) ───────────────────────────────────────────
const detectedVars = computed(() => {
  const s = new Set([...extractVariables(aText.value), ...extractVariables(bText.value)]);
  return [...s];
});
watch(detectedVars, vars => {
  const next = { ...variableValues.value };
  for (const v of vars) next[v] ??= '';
  variableValues.value = next;
}, { immediate: true });
const missing = computed(() => [
  ...new Set([
    ...missingVariables(aText.value, variableValues.value),
    ...missingVariables(bText.value, variableValues.value),
  ]),
]);

// ── Prompt preview modal ───────────────────────────────────────────────────────
const promptModal = ref<'a' | 'b' | null>(null);
const modalText = computed(() =>
  promptModal.value === 'a'
    ? substituteVariables(aText.value, variableValues.value)
    : substituteVariables(bText.value, variableValues.value)
);

const isRunning = computed(() => runningA.value || runningB.value);

async function runBoth() {
  if (isRunning.value) return;
  if (missing.value.length) {
    const message = `Fill in required variables: ${missing.value.join(', ')}`;
    errorA.value = message;
    errorB.value = message;
    return;
  }
  if (versionAId.value === null || versionBId.value === null) {
    errorA.value = 'Select a prompt version';
    errorB.value = 'Select a prompt version';
    return;
  }
  const renderedPromptA = substituteVariables(aText.value, variableValues.value);
  const renderedPromptB = substituteVariables(bText.value, variableValues.value);
  const settingsA = settingsFor(versionAId.value, configAId.value);
  const settingsB = settingsFor(versionBId.value, configBId.value);
  const contextA = captureEvaluationContext('ab', versionAId.value, aText.value, renderedPromptA, settingsA);
  const contextB = captureEvaluationContext('ab', versionBId.value, bText.value, renderedPromptB, settingsB);

  resetRun();
  runningA.value = true;
  runningB.value = true;

  const requestFor = (userMessage: string, s: RunSettings) => ({
    user_message:    userMessage,
    model_id:        activeModelId.value ?? undefined,
    system_prompt:   s.system_prompt || undefined,
    temperature:     s.temperature,
    top_p:           s.top_p,
    top_k:           s.top_k,
    max_tokens:      s.max_tokens,
    enable_thinking: s.enable_thinking,
  });

  await Promise.all([
    api.llm.run(requestFor(renderedPromptA, settingsA))
      .then(r  => { outputA.value = r; evaluationA.value = completeEvaluation(contextA, r); })
      .catch(e => { errorA.value  = e instanceof Error ? e.message : 'Unknown error'; })
      .finally(() => { runningA.value = false; }),

    api.llm.run(requestFor(renderedPromptB, settingsB))
      .then(r  => { outputB.value = r; evaluationB.value = completeEvaluation(contextB, r); })
      .catch(e => { errorB.value  = e instanceof Error ? e.message : 'Unknown error'; })
      .finally(() => { runningB.value = false; }),
  ]);
}

async function saveComparison() {
  if (!evaluationA.value || !evaluationB.value || savedComparison.value) return;
  comparisonError.value = null;
  try {
    const comparison = await api.records.createComparison(evaluationA.value.prompt_id, [
      savedA.value ? { evaluation_id: savedA.value } : { evaluation: evaluationA.value },
      savedB.value ? { evaluation_id: savedB.value } : { evaluation: evaluationB.value },
    ]);
    savedComparison.value = comparison.id;
    savedA.value = comparison.evaluations[0]?.id ?? savedA.value;
    savedB.value = comparison.evaluations[1]?.id ?? savedB.value;
  } catch (cause) {
    comparisonError.value = cause instanceof Error ? cause.message : 'Could not save comparison';
  }
}

// ── Markdown ───────────────────────────────────────────────────────────────────
const renderedA = computed(() =>
  outputA.value?.text ? renderContent(outputA.value.text) : ''
);
const renderedB = computed(() =>
  outputB.value?.text ? renderContent(outputB.value.text) : ''
);

</script>

<template>
  <div class="ab-tester">

    <!-- ── Config bar ─────────────────────────────────────── -->
    <div class="config-bar">

      <!-- Vary axis: which single thing differs between the two sides -->
      <div class="vary-row">
        <span class="field-label">Vary</span>
        <div class="vary-toggle" role="tablist">
          <button :class="{ active: varyAxis === 'version' }" role="tab" :aria-selected="varyAxis === 'version'" @click="varyAxis = 'version'">Version</button>
          <button :class="{ active: varyAxis === 'config' }" role="tab" :aria-selected="varyAxis === 'config'" @click="varyAxis = 'config'">Config</button>
        </div>

        <!-- The held axis is a single shared selector -->
        <template v-if="varyAxis === 'version'">
          <span class="field-label held-label">Config (shared)</span>
          <select v-model="sharedConfigId" class="shared-select" aria-label="Shared config">
            <option :value="null">Scratch</option>
            <option v-for="c in configs" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </template>
        <template v-else>
          <span class="field-label held-label">Version (shared)</span>
          <select v-model="sharedVersionId" class="shared-select" aria-label="Shared version">
            <option v-for="v in versions" :key="v.id" :value="v.id">{{ v.name }}{{ v.is_current ? ' ★' : '' }}</option>
          </select>
        </template>
      </div>

      <TestCaseControls />

      <!-- Variables (appear when either side uses {{placeholders}}) -->
      <VariablesPanel :detected-vars="detectedVars" />

      <!-- Run button -->
      <div class="run-row">
        <span v-if="comparisonError" class="comparison-error">{{ comparisonError }}</span>
        <button
          v-if="evaluationA && evaluationB"
          class="save-comparison-btn"
          :disabled="savedComparison !== null"
          @click="saveComparison"
        >{{ savedComparison ? 'Comparison saved' : 'Save comparison' }}</button>
        <button class="run-btn" :class="{ running: isRunning }" :disabled="isRunning" @click="runBoth">
          {{ isRunning ? 'Running…' : 'Run both' }}
        </button>
      </div>

    </div>

    <!-- ── Comparison panels ──────────────────────────────── -->
    <div class="comparison">

      <!-- Side A -->
      <div class="side">
        <div class="side-header">
          <span class="side-badge">A</span>
          <select v-if="varyAxis === 'version'" v-model="aVersionId" class="sel-version" aria-label="Version A">
            <option v-for="v in versions" :key="v.id" :value="v.id">
              {{ v.name }}{{ v.is_current ? ' ★' : '' }}
            </option>
          </select>
          <select v-else v-model="aConfigId" class="sel-version" aria-label="Config A">
            <option :value="null">Scratch</option>
            <option v-for="c in configs" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <button class="eye-btn" title="View prompt" @click="promptModal = 'a'">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>

        <div class="side-output">
          <div v-if="runningA" class="output-loading">
            <span class="spinner" /> Running…
          </div>
          <div v-else-if="errorA" class="run-error">
            <span class="err-icon">⚠</span>{{ errorA }}
          </div>
          <div v-else-if="!outputA" class="output-empty">Run to see output.</div>
          <template v-else>
            <div v-if="outputA.text" class="output-text" v-html="renderedA" />
            <p v-else class="output-empty">(empty response)</p>
            <div class="output-meta">
              <div class="meta-stats">
                <span v-if="outputA.tokens_used != null" class="meta-chip">{{ outputA.tokens_used }} tokens</span>
                <span class="meta-chip">{{ outputA.latency_ms }} ms</span>
              </div>
              <ResultActions
                v-if="evaluationA"
                :evaluation="evaluationA"
                :saved-id="savedA"
                :copy-text="outputA.text"
                @saved="savedA = $event"
              />
            </div>
          </template>
        </div>
      </div>

      <div class="col-divider" />

      <!-- Side B -->
      <div class="side">
        <div class="side-header">
          <span class="side-badge">B</span>
          <select v-if="varyAxis === 'version'" v-model="bVersionId" class="sel-version" aria-label="Version B">
            <option v-for="v in versions" :key="v.id" :value="v.id">
              {{ v.name }}{{ v.is_current ? ' ★' : '' }}
            </option>
          </select>
          <select v-else v-model="bConfigId" class="sel-version" aria-label="Config B">
            <option :value="null">Scratch</option>
            <option v-for="c in configs" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <button class="eye-btn" title="View prompt" @click="promptModal = 'b'">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>

        <div class="side-output">
          <div v-if="runningB" class="output-loading">
            <span class="spinner" /> Running…
          </div>
          <div v-else-if="errorB" class="run-error">
            <span class="err-icon">⚠</span>{{ errorB }}
          </div>
          <div v-else-if="!outputB" class="output-empty">Run to see output.</div>
          <template v-else>
            <div v-if="outputB.text" class="output-text" v-html="renderedB" />
            <p v-else class="output-empty">(empty response)</p>
            <div class="output-meta">
              <div class="meta-stats">
                <span v-if="outputB.tokens_used != null" class="meta-chip">{{ outputB.tokens_used }} tokens</span>
                <span class="meta-chip">{{ outputB.latency_ms }} ms</span>
              </div>
              <ResultActions
                v-if="evaluationB"
                :evaluation="evaluationB"
                :saved-id="savedB"
                :copy-text="outputB.text"
                @saved="savedB = $event"
              />
            </div>
          </template>
        </div>
      </div>

    </div>

    <!-- ── Prompt modal ──────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="promptModal !== null"
        class="modal-overlay"
        @click.self="promptModal = null"
        @keydown.esc.window="promptModal = null"
      >
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">Side {{ promptModal === 'a' ? 'A' : 'B' }} — prompt text</span>
            <button class="modal-close" @click="promptModal = null">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <pre class="modal-body">{{ modalText }}</pre>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
/* ── Container ── */
.ab-tester {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  height: 100%;
  background: var(--bg);
}

/* ── Config bar ── */
.config-bar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
  flex-shrink: 0;
}

.field-block { display: flex; flex-direction: column; gap: 7px; }

.field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-faint);
}

/* ── Vary axis row ── */
.vary-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.held-label { margin-left: 6px; }

.vary-toggle { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.vary-toggle button {
  padding: 6px 14px;
  background: var(--bg);
  border: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.vary-toggle button + button { border-left: 1px solid var(--border); }
.vary-toggle button.active { background: #1a1a1a; color: #fff; }

.shared-select {
  min-height: 32px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  padding: 5px 9px;
}
.shared-select:focus { outline: none; border-color: #aaa; }

.run-row { display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
.save-comparison-btn { padding: 7px 14px; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--text-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.save-comparison-btn:hover:not(:disabled) { border-color: #aaa; color: var(--text-primary); }
.save-comparison-btn:disabled { opacity: .55; cursor: default; }
.comparison-error { color: #c04040; font-size: 11px; margin-right: auto; }

.run-btn {
  flex-shrink: 0;
  padding: 7px 24px;
  background: #1a1a1a;
  border: none;
  border-radius: 5px;
  color: #fff;
  font-size: 13px;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: background 0.12s, opacity 0.12s;
  margin-left: auto;
}
.run-btn:hover:not(:disabled) { background: #333; }
.run-btn:disabled, .run-btn.running { opacity: 0.5; cursor: not-allowed; }

/* ── Comparison ── */
.comparison { flex: 1; display: flex; overflow: hidden; }

.side { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

.col-divider { width: 1px; background: var(--border); flex-shrink: 0; }

/* ── Side header ── */
.side-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
  flex-shrink: 0;
}

.side-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-faint);
  background: var(--bg-selected);
  border-radius: 3px;
  padding: 2px 7px;
  flex-shrink: 0;
}

.sel-version {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  padding: 4px 8px;
  cursor: pointer;
}
.sel-version:focus { outline: none; border-color: #aaa; }

.eye-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.12s, border-color 0.12s;
}
.eye-btn:hover { color: var(--text-secondary); border-color: #aaa; }

/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: min(680px, 90vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.modal-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 3px;
  padding: 0;
}
.modal-close:hover { color: var(--text-primary); background: var(--bg-hover); }
.modal-body {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 18px 20px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Side output ── */
.side-output { flex: 1; overflow-y: auto; padding: 20px 24px; }

.output-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-faint);
  font-size: 13px;
  padding: 8px 0;
}
.output-empty { color: var(--text-faint); font-size: 13px; padding: 8px 0; }

.run-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  background: #fff5f5;
  border: 1px solid #fdd;
  border-radius: 5px;
  color: #c04040;
  font-size: 13px;
  line-height: 1.5;
}
.err-icon { flex-shrink: 0; }

.output-text {
  font-family: var(--font-sans);
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text-primary);
  word-break: break-word;
}
.output-text :deep(p)             { margin: 0 0 12px; }
.output-text :deep(p:last-child)  { margin-bottom: 0; }
.output-text :deep(h1),
.output-text :deep(h2),
.output-text :deep(h3)            { font-weight: 600; margin: 20px 0 8px; color: var(--text-primary); }
.output-text :deep(h1)            { font-size: 17px; }
.output-text :deep(h2)            { font-size: 15px; }
.output-text :deep(h3)            { font-size: 13.5px; }
.output-text :deep(ul),
.output-text :deep(ol)            { padding-left: 20px; margin: 0 0 12px; }
.output-text :deep(li)            { margin-bottom: 4px; }
.output-text :deep(code)          { font-family: var(--font-mono); font-size: 12px; background: var(--bg-selected); padding: 1px 5px; border-radius: 3px; }
.output-text :deep(pre)           { background: var(--bg-selected); border-radius: 5px; padding: 12px 14px; overflow-x: auto; margin: 0 0 12px; }
.output-text :deep(pre code)      { background: none; padding: 0; font-size: 12px; }
.output-text :deep(blockquote)    { border-left: 3px solid var(--border); margin: 0 0 12px; padding: 4px 0 4px 14px; color: var(--text-secondary); }
.output-text :deep(hr)            { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
.output-text :deep(strong)        { font-weight: 600; }
.output-text :deep(a)             { color: var(--text-primary); text-decoration: underline; }

.output-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.meta-stats { display: flex; align-items: center; gap: 8px; }
.meta-chip {
  padding: 2px 8px;
  background: var(--bg-selected);
  border-radius: 3px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* Spinner */
@keyframes ab-spin { to { transform: rotate(360deg); } }
.spinner {
  display: inline-block;
  width: 13px;
  height: 13px;
  border: 2px solid var(--border);
  border-top-color: var(--text-secondary);
  border-radius: 50%;
  animation: ab-spin 0.7s linear infinite;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
