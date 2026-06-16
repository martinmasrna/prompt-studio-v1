<script setup lang="ts">
// Right panel of the Overview module. Sends the configured prompt to the LLM
// and displays the response. All LLM config state is local — it doesn't need
// to survive prompt switches.
import { ref, computed } from 'vue';
import { marked } from 'marked';
import { api } from '../api';
import { activeVersionText, variableValues, sandboxOutput, addSandboxEntry } from '../store/editor';
import { activeModelId } from '../store/settings';
import { extractVariables, substituteVariables } from '../utils/variables';

// ── Config state ───────────────────────────────────────────────────────────────
const systemPrompt       = ref('');
const systemPromptOpen   = ref(false);
const enableThinking     = ref(false);
const temperature  = ref(0.7);
const topP         = ref(1.0);
const topK         = ref(40);
const maxTokens    = ref(1024);

// The user message sent to the LLM is always the active prompt text with variables substituted.
const userMessage = computed(() => substituteVariables(activeVersionText.value, variableValues.value));

// ── Variables panel (mirrors LeftPanel; shares variableValues from store) ──────
const detectedVars = computed(() => extractVariables(activeVersionText.value));

// ── Run ────────────────────────────────────────────────────────────────────────
const running  = ref(false);
const runError = ref<string | null>(null);

async function runLLM() {
  if (running.value) return;
  running.value = true;
  runError.value = null;

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
    });
  } catch (e: unknown) {
    runError.value = e instanceof Error ? e.message : 'Unknown error';
  } finally {
    running.value = false;
  }
}

// ── Copy helpers ───────────────────────────────────────────────────────────────
function copyOutput() {
  if (sandboxOutput.value) navigator.clipboard.writeText(sandboxOutput.value.text);
}

const renderedOutput = computed(() =>
  sandboxOutput.value?.text ? marked.parse(sandboxOutput.value.text) as string : ''
);

</script>

<template>
  <div class="sandbox-panel">
    <!-- ── Configuration ─────────────────────────────── -->
    <div class="config-section">
      <div class="field-block">
        <button class="collapsible-label" @click="systemPromptOpen = !systemPromptOpen">
          <span class="field-label">System prompt</span>
          <span class="collapse-chevron" :class="{ open: systemPromptOpen }">▶</span>
        </button>
        <textarea
          v-if="systemPromptOpen"
          v-model="systemPrompt"
          class="config-textarea"
          placeholder="Optional system instruction…"
          rows="3"
          spellcheck="false"
        />
      </div>

      <!-- Variables (shared state with LeftPanel) -->
      <div v-if="detectedVars.length > 0" class="field-block">
        <label class="field-label">Variables</label>
        <div class="var-grid">
          <template v-for="varName in detectedVars" :key="varName">
            <span class="var-name">{{ varName }}</span>
            <input v-model="variableValues[varName]" class="var-input" :placeholder="`{{${varName}}}`" />
          </template>
        </div>
      </div>

      <!-- Sliders & inputs -->
      <div class="param-grid">
        <div class="param">
          <label class="field-label">Temperature <span class="param-value">{{ temperature.toFixed(1) }}</span></label>
          <input v-model.number="temperature" type="range" min="0" max="2" step="0.1" class="slider" />
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
          <span v-if="sandboxOutput.tokens_used != null" class="meta-chip">
            {{ sandboxOutput.tokens_used }} tokens
          </span>
          <span class="meta-chip">{{ sandboxOutput.latency_ms }} ms</span>
          <div class="output-actions">
            <button class="btn-sm" @click="copyOutput">Copy output</button>
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
  gap: 0;
  overflow-y: auto;
  height: 100%;
  background: var(--bg-sunken);
}

/* ── Config ── */
.config-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 24px 20px;
  border-bottom: 1px solid var(--border);
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

.config-textarea {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  padding: 10px 12px;
  resize: vertical;
}
.config-textarea:focus { outline: none; border-color: #aaa; }

.collapsible-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.collapse-chevron {
  font-size: 8px;
  color: var(--text-faint);
  transition: transform 0.15s;
  display: inline-block;
}
.collapse-chevron.open { transform: rotate(90deg); }

/* Variables */
.var-grid { display: grid; grid-template-columns: 100px 1fr; gap: 6px 10px; align-items: center; }
.var-name { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); }
.var-input {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  padding: 4px 8px;
}
.var-input:focus { outline: none; border-color: #aaa; }

/* Params */
.param-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
.param { display: flex; flex-direction: column; gap: 6px; }

.param-value { font-weight: 400; color: var(--text-secondary); font-size: 10px; text-transform: none; letter-spacing: 0; }

.slider { width: 100%; accent-color: #888; cursor: pointer; }

.num-input {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  padding: 5px 8px;
  width: 100%;
}
.num-input:focus { outline: none; border-color: #aaa; }

/* Thinking toggle */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.toggle-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-faint);
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

/* Run button */
.run-btn {
  align-self: flex-end;
  padding: 7px 24px;
  background: #1a1a1a;
  border: none;
  border-radius: 5px;
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: background 0.12s, opacity 0.12s;
}
.run-btn:hover:not(:disabled) { background: #333; }
.run-btn:disabled, .run-btn.running { opacity: 0.5; cursor: not-allowed; }

/* ── Output ── */
.output-section { padding: 20px 24px; flex: 1; }

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

.output-empty { color: var(--text-faint); font-size: 13px; padding: 8px 0; }

.output-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.meta-chip {
  padding: 2px 8px;
  background: var(--bg-selected);
  border-radius: 3px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.output-actions { margin-left: auto; }
.btn-sm {
  padding: 3px 10px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text-muted);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
}
.btn-sm:hover { color: var(--text-primary); border-color: #aaa; }

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
