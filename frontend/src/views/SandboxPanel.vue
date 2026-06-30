<script setup lang="ts">
// Right panel of the Overview module — one test run, stacked: Variables →
// Parameters → Run → Output. Variables are the *values* for this run (they
// belong here, not with the reusable prompt template on the left). Parameters
// govern generation. Run triggers it. Output fills the remaining height and
// scrolls internally. Variables & Parameters are collapsible elevated cards so
// Output can reclaim height on demand. All run output state is local; it
// doesn't survive prompt switches.
import { ref, computed } from 'vue';
import { renderContent } from '../utils/renderContent';
import { api } from '../api';
import { activeVersionId, activeVersionText, activeSystemPrompt, variableValues, sandboxOutput, setSandboxOutput } from '../store/editor';
import { activeModelId } from '../store/settings';
import { temperature, topP, topK, maxTokens, enableThinking } from '../store/configs';
import TestCaseControls from '../components/TestCaseControls.vue';
import ConfigControls from '../components/ConfigControls.vue';
import ParameterControls from '../components/ParameterControls.vue';
import VariablesPanel from '../components/VariablesPanel.vue';
import ResultActions from '../components/ResultActions.vue';
import { extractVariables, missingVariables, substituteVariables } from '../utils/variables';
import { buildRunRequest, captureEvaluationContext, completeEvaluation, type RunSettings } from '../utils/evaluations';

// Literal "{{variables}}" for the empty-state hint — kept as data so it isn't
// parsed as a template interpolation.
const variablesToken = '{{variables}}';

// The user message sent to the LLM is always the active prompt text with variables substituted.
const userMessage = computed(() => substituteVariables(activeVersionText.value, variableValues.value));

// ── Variables panel (mirrors LeftPanel; shares variableValues from store) ──────
const detectedVars = computed(() => extractVariables(activeVersionText.value));
const missing = computed(() => missingVariables(activeVersionText.value, variableValues.value));

// ── Collapsible config panels ─────────────────────────────────────────────────
// Default: Variables open (you usually tweak them per run), Parameters folded to
// its summary line so Output gets the height.
const varsCollapsed = ref(false);
const paramsCollapsed = ref(true);

const paramsSummary = computed(() => [
  { label: 'temp', value: temperature.value.toFixed(2) },
  { label: 'top-p', value: topP.value.toFixed(2) },
  { label: 'top-k', value: String(topK.value) },
  { label: 'max', value: String(maxTokens.value) },
]);

// ── Run ────────────────────────────────────────────────────────────────────────
const running  = ref(false);
const runError = ref<string | null>(null);

// Output panel status dot reflects the run lifecycle.
const outputStatus = computed<'idle' | 'running' | 'error' | 'done'>(() => {
  if (running.value) return 'running';
  if (runError.value) return 'error';
  if (sandboxOutput.value) return 'done';
  return 'idle';
});

async function runLLM() {
  if (running.value) return;
  if (missing.value.length) {
    runError.value = `Fill in required variables: ${missing.value.join(', ')}`;
    return;
  }
  running.value = true;
  runError.value = null;
  if (activeVersionId.value === null) {
    running.value = false;
    runError.value = 'No prompt version selected';
    return;
  }
  const context = captureEvaluationContext(
    'sandbox', activeVersionId.value, activeVersionText.value, userMessage.value
  );

  const settings: RunSettings = {
    system_prompt: activeSystemPrompt.value,
    temperature: temperature.value,
    top_p: topP.value,
    top_k: topK.value,
    max_tokens: maxTokens.value,
    enable_thinking: enableThinking.value,
  };

  try {
    const result = await api.llm.run(buildRunRequest(userMessage.value, settings, activeModelId.value));

    setSandboxOutput({
      text:        result.text,
      tokens_used: result.tokens_used,
      latency_ms:  result.latency_ms,
      evaluation: completeEvaluation(context, result),
      savedEvaluationId: null,
    });
  } catch (e: unknown) {
    runError.value = e instanceof Error ? e.message : 'Unknown error';
  } finally {
    running.value = false;
  }
}

function markSaved(id: number) {
  if (sandboxOutput.value) sandboxOutput.value.savedEvaluationId = id;
}

const renderedOutput = computed(() =>
  sandboxOutput.value?.text ? renderContent(sandboxOutput.value.text) : ''
);
</script>

<template>
  <div class="run-col-inner">
    <!-- ── Variables panel ───────────────────────────── -->
    <section class="panel" :class="{ collapsed: varsCollapsed }">
      <header class="panel-head">
        <button
          class="panel-toggle"
          type="button"
          :aria-expanded="!varsCollapsed"
          @click="varsCollapsed = !varsCollapsed"
        >
          <span class="chev" aria-hidden="true">⌄</span>
          <span class="panel-label">Variables</span>
        </button>
        <TestCaseControls />
      </header>

      <div v-if="varsCollapsed" class="panel-summary">
        <template v-if="detectedVars.length">
          <template v-for="(name, i) in detectedVars" :key="name">
            <span v-if="i > 0" class="sep">·</span>
            <span class="k">{{ name }}</span>
          </template>
        </template>
        <span v-else class="summary-empty">No variables</span>
      </div>

      <div v-show="!varsCollapsed" class="panel-body">
        <VariablesPanel v-if="detectedVars.length" :detected-vars="detectedVars" hide-label />
        <p v-else class="box-empty">This prompt has no <code>{{ variablesToken }}</code> yet.</p>
      </div>
    </section>

    <!-- ── Parameters panel ──────────────────────────── -->
    <section class="panel" :class="{ collapsed: paramsCollapsed }">
      <header class="panel-head">
        <button
          class="panel-toggle"
          type="button"
          :aria-expanded="!paramsCollapsed"
          @click="paramsCollapsed = !paramsCollapsed"
        >
          <span class="chev" aria-hidden="true">⌄</span>
          <span class="panel-label">Parameters</span>
        </button>
        <ConfigControls />
      </header>

      <div v-if="paramsCollapsed" class="panel-summary">
        <template v-for="(p, i) in paramsSummary" :key="p.label">
          <span v-if="i > 0" class="sep">·</span>
          <span>{{ p.label }} <b>{{ p.value }}</b></span>
        </template>
      </div>

      <div v-show="!paramsCollapsed" class="panel-body">
        <ParameterControls />
      </div>
    </section>

    <!-- ── Run ───────────────────────────────────────── -->
    <button class="run-btn" :class="{ running }" :disabled="running" @click="runLLM">
      {{ running ? 'Running…' : 'Run ▸' }}
    </button>

    <!-- ── Output ─────────────────────────────────────── -->
    <section class="output">
      <header class="out-head">
        <span class="run-dot" :class="outputStatus" />
        <span class="out-title">Output</span>
      </header>

      <div class="out-body">
        <!-- Loading -->
        <div v-if="running" class="out-state">
          <span class="spinner" aria-hidden="true" />
          <span>Running…</span>
        </div>

        <!-- Error -->
        <div v-else-if="runError" class="run-error">
          <span class="error-icon" aria-hidden="true">⚠</span>{{ runError }}
        </div>

        <!-- Empty (pre-run) -->
        <div v-else-if="!sandboxOutput" class="out-state empty">
          <p class="empty-title">No output yet</p>
          <p class="empty-sub">Run the prompt to generate a response.</p>
        </div>

        <!-- Result -->
        <template v-else>
          <div v-if="sandboxOutput.text" class="answer markdown-body" v-html="renderedOutput" />
          <div v-else class="out-state empty"><p class="empty-sub">(model returned an empty response)</p></div>
        </template>
      </div>

      <!-- Footer: only meaningful once there's a result to act on. -->
      <footer v-if="!running && !runError && sandboxOutput && sandboxOutput.text" class="out-foot">
        <ResultActions
          :evaluation="sandboxOutput.evaluation"
          :saved-id="sandboxOutput.savedEvaluationId"
          :copy-text="sandboxOutput.text"
          @saved="markSaved"
        />
        <div class="meta">
          <span v-if="sandboxOutput.tokens_used != null" class="pill">{{ sandboxOutput.tokens_used }} tokens</span>
          <span class="pill">{{ sandboxOutput.latency_ms }} ms</span>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.run-col-inner {
  /* Card paddings scale with viewport (cap at the big-monitor values). */
  --panel-pad-x: clamp(14px, 1.5vw, 18px);
  --out-pad-x: clamp(16px, 1.7vw, 24px);
  display: flex;
  flex-direction: column;
  gap: clamp(10px, 1vw, 14px);
  min-width: 0;
  min-height: 0;
  height: 100%;
}

/* ── Elevated config cards ── */
/* No overflow:hidden here — the header pickers open popovers that must escape
   the card. The card background is rounded by border-radius regardless. */
.panel {
  flex: none;
  background: var(--card);
  border-radius: var(--r);
  box-shadow: var(--shadow);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px var(--panel-pad-x);
}

.panel-toggle {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  user-select: none;
}

.chev {
  width: 12px;
  text-align: center;
  color: var(--text-faint);
  font-size: 12px;
  transition: transform 0.15s;
}
.panel.collapsed .chev { transform: rotate(-90deg); }

.panel-label {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* One-line summary shown when a panel is folded. */
.panel-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 var(--panel-pad-x) 14px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
}
.panel-summary .k { color: var(--accent-ink); font-weight: 650; }
.panel-summary .sep { color: var(--text-faint); }
.panel-summary b { color: var(--text-secondary); font-weight: 600; }
.summary-empty { color: var(--text-faint); }

.panel-body { padding: 0 var(--panel-pad-x) 16px; }

/* Picker in the panel header — compact width so it shares the row neatly. */
.panel-head :deep(.compact-control) {
  --compact-picker-width: clamp(180px, 22vw, 280px);
  --compact-picker-max-width: 100%;
}
/* Sunken chip (soft-surfaces) instead of an outlined control. */
.panel-head :deep(.entity-picker-combo) {
  background: var(--bg-sunken);
  border-color: transparent;
  border-radius: var(--r-ctl);
}
.panel-head :deep(.entity-picker-combo:hover),
.panel-head :deep(.entity-picker-combo.open),
.panel-head :deep(.entity-picker-combo:focus-within) {
  border-color: var(--border);
}

.panel-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: 4px;
}

.box-empty { color: var(--text-faint); font-size: 12.5px; margin: 0; }
.box-empty code { font-family: var(--font-mono); font-size: 11.5px; background: var(--bg-sunken); padding: 1px 5px; border-radius: 4px; }

/* ── Run — full-width accent button (the one loud accent moment). ── */
.run-btn {
  flex: none;
  width: 100%;
  padding: 13px;
  background: var(--accent);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 14px;
  font-family: inherit;
  font-weight: 650;
  cursor: pointer;
  box-shadow: 0 2px 9px color-mix(in srgb, var(--accent) 38%, transparent);
  transition: background 0.12s, opacity 0.12s;
}
.run-btn:hover:not(:disabled) { background: var(--accent-ink); }
.run-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-soft), 0 2px 9px color-mix(in srgb, var(--accent) 38%, transparent); }
.run-btn:disabled, .run-btn.running { opacity: 0.6; cursor: not-allowed; }

/* ── Output — first-class card; fills the remaining height, scrolls inside. ── */
.output {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--card);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.out-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px var(--out-pad-x);
  border-bottom: 1px solid var(--border);
  flex: none;
}
.out-title { font-weight: 650; font-size: 13.5px; }

.run-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-faint);
  flex: none;
}
.run-dot.done { background: var(--success); }
.run-dot.error { background: var(--danger); }
.run-dot.running { background: var(--accent); animation: dot-pulse 1s ease-in-out infinite; }
@keyframes dot-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

.out-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: clamp(16px, 1.7vw, 20px) var(--out-pad-x);
}

/* Rendered model output (Markdown + KaTeX). Reading face; fills the pane width. */
.answer {
  font-family: var(--font-read);
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-primary);
}

/* Empty / loading states (not in the static mock). */
.out-state {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 100%;
  min-height: 120px;
  color: var(--text-muted);
  font-size: 13px;
}
.out-state.empty {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 4px;
}
.empty-title { font-size: 14px; font-weight: 600; color: var(--text-secondary); }
.empty-sub { color: var(--text-muted); }

.spinner {
  width: 15px;
  height: 15px;
  border: 2px solid var(--bg-selected);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex: none;
}
@keyframes spin { to { transform: rotate(360deg); } }

.run-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  background: var(--danger-soft);
  border: 1px solid color-mix(in srgb, var(--danger) 30%, #fff);
  border-radius: var(--r-ctl);
  color: var(--danger-ink);
  font-size: 13px;
  line-height: 1.5;
}
.error-icon { flex-shrink: 0; }

.out-foot {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px var(--out-pad-x);
  border-top: 1px solid var(--border);
  flex: none;
}
.meta { margin-left: auto; display: flex; gap: 8px; }
.pill {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--bg-sunken);
  padding: 3px 8px;
  border-radius: 6px;
  color: var(--text-muted);
}
</style>
