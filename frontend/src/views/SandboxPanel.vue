<script setup lang="ts">
// Right panel of the Overview module. Sends the configured prompt to the LLM and
// displays the response. Organized as two boxes — Variables (the scenario, driven
// by a saved test) and Parameters (the sampling config) — each with its own
// corner selector. The system prompt is part of the version and is edited in the
// left panel. All run output state is local; it doesn't survive prompt switches.
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

// ── Run ────────────────────────────────────────────────────────────────────────
const running  = ref(false);
const runError = ref<string | null>(null);

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
  <div class="sandbox-panel">
    <!-- ── Variables box ─────────────────────────────── -->
    <section class="panel-box">
      <header class="box-header">
        <h3 class="box-title">Variables</h3>
        <TestCaseControls />
      </header>
      <div class="box-body">
        <VariablesPanel v-if="detectedVars.length" :detected-vars="detectedVars" hide-label />
        <p v-else class="box-empty">This prompt has no <code>{{ variablesToken }}</code> yet.</p>
      </div>
    </section>

    <!-- ── Parameters box ────────────────────────────── -->
    <section class="panel-box">
      <header class="box-header">
        <h3 class="box-title">Parameters</h3>
        <ConfigControls />
      </header>
      <div class="box-body">
        <ParameterControls />
      </div>
    </section>

    <!-- ── Run ───────────────────────────────────────── -->
    <div class="run-row">
      <button class="run-btn" :class="{ running }" :disabled="running" @click="runLLM">
        {{ running ? 'Running…' : 'Run' }}
      </button>
    </div>

    <!-- ── Output ─────────────────────────────────────── -->
    <div class="output-section">
      <!-- Error -->
      <div v-if="runError" class="run-error">
        <span class="error-icon">⚠</span>{{ runError }}
      </div>

      <!-- Empty state -->
      <div v-else-if="!sandboxOutput" class="output-empty">
        Run the prompt to see output here.
      </div>

      <!-- Result -->
      <template v-else>
        <div v-if="sandboxOutput.text" class="output-text markdown-body" v-html="renderedOutput" />
        <p v-else class="output-empty">(model returned an empty response)</p>
        <div class="output-meta">
          <ResultActions
            :evaluation="sandboxOutput.evaluation"
            :saved-id="sandboxOutput.savedEvaluationId"
            :copy-text="sandboxOutput.text"
            @saved="markSaved"
          />
          <div class="meta-stats">
            <span v-if="sandboxOutput.tokens_used != null" class="meta-chip">
              {{ sandboxOutput.tokens_used }} tokens
            </span>
            <span class="meta-chip">{{ sandboxOutput.latency_ms }} ms</span>
          </div>
        </div>
      </template>
    </div>

  </div>
</template>

<style scoped>
.sandbox-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  height: 100%;
  background: var(--bg);
  padding: 24px 28px;
}

/* ── Boxes ── */
.panel-box {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}

.box-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  border-radius: 7px 7px 0 0;
  background: var(--bg-sunken);
}

.box-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0;
}

.box-header :deep(.compact-control) {
  --compact-picker-width: clamp(280px, 34vw, 420px);
  --compact-picker-max-width: 100%;
}

.box-body { padding: 16px; }

.box-empty { color: var(--text-faint); font-size: 12.5px; margin: 0; }
.box-empty code { font-family: var(--font-mono); font-size: 11.5px; background: var(--bg-selected); padding: 1px 5px; border-radius: 3px; }

/* Run */
.run-row { display: flex; justify-content: flex-end; }
.run-btn {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 7px 28px;
  background: #1a1a1a;
  border: none;
  border-radius: 5px;
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, opacity 0.12s;
}
.run-btn:hover:not(:disabled) { background: #333; }
.run-btn:disabled, .run-btn.running { opacity: 0.5; cursor: not-allowed; }

/* ── Output ── */
.output-section {
  flex: 1;
  min-height: 120px;
  padding: 4px 2px;
}

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
.error-icon { flex-shrink: 0; }

.output-empty {
  display: flex;
  align-items: center;
  min-height: 96px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
  padding: 6px 0;
}

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
  padding: 4px 8px;
  background: var(--bg-selected);
  border-radius: 5px;
  font-size: 10.5px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* Container only; element styling comes from the global .markdown-body class. */
.output-text {
  font-size: 13.5px;
}
</style>
