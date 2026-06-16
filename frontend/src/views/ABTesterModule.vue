<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { marked } from 'marked';
import { api } from '../api';
import type { SandboxRunResult } from '../api';
import {
  activePromptData, activeBranchId, activeVersionId, branchTree,
} from '../store/editor';
import { extractVariables, substituteVariables } from '../utils/variables';

// ── Run state ──────────────────────────────────────────────────────────────────
const outputA  = ref<SandboxRunResult | null>(null);
const outputB  = ref<SandboxRunResult | null>(null);
const runningA = ref(false);
const runningB = ref(false);
const errorA   = ref<string | null>(null);
const errorB   = ref<string | null>(null);

// ── Version selectors ──────────────────────────────────────────────────────────
const aBranchId  = ref<number | null>(null);
const aVersionId = ref<number | null>(null);
const bBranchId  = ref<number | null>(null);
const bVersionId = ref<number | null>(null);

// Reset selections and outputs whenever the active prompt changes
watch(() => activePromptData.value?.id, () => {
  aBranchId.value  = activeBranchId.value;
  aVersionId.value = activeVersionId.value;
  bBranchId.value  = activeBranchId.value;
  bVersionId.value = activeVersionId.value;
  outputA.value = null;
  outputB.value = null;
  errorA.value  = null;
  errorB.value  = null;
}, { immediate: true });

// When the user picks a different branch for a side, auto-select that branch's current version
watch(aBranchId, (id) => {
  const branch = branchTree.value.find(b => b.id === id);
  aVersionId.value =
    branch?.versions.find(v => v.is_current === 1)?.id ??
    branch?.versions[0]?.id ?? null;
});
watch(bBranchId, (id) => {
  const branch = branchTree.value.find(b => b.id === id);
  bVersionId.value =
    branch?.versions.find(v => v.is_current === 1)?.id ??
    branch?.versions[0]?.id ?? null;
});

const aText = computed(() => {
  const branch = branchTree.value.find(b => b.id === aBranchId.value);
  return branch?.versions.find(v => v.id === aVersionId.value)?.text ?? '';
});
const bText = computed(() => {
  const branch = branchTree.value.find(b => b.id === bBranchId.value);
  return branch?.versions.find(v => v.id === bVersionId.value)?.text ?? '';
});

function versionsFor(branchId: number | null) {
  return branchTree.value.find(b => b.id === branchId)?.versions ?? [];
}

// ── Variables (union of both sides) ───────────────────────────────────────────
const varValues    = ref<Record<string, string>>({});
const detectedVars = computed(() => {
  const s = new Set([...extractVariables(aText.value), ...extractVariables(bText.value)]);
  return [...s];
});
watch(detectedVars, vars => {
  const next: Record<string, string> = {};
  for (const v of vars) next[v] = varValues.value[v] ?? '';
  varValues.value = next;
}, { immediate: true });

// ── Shared config ──────────────────────────────────────────────────────────────
const systemPrompt   = ref('');
const advancedOpen   = ref(false);
const temperature    = ref(0.7);
const topP             = ref(1.0);
const topK             = ref(40);
const maxTokens        = ref(1024);
const enableThinking   = ref(false);

const promptModal = ref<'a' | 'b' | null>(null);
const modalText = computed(() =>
  promptModal.value === 'a'
    ? substituteVariables(aText.value, varValues.value)
    : substituteVariables(bText.value, varValues.value)
);

const isRunning = computed(() => runningA.value || runningB.value);

async function runBoth() {
  if (isRunning.value) return;
  outputA.value = null;
  outputB.value = null;
  errorA.value  = null;
  errorB.value  = null;
  runningA.value = true;
  runningB.value = true;

  const shared = {
    system_prompt:   systemPrompt.value || undefined,
    temperature:     temperature.value,
    top_p:           topP.value,
    top_k:           topK.value,
    max_tokens:      maxTokens.value,
    enable_thinking: enableThinking.value,
  };

  await Promise.all([
    api.llm.run({ ...shared, user_message: substituteVariables(aText.value, varValues.value) })
      .then(r  => { outputA.value = r; })
      .catch(e => { errorA.value  = e instanceof Error ? e.message : 'Unknown error'; })
      .finally(() => { runningA.value = false; }),

    api.llm.run({ ...shared, user_message: substituteVariables(bText.value, varValues.value) })
      .then(r  => { outputB.value = r; })
      .catch(e => { errorB.value  = e instanceof Error ? e.message : 'Unknown error'; })
      .finally(() => { runningB.value = false; }),
  ]);
}

// ── Markdown ───────────────────────────────────────────────────────────────────
const renderedA = computed(() =>
  outputA.value?.text ? marked.parse(outputA.value.text) as string : ''
);
const renderedB = computed(() =>
  outputB.value?.text ? marked.parse(outputB.value.text) as string : ''
);

function copy(output: SandboxRunResult | null) {
  if (output?.text) navigator.clipboard.writeText(output.text);
}
</script>

<template>
  <div class="ab-tester">

    <!-- ── Config bar ─────────────────────────────────────── -->
    <div class="config-bar">

      <!-- Variables (appear when either version uses {{placeholders}}) -->
      <div v-if="detectedVars.length" class="field-block">
        <label class="field-label">Variables</label>
        <div class="var-grid">
          <template v-for="v in detectedVars" :key="v">
            <span class="var-name">{{ v }}</span>
            <input v-model="varValues[v]" class="var-input" :placeholder="`{{${v}}}`" />
          </template>
        </div>
      </div>

      <!-- Advanced settings (collapsible, hidden by default) -->
      <div class="field-block">
        <button class="collapsible-label" @click="advancedOpen = !advancedOpen">
          <span class="field-label">Advanced</span>
          <span class="chevron" :class="{ open: advancedOpen }">▶</span>
        </button>
        <template v-if="advancedOpen">
          <!-- System prompt -->
          <textarea
            v-model="systemPrompt"
            class="config-textarea"
            placeholder="System prompt (optional)…"
            rows="3"
            spellcheck="false"
          />
          <!-- Params -->
          <div class="params-row">
            <div class="param">
              <label class="field-label">Temperature <span class="param-val">{{ temperature.toFixed(1) }}</span></label>
              <input v-model.number="temperature" type="range" min="0" max="2" step="0.1" class="slider" />
            </div>
            <div class="param">
              <label class="field-label">Top-P <span class="param-val">{{ topP.toFixed(2) }}</span></label>
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
            <label class="thinking-toggle">
              <span class="field-label">Thinking</span>
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
        </template>
      </div>

      <!-- Run button -->
      <div class="run-row">
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
          <select v-model="aBranchId" class="sel-branch">
            <option v-for="b in branchTree" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
          <select v-model="aVersionId" class="sel-version">
            <option v-for="v in versionsFor(aBranchId)" :key="v.id" :value="v.id">
              v{{ v.major }}.{{ v.minor }}{{ v.is_current ? ' ★' : '' }}
            </option>
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
              <span v-if="outputA.tokens_used != null" class="meta-chip">{{ outputA.tokens_used }} tokens</span>
              <span class="meta-chip">{{ outputA.latency_ms }} ms</span>
              <button class="btn-sm" style="margin-left: auto" @click="copy(outputA)">Copy</button>
            </div>
          </template>
        </div>
      </div>

      <div class="col-divider" />

      <!-- Side B -->
      <div class="side">
        <div class="side-header">
          <span class="side-badge">B</span>
          <select v-model="bBranchId" class="sel-branch">
            <option v-for="b in branchTree" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
          <select v-model="bVersionId" class="sel-version">
            <option v-for="v in versionsFor(bBranchId)" :key="v.id" :value="v.id">
              v{{ v.major }}.{{ v.minor }}{{ v.is_current ? ' ★' : '' }}
            </option>
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
              <span v-if="outputB.tokens_used != null" class="meta-chip">{{ outputB.tokens_used }} tokens</span>
              <span class="meta-chip">{{ outputB.latency_ms }} ms</span>
              <button class="btn-sm" style="margin-left: auto" @click="copy(outputB)">Copy</button>
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
.chevron { font-size: 8px; color: var(--text-faint); transition: transform 0.15s; display: inline-block; }
.chevron.open { transform: rotate(90deg); }

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

.params-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }

.param { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 100px; }
.param-val { font-weight: 400; color: var(--text-secondary); font-size: 10px; text-transform: none; letter-spacing: 0; }
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

.thinking-toggle {
  display: flex;
  flex-direction: column;
  gap: 5px;
  cursor: pointer;
  flex-shrink: 0;
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

.run-row { display: flex; justify-content: flex-end; }

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

.sel-branch, .sel-version {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  padding: 4px 8px;
  cursor: pointer;
}
.sel-branch:focus, .sel-version:focus { outline: none; border-color: #aaa; }

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
