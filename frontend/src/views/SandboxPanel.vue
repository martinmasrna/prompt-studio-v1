<script setup lang="ts">
// Right panel of the Overview module. Sends the configured prompt to the LLM
// and displays the response. All LLM config state is local — it doesn't need
// to survive prompt switches.
import { ref, computed } from 'vue';
import { renderContent } from '../utils/renderContent';
import { api } from '../api';
import { activeVersionId, activeVersionText, variableValues, sandboxOutput, addSandboxEntry } from '../store/editor';
import { activeModelId } from '../store/settings';
import {
  systemPrompt, temperature, topP, topK, maxTokens, enableThinking,
  selectedTestCase, selectedTestCaseId, isTestDirty, testSaving, saveNewTest, saveSelectedTest,
  deleteSelectedTest,
} from '../store/testCases';
import TestCaseControls from '../components/TestCaseControls.vue';
import ResultActions from '../components/ResultActions.vue';
import VariablesPanel from '../components/VariablesPanel.vue';
import { extractVariables, missingVariables, substituteVariables } from '../utils/variables';
import { captureEvaluationContext, completeEvaluation } from '../utils/evaluations';

// ── Config state ───────────────────────────────────────────────────────────────
const advancedOpen       = ref(false);

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
      system_prompt: systemPrompt.value || undefined,
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

const hasSelectedTest = computed(() => selectedTestCaseId.value !== null);
const canSaveTest = computed(() => hasSelectedTest.value && isTestDirty.value && !testSaving.value);
const canDeleteTest = computed(() => hasSelectedTest.value && !testSaving.value);

async function saveTest() {
  try {
    await saveSelectedTest();
  } catch {
    // The shared error message is rendered by TestCaseControls.
  }
}

async function saveTestAsNew() {
  const name = prompt('Name this test');
  if (!name?.trim()) return;
  try {
    await saveNewTest(name);
  } catch {
    // The shared error message is rendered by TestCaseControls.
  }
}

async function deleteTest() {
  const selected = selectedTestCase.value;
  if (!selected || !confirm(`Delete saved test "${selected.name}"?`)) return;
  try {
    await deleteSelectedTest();
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Could not delete test');
  }
}

</script>

<template>
  <div class="sandbox-panel">
    <!-- ── Configuration ─────────────────────────────── -->
    <div class="config-section">
      <TestCaseControls :show-actions="false" variant="header" />

      <!-- Variables (shared state with LeftPanel) -->
      <VariablesPanel :detected-vars="detectedVars" />

      <!-- Advanced settings: system prompt, sampling params, thinking mode -->
      <div class="field-block">
        <button class="collapsible-label" @click="advancedOpen = !advancedOpen">
          <span class="field-label">Advanced settings</span>
          <span class="collapse-chevron" :class="{ open: advancedOpen }">▶</span>
        </button>

        <div v-if="advancedOpen" class="advanced-body">
          <div class="field-block">
            <label class="field-label">System prompt</label>
            <textarea
              v-model="systemPrompt"
              class="config-textarea"
              placeholder="Optional system instruction…"
              rows="3"
              spellcheck="false"
            />
          </div>

          <!-- Sliders & inputs -->
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
      </div>

      <div class="config-actions">
        <div class="test-action-group" aria-label="Test actions">
          <button
            class="test-icon-btn"
            :disabled="!canSaveTest"
            title="Save test"
            aria-label="Save test"
            @click="saveTest"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <path d="M17 21v-8H7v8" />
              <path d="M7 3v5h8" />
            </svg>
          </button>

          <button
            class="test-icon-btn"
            :disabled="testSaving"
            title="Save as new test"
            aria-label="Save as new test"
            @click="saveTestAsNew"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6" />
              <path d="M9 15h6" />
            </svg>
          </button>

          <button
            class="test-icon-btn danger"
            :disabled="!canDeleteTest"
            title="Delete test"
            aria-label="Delete test"
            @click="deleteTest"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>

      <button class="run-btn" :class="{ running }" :disabled="running" @click="runLLM">
        {{ running ? 'Running…' : 'Run' }}
      </button>
      </div>
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
          <div class="meta-stats">
            <span v-if="sandboxOutput.tokens_used != null" class="meta-chip">
              {{ sandboxOutput.tokens_used }} tokens
            </span>
            <span class="meta-chip">{{ sandboxOutput.latency_ms }} ms</span>
          </div>
          <ResultActions
            :evaluation="sandboxOutput.evaluation"
            :saved-id="sandboxOutput.savedEvaluationId"
            :copy-text="sandboxOutput.text"
            @saved="markSaved"
          />
        </div>
      </template>
    </div>

  </div>
</template>

<style scoped>
.sandbox-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  height: 100%;
  background: var(--bg);
}

/* ── Config ── */
.config-section {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 28px 28px 20px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.field-block { display: flex; flex-direction: column; gap: 7px; }

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

.config-textarea {
  width: 100%;
  background: var(--bg);
  border: 1px solid #ececec;
  border-radius: 6px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  min-height: 76px;
  max-height: 220px;
  padding: 10px 12px;
  resize: vertical;
  overflow: auto;
  transition: border-color 0.12s, box-shadow 0.12s, background 0.12s;
}
.config-textarea:hover { border-color: #dddddd; }
.config-textarea:focus {
  outline: none;
  border-color: #b8b8b8;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.035);
}

/* Chevron sits directly beside the label so the disclosure target reads as
   one unit, instead of floating at the far edge. */
.collapsible-label {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.collapse-chevron {
  font-size: 8px;
  color: var(--text-muted);
  transition: transform 0.15s;
  display: inline-block;
}
.collapse-chevron.open { transform: rotate(90deg); }

/* Contents of the Advanced settings disclosure — indented under its header so
   the grouping reads as containment. */
.advanced-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 12px;
  padding-left: 12px;
  border-left: 1px solid var(--border);
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

/* Thinking toggle — label and switch grouped together rather than spread to
   opposite edges, so the label↔control relationship stays legible. */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  align-self: flex-start;
  cursor: pointer;
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

.config-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 2px;
  padding-top: 14px;
}

.test-action-group {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.test-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.12s, background 0.12s, opacity 0.12s;
}
.test-icon-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.test-icon-btn.danger:hover:not(:disabled) {
  color: #b33;
  background: #fff5f5;
}
.test-icon-btn:disabled {
  opacity: 0.42;
  cursor: default;
}

/* Run button */
.run-btn {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 7px 24px;
  background: #1a1a1a;
  border: none;
  border-radius: 5px;
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0;
  transition: background 0.12s, opacity 0.12s;
}
.run-btn:hover:not(:disabled) { background: #333; }
.run-btn:disabled, .run-btn.running { opacity: 0.5; cursor: not-allowed; }

/* ── Output ── */
.output-section {
  flex: 1;
  padding: 22px 28px;
  background: var(--bg);
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
  padding: 2px 8px;
  background: var(--bg-selected);
  border-radius: 3px;
  font-size: 11px;
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
