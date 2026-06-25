<script setup lang="ts">
// Right panel of the Overview module. Sends the configured prompt to the LLM and
// displays the response. Organized as two boxes — Variables (the scenario, driven
// by a saved test) and Parameters (the sampling config) — each with its own
// corner selector. The system prompt is part of the version and is edited in the
// left panel. All run output state is local; it doesn't survive prompt switches.
import { ref, computed } from 'vue';
import { renderContent } from '../utils/renderContent';
import { api } from '../api';
import { activeVersionId, activeVersionText, activeSystemPrompt, variableValues, sandboxOutput, addSandboxEntry } from '../store/editor';
import { activeModelId } from '../store/settings';
import { temperature, topP, topK, maxTokens, enableThinking } from '../store/configs';
import TestCaseControls from '../components/TestCaseControls.vue';
import ConfigControls from '../components/ConfigControls.vue';
import VariablesPanel from '../components/VariablesPanel.vue';
import ResultActions from '../components/ResultActions.vue';
import { extractVariables, missingVariables, substituteVariables } from '../utils/variables';
import { captureEvaluationContext, completeEvaluation } from '../utils/evaluations';

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

  try {
    const result = await api.llm.run({
      system_prompt: activeSystemPrompt.value || undefined,
      user_message:  userMessage.value,
      model_id:      activeModelId.value ?? undefined,
      temperature:   temperature.value,
      top_p:         topP.value,
      top_k:         topK.value,
      max_tokens:    maxTokens.value,
      enable_thinking: enableThinking.value,
    } as Parameters<typeof api.llm.run>[0]);

    addSandboxEntry({
      timestamp:   Date.now(),
      userMessage: userMessage.value.slice(0, 80),
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
        <TestCaseControls compact />
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
        <ConfigControls compact />
      </header>
      <div class="box-body">
        <div class="param-grid">
          <div class="param">
            <label class="field-label">Temperature <span class="param-value">{{ temperature.toFixed(1) }}</span></label>
            <input v-model.number="temperature" aria-label="Temperature" type="range" min="0" max="2" step="0.1" class="slider" />
          </div>
          <div class="param">
            <label class="field-label">Top-P <span class="param-value">{{ topP.toFixed(2) }}</span></label>
            <input v-model.number="topP" type="range" min="0" max="1" step="0.01" class="slider" />
          </div>
          <div class="param">
            <label class="field-label">Top-K</label>
            <input v-model.number="topK" type="number" min="1" max="200" class="num-input" />
          </div>
          <div class="param">
            <label class="field-label">Max tokens</label>
            <input v-model.number="maxTokens" type="number" min="64" max="32768" class="num-input" />
          </div>
        </div>

        <label class="toggle-row">
          <span class="toggle-label">Thinking mode</span>
          <button
            class="toggle-switch"
            :class="{ on: enableThinking }"
            role="switch"
            :aria-checked="enableThinking"
            @click="enableThinking = !enableThinking"
          >
            <span class="toggle-thumb" />
          </button>
        </label>
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

.box-body { padding: 16px; }

.box-empty { color: var(--text-faint); font-size: 12.5px; margin: 0; }
.box-empty code { font-family: var(--font-mono); font-size: 11.5px; background: var(--bg-selected); padding: 1px 5px; border-radius: 3px; }

.field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* Params */
.param-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
.param { display: flex; flex-direction: column; gap: 6px; }

.param-value { font-weight: 400; color: var(--text-secondary); font-size: 10px; text-transform: none; letter-spacing: 0; }

.slider { width: 100%; accent-color: #888; cursor: pointer; }

.num-input {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  min-height: 34px;
  padding: 6px 9px;
  width: 100%;
}
.num-input:focus { outline: none; border-color: #aaa; }

/* Thinking toggle */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  align-self: flex-start;
  cursor: pointer;
  margin-top: 16px;
}

.toggle-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.toggle-switch {
  position: relative;
  width: 32px;
  height: 18px;
  background: var(--border);
  border: none;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.18s;
  flex-shrink: 0;
  padding: 0;
}
.toggle-switch.on { background: #1a1a1a; }

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.18s;
  display: block;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.toggle-switch.on .toggle-thumb { transform: translateX(14px); }

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

.output-text {
  font-family: var(--font-sans);
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text-primary);
  word-break: break-word;
}

/* Markdown element styles */
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
</style>
