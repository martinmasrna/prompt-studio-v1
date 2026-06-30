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
import ConfigControls from '../components/ConfigControls.vue';
import ParameterControls from '../components/ParameterControls.vue';
import PromptEditor from '../components/PromptEditor.vue';
import ResultActions from '../components/ResultActions.vue';
import VariablesPanel from '../components/VariablesPanel.vue';
import { extractVariables, missingVariables, substituteVariables, tokenizePrompt } from '../utils/variables';
import { buildRunRequest, captureEvaluationContext, completeEvaluation, type RunSettings } from '../utils/evaluations';

// ── Vary axis ────────────────────────────────────────────────────────────────
type VaryAxis = 'version' | 'config';
const varyAxis = ref<VaryAxis>('version');
const sharedVersionOpen = ref(false);
const sharedVersionMenuOpen = ref(false);
const savingSharedVersion = ref(false);
const sharedVersionDraftText = ref('');
const sharedVersionSavedText = ref('');

// Rail collapsible panels
const varsRailOpen = ref(true);

// The per-side "inputs" band shows the content of the varied axis (each side's
// raw prompt template when varying version, each side's params when varying
// config). Each side collapses independently. Open by default so you can see what
// differs; auto-collapses when a run starts so the outputs take the stage.
const inputsOpenA = ref(true);
const inputsOpenB = ref(true);

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
const aVersionId = ref<number | null>(null);
const bVersionId = ref<number | null>(null);
const sharedVersionId = ref<number | null>(null);
const aConfigId = ref<number | null>(null);
const bConfigId = ref<number | null>(null);

function resetRun() {
  outputA.value = null; outputB.value = null;
  errorA.value = null; errorB.value = null;
  evaluationA.value = null; evaluationB.value = null;
  savedA.value = null; savedB.value = null;
  savedComparison.value = null; comparisonError.value = null;
}

watch(() => activePromptData.value?.id, () => {
  aVersionId.value = activeVersionId.value;
  bVersionId.value = activeVersionId.value;
  sharedVersionId.value = activeVersionId.value;
  aConfigId.value = selectedConfigId.value;
  bConfigId.value = selectedConfigId.value;
  inputsOpenA.value = true;
  inputsOpenB.value = true;
  resetRun();
}, { immediate: true });

// ── Resolve each side's effective version and config ───────────────────────────
const versionAId = computed(() => varyAxis.value === 'version' ? aVersionId.value : sharedVersionId.value);
const versionBId = computed(() => varyAxis.value === 'version' ? bVersionId.value : sharedVersionId.value);

const savedTextFor = (versionId: number | null) => versions.value.find(v => v.id === versionId)?.text ?? '';
const textFor = (versionId: number | null) =>
  varyAxis.value === 'config' && versionId === sharedVersionId.value
    ? sharedVersionDraftText.value
    : savedTextFor(versionId);
const systemPromptFor = (versionId: number | null) => versions.value.find(v => v.id === versionId)?.system_prompt ?? '';
const sharedVersion = computed(() =>
  versions.value.find(v => v.id === sharedVersionId.value) ?? versions.value[0] ?? null
);
const sharedVersionLabel = computed(() =>
  sharedVersion.value ? `${sharedVersion.value.name}${sharedVersion.value.is_current ? ' ★' : ''}` : 'No version'
);
const isSharedVersionDirty = computed(() => sharedVersionDraftText.value !== sharedVersionSavedText.value);

watch(sharedVersion, version => {
  sharedVersionDraftText.value = version?.text ?? '';
  sharedVersionSavedText.value = version?.text ?? '';
}, { immediate: true });

function chooseSharedVersion(id: number): void {
  if (id !== sharedVersionId.value && isSharedVersionDirty.value && !confirm('Discard unsaved changes to the shared prompt version?')) {
    return;
  }
  sharedVersionId.value = id;
  sharedVersionOpen.value = false;
  sharedVersionMenuOpen.value = false;
}

async function saveSharedVersion(): Promise<void> {
  const version = sharedVersion.value;
  if (!version || !isSharedVersionDirty.value || savingSharedVersion.value) return;
  savingSharedVersion.value = true;
  try {
    await api.versions.update(version.id, { text: sharedVersionDraftText.value });
    version.text = sharedVersionDraftText.value;
    sharedVersionSavedText.value = sharedVersionDraftText.value;
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Could not save version');
  } finally {
    savingSharedVersion.value = false;
  }
}

async function renameSharedVersion(): Promise<void> {
  const version = sharedVersion.value;
  if (!version) return;
  sharedVersionMenuOpen.value = false;
  const name = prompt('Rename version', version.name);
  if (!name?.trim() || name.trim() === version.name) return;
  try {
    await api.versions.updateName(version.id, name.trim());
    version.name = name.trim();
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Could not rename version');
  }
}

async function editSharedVersionDescription(): Promise<void> {
  const version = sharedVersion.value;
  if (!version) return;
  sharedVersionMenuOpen.value = false;
  const note = prompt('Edit description', version.note ?? '');
  if (note === null) return;
  const next = note.trim() || null;
  if (next === version.note) return;
  try {
    await api.versions.updateNote(version.id, next);
    version.note = next;
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Could not update description');
  }
}

async function deleteSharedVersion(): Promise<void> {
  const version = sharedVersion.value;
  if (!version || versions.value.length <= 1) return;
  sharedVersionMenuOpen.value = false;
  if (!confirm(`Delete version "${version.name}"? This cannot be undone.`)) return;
  try {
    await api.versions.delete(version.id);
    versions.value = await api.prompts.versions(activePromptData.value!.id);
    const fallback = versions.value.find(v => v.is_current) ?? versions.value[0] ?? null;
    sharedVersionId.value = fallback?.id ?? null;
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Could not delete version');
  }
}

function settingsFor(versionId: number | null, configId: number | null): RunSettings {
  const c = configId === null ? null : configs.value.find(x => x.id === configId);
  const params = c
    ? { temperature: c.temperature, top_p: c.top_p, top_k: c.top_k, max_tokens: c.max_tokens, enable_thinking: c.enable_thinking }
    : { temperature: temperature.value, top_p: topP.value, top_k: topK.value, max_tokens: maxTokens.value, enable_thinking: enableThinking.value };
  return { system_prompt: systemPromptFor(versionId), ...params };
}

const liveParams = () => ({
  temperature: temperature.value, top_p: topP.value, top_k: topK.value,
  max_tokens: maxTokens.value, enable_thinking: enableThinking.value,
});

const aText = computed(() => textFor(versionAId.value));
const bText = computed(() => textFor(versionBId.value));

function paramsOf(configId: number | null) {
  const s = settingsFor(null, configId);
  return [
    { key: 'temperature',     label: 'temp',     value: String(s.temperature) },
    { key: 'top_p',           label: 'top_p',    value: String(s.top_p) },
    { key: 'top_k',           label: 'top_k',    value: String(s.top_k) },
    { key: 'max_tokens',      label: 'max',      value: String(s.max_tokens) },
    { key: 'enable_thinking', label: 'thinking', value: s.enable_thinking ? 'on' : 'off' },
  ];
}
const paramsA = computed(() => paramsOf(aConfigId.value));
const paramsB = computed(() => paramsOf(bConfigId.value));
const paramDiff = computed(() => {
  const set = new Set<string>();
  paramsA.value.forEach((p, i) => { if (p.value !== paramsB.value[i].value) set.add(p.key); });
  return set;
});

const segmentsA = computed(() => tokenizePrompt(aText.value, variableValues.value));
const segmentsB = computed(() => tokenizePrompt(bText.value, variableValues.value));

const heldVersionSystem = computed(() => systemPromptFor(sharedVersionId.value));
const rawVar = (name: string) => `{{${name}}}`;

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
  const settingsA = varyAxis.value === 'version'
    ? { system_prompt: systemPromptFor(versionAId.value), ...liveParams() }
    : settingsFor(versionAId.value, aConfigId.value);
  const settingsB = varyAxis.value === 'version'
    ? { system_prompt: systemPromptFor(versionBId.value), ...liveParams() }
    : settingsFor(versionBId.value, bConfigId.value);
  const contextA = captureEvaluationContext('ab', versionAId.value, aText.value, renderedPromptA, settingsA);
  const contextB = captureEvaluationContext('ab', versionBId.value, bText.value, renderedPromptB, settingsB);

  resetRun();
  inputsOpenA.value = false;
  inputsOpenB.value = false;
  runningA.value = true;
  runningB.value = true;

  await Promise.all([
    api.llm.run(buildRunRequest(renderedPromptA, settingsA, activeModelId.value))
      .then(r  => { outputA.value = r; evaluationA.value = completeEvaluation(contextA, r); })
      .catch(e => { errorA.value  = e instanceof Error ? e.message : 'Unknown error'; })
      .finally(() => { runningA.value = false; }),

    api.llm.run(buildRunRequest(renderedPromptB, settingsB, activeModelId.value))
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

    <!-- ── VERSION A ─────────────────────────────────────────── -->
    <section class="vcol">
      <div class="vhead">
        <span class="abadge">A</span>
        <span class="axis-lbl">{{ varyAxis === 'version' ? 'Version' : 'Config' }}</span>
        <select
          v-if="varyAxis === 'version'"
          v-model="aVersionId"
          class="vselect"
          aria-label="Version A"
        >
          <option v-for="v in versions" :key="v.id" :value="v.id">
            {{ v.name }}{{ v.is_current ? ' ★' : '' }}
          </option>
        </select>
        <select
          v-else
          v-model="aConfigId"
          class="vselect"
          aria-label="Config A"
        >
          <option :value="null">Scratch</option>
          <option v-for="c in configs" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <div class="prompt-wrap">
        <button
          class="prompt-head"
          :aria-expanded="inputsOpenA"
          @click="inputsOpenA = !inputsOpenA"
        >
          <span class="io-chev">{{ inputsOpenA ? '▾' : '▸' }}</span>
          <span class="section-lbl">{{ varyAxis === 'version' ? 'Prompt' : 'Params' }}</span>
        </button>
        <template v-if="inputsOpenA">
          <div v-if="varyAxis === 'version'" class="io-prompt">
            <template v-for="(seg, i) in segmentsA" :key="i">
              <span v-if="seg.type === 'var'" class="io-var">{{ rawVar(seg.name) }}</span>
              <template v-else>{{ seg.value }}</template>
            </template>
          </div>
          <div v-else class="io-params">
            <span
              v-for="p in paramsA"
              :key="p.key"
              class="param"
              :class="{ diff: paramDiff.has(p.key) }"
            >{{ p.label }} <b>{{ p.value }}</b></span>
          </div>
        </template>
      </div>

      <div class="out-head">
        <span
          class="out-dot"
          :class="{ active: !!outputA && !errorA, error: !!errorA, pulsing: runningA }"
        ></span>
        <span class="out-ttl">Output</span>
      </div>

      <div class="answer">
        <div v-if="runningA" class="output-loading">
          <span class="spinner" /> Running…
        </div>
        <div v-else-if="errorA" class="run-error">
          <span class="err-icon">⚠</span>{{ errorA }}
        </div>
        <div v-else-if="!outputA" class="output-empty">Run to see output.</div>
        <div v-else-if="outputA.text" class="output-text markdown-body" v-html="renderedA" />
        <p v-else class="output-empty">(empty response)</p>
      </div>

      <div v-if="outputA" class="stat-bar">
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
    </section>

    <!-- ── VERSION B ─────────────────────────────────────────── -->
    <section class="vcol">
      <div class="vhead">
        <span class="abadge">B</span>
        <span class="axis-lbl">{{ varyAxis === 'version' ? 'Version' : 'Config' }}</span>
        <select
          v-if="varyAxis === 'version'"
          v-model="bVersionId"
          class="vselect"
          aria-label="Version B"
        >
          <option v-for="v in versions" :key="v.id" :value="v.id">
            {{ v.name }}{{ v.is_current ? ' ★' : '' }}
          </option>
        </select>
        <select
          v-else
          v-model="bConfigId"
          class="vselect"
          aria-label="Config B"
        >
          <option :value="null">Scratch</option>
          <option v-for="c in configs" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <div class="prompt-wrap">
        <button
          class="prompt-head"
          :aria-expanded="inputsOpenB"
          @click="inputsOpenB = !inputsOpenB"
        >
          <span class="io-chev">{{ inputsOpenB ? '▾' : '▸' }}</span>
          <span class="section-lbl">{{ varyAxis === 'version' ? 'Prompt' : 'Params' }}</span>
        </button>
        <template v-if="inputsOpenB">
          <div v-if="varyAxis === 'version'" class="io-prompt">
            <template v-for="(seg, i) in segmentsB" :key="i">
              <span v-if="seg.type === 'var'" class="io-var">{{ rawVar(seg.name) }}</span>
              <template v-else>{{ seg.value }}</template>
            </template>
          </div>
          <div v-else class="io-params">
            <span
              v-for="p in paramsB"
              :key="p.key"
              class="param"
              :class="{ diff: paramDiff.has(p.key) }"
            >{{ p.label }} <b>{{ p.value }}</b></span>
          </div>
        </template>
      </div>

      <div class="out-head">
        <span
          class="out-dot"
          :class="{ active: !!outputB && !errorB, error: !!errorB, pulsing: runningB }"
        ></span>
        <span class="out-ttl">Output</span>
      </div>

      <div class="answer">
        <div v-if="runningB" class="output-loading">
          <span class="spinner" /> Running…
        </div>
        <div v-else-if="errorB" class="run-error">
          <span class="err-icon">⚠</span>{{ errorB }}
        </div>
        <div v-else-if="!outputB" class="output-empty">Run to see output.</div>
        <div v-else-if="outputB.text" class="output-text markdown-body" v-html="renderedB" />
        <p v-else class="output-empty">(empty response)</p>
      </div>

      <div v-if="outputB" class="stat-bar">
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
    </section>

    <!-- ── SHARED CONFIG RAIL ─────────────────────────────────── -->
    <aside class="rail">
      <div class="rail-scroll">

      <!-- Shared Variables -->
      <div class="railcard">
        <div class="panel-head-row">
          <button
            class="panel-toggle"
            :aria-expanded="varsRailOpen"
            @click="varsRailOpen = !varsRailOpen"
          >
            <span class="io-chev">{{ varsRailOpen ? '▾' : '▸' }}</span>
            <span class="section-lbl">Shared variables</span>
          </button>
          <TestCaseControls />
        </div>
        <div v-if="varsRailOpen" class="panel-body">
          <VariablesPanel v-if="detectedVars.length" :detected-vars="detectedVars" hide-label />
          <p v-else class="panel-empty">Neither side uses variables yet.</p>
        </div>
      </div>

      <!-- What are we testing? + Shared Config -->
      <div class="railcard">
        <div class="seg-zone">
          <span class="section-lbl seg-question">What are we A/B testing?</span>
          <div class="seg" role="tablist" aria-label="A/B test axis">
            <button
              :class="{ active: varyAxis === 'version' }"
              role="tab"
              :aria-selected="varyAxis === 'version'"
              @click="varyAxis = 'version'"
            >Prompt version</button>
            <button
              :class="{ active: varyAxis === 'config' }"
              role="tab"
              :aria-selected="varyAxis === 'config'"
              @click="varyAxis = 'config'"
            >Config</button>
          </div>
        </div>

        <div class="panel-head no-click">
          <div class="panel-head-left">
            <span class="section-lbl">{{ varyAxis === 'version' ? 'Shared config' : 'Shared version' }}</span>
          </div>
          <ConfigControls v-if="varyAxis === 'version'" />
          <div v-else class="entity-controls compact-control version-compact-control">
            <div class="entity-picker-wrap entity-picker-combo" :class="{ open: sharedVersionOpen || sharedVersionMenuOpen }">
              <button
                class="entity-picker compact-picker"
                type="button"
                aria-haspopup="menu"
                :aria-expanded="sharedVersionOpen"
                @click="sharedVersionOpen = !sharedVersionOpen; sharedVersionMenuOpen = false"
              >
                <span class="entity-picker-label">{{ sharedVersionLabel }}</span>
              </button>
              <div class="entity-menu-wrap" @keydown.esc="sharedVersionMenuOpen = false">
                <button
                  class="entity-kebab"
                  type="button"
                  aria-label="Version actions"
                  aria-haspopup="menu"
                  :aria-expanded="sharedVersionMenuOpen"
                  :disabled="!sharedVersion"
                  @click="sharedVersionMenuOpen = !sharedVersionMenuOpen; sharedVersionOpen = false"
                >
                  <span>&#8943;</span>
                </button>
                <template v-if="sharedVersionMenuOpen">
                  <div class="entity-backdrop" @click="sharedVersionMenuOpen = false" />
                  <div class="entity-menu" role="menu">
                    <button role="menuitem" @click="renameSharedVersion">Rename</button>
                    <button role="menuitem" @click="editSharedVersionDescription">Edit description</button>
                    <button
                      role="menuitem"
                      class="danger"
                      :disabled="versions.length <= 1"
                      :title="versions.length <= 1 ? 'A prompt must keep at least one version' : 'Delete version'"
                      @click="deleteSharedVersion"
                    >Delete</button>
                  </div>
                </template>
              </div>
              <button
                class="entity-picker-arrow"
                type="button"
                aria-label="Open version picker"
                :aria-expanded="sharedVersionOpen"
                @click="sharedVersionOpen = !sharedVersionOpen; sharedVersionMenuOpen = false"
              >
                <span class="entity-picker-chevron">{{ sharedVersionOpen ? '^' : 'v' }}</span>
              </button>
              <div v-if="sharedVersionOpen" class="entity-backdrop" @click="sharedVersionOpen = false" />
              <div v-if="sharedVersionOpen" class="entity-popover compact-popover" role="menu">
                <button
                  v-for="v in versions"
                  :key="v.id"
                  class="entity-row"
                  :class="{ current: sharedVersionId === v.id }"
                  role="menuitem"
                  @click="chooseSharedVersion(v.id)"
                >
                  <span class="entity-row-main">
                    <span class="entity-row-title">{{ v.name }}{{ v.is_current ? ' ★' : '' }}</span>
                    <span v-if="v.note" class="entity-row-note">{{ v.note }}</span>
                  </span>
                </button>
              </div>
            </div>
            <span v-if="isSharedVersionDirty" class="entity-dirty-dot" title="Unsaved changes" />
            <button
              v-if="isSharedVersionDirty || savingSharedVersion"
              class="entity-save"
              :disabled="savingSharedVersion || !isSharedVersionDirty"
              @click="saveSharedVersion"
            >
              {{ savingSharedVersion ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </div>

        <div class="panel-body">
          <template v-if="varyAxis === 'version'">
            <ParameterControls full-width-toggle />
          </template>
          <template v-else>
            <div v-if="heldVersionSystem" class="held-system">System: {{ heldVersionSystem }}</div>
            <div class="held-prompt-editor">
              <PromptEditor v-model="sharedVersionDraftText" @save="saveSharedVersion" />
            </div>
          </template>
        </div>
      </div>

      </div><!-- /rail-scroll -->

      <!-- Run actions -->
      <div class="rail-foot">
        <span v-if="comparisonError" class="comparison-error">{{ comparisonError }}</span>
        <button
          v-if="evaluationA && evaluationB"
          class="save-comparison-btn"
          :disabled="savedComparison !== null"
          @click="saveComparison"
        >{{ savedComparison ? 'Comparison saved' : 'Save comparison' }}</button>
        <button
          class="run-btn"
          :class="{ running: isRunning }"
          :disabled="isRunning"
          @click="runBoth"
        >{{ isRunning ? 'Running…' : 'Run A/B test ▸' }}</button>
      </div>

    </aside>

  </div>
</template>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────────────────────── */
.ab-tester {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr 1fr 380px;
  gap: 16px;
  padding: 16px;
  background: var(--canvas);
  height: 100%;
  overflow: hidden;
}

/* ── Version cards ──────────────────────────────────────────────────────────── */
.vcol {
  background: var(--card);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* Card header: badge + axis label + version/config select */
.vhead {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.abadge {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-family: var(--font-sans);
}

.axis-lbl {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
  flex-shrink: 0;
}

.vselect {
  flex: 1;
  min-width: 0;
  background: var(--bg-sunken);
  border: 1px solid transparent;
  border-radius: var(--r-ctl);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 600;
  padding: 6px 10px;
  cursor: pointer;
  appearance: auto;
}
.vselect:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

/* Collapsible prompt/params section */
.prompt-wrap {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.prompt-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  width: 100%;
  text-align: left;
}
.prompt-head:hover .section-lbl,
.prompt-head:hover .io-chev { color: var(--text-secondary); }
.prompt-head:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent-soft); }

.io-chev {
  color: var(--text-faint);
  font-size: 10px;
  width: 10px;
  flex-shrink: 0;
  line-height: 1;
}

.section-lbl {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.io-prompt {
  margin: 0 16px 14px;
  background: var(--bg-sunken);
  border-radius: var(--r-inner);
  padding: 11px 13px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.75;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 190px;
  overflow: auto;
}

.io-var {
  color: var(--accent-ink);
  background: var(--accent-soft);
  font-weight: 650;
  border-radius: 4px;
  padding: 0 3px;
}

.io-params {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0 16px 14px;
}

.param {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-sunken);
  border-radius: 4px;
  padding: 2px 7px;
}
.param b { color: var(--text-primary); font-weight: 600; }
.param.diff { background: var(--accent-soft); color: var(--accent-ink); }
.param.diff b { color: var(--accent-ink); }

/* Output section */
.out-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.out-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bg-selected);
  flex-shrink: 0;
  transition: background 0.2s;
}
.out-dot.active { background: var(--success); }
.out-dot.error { background: var(--danger); }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.out-dot.pulsing {
  background: var(--accent);
  animation: pulse-dot 1s ease-in-out infinite;
}

.out-ttl {
  font-weight: 650;
  font-size: 13px;
  color: var(--text-primary);
}

.answer {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  font-family: var(--font-read);
  font-size: 14px;
  line-height: 1.65;
}

.output-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-faint);
  font-size: 13px;
}

.output-empty {
  color: var(--text-faint);
  font-size: 13px;
  margin: 0;
}

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
.err-icon { flex-shrink: 0; }

.output-text { font-size: 13.5px; }

.stat-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 16px;
  border-top: 1px solid var(--border);
}

.meta-stats { display: flex; align-items: center; gap: 10px; }

.meta-chip {
  font-size: 11px;
  color: var(--text-faint);
  font-family: var(--font-mono);
}

/* ── Shared config rail ──────────────────────────────────────────────────────── */
.rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 12px;
}

/* Scrollable railcard zone — the run button lives outside so it stays pinned */
.rail-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.railcard {
  background: var(--card);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  flex-shrink: 0;
}

/* Vars railcard header row: collapse toggle on the left, scenario picker on the right */
.panel-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
}

.panel-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  padding: 0;
  flex-shrink: 0;
}
.panel-toggle:hover .section-lbl,
.panel-toggle:hover .io-chev { color: var(--text-secondary); }
.panel-toggle:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--accent-soft); border-radius: 4px; }

/* Config railcard section label row (not a toggle — just a display row) */
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
}
.panel-head.no-click { padding-top: 0; }

.panel-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.panel-body {
  padding: 0 16px 14px;
}

.panel-empty {
  margin: 0;
  color: var(--text-faint);
  font-size: 12px;
}

/* Segmented toggle for "What are we testing?" */
.seg-zone {
  padding: 14px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.seg-question {
  display: block;
}

.seg {
  display: flex;
  background: var(--bg-sunken);
  border-radius: var(--r-ctl);
  padding: 3px;
  gap: 3px;
  margin-bottom: 14px;
}

.seg button {
  flex: 1;
  background: none;
  border: none;
  font: inherit;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--text-muted);
  padding: 7px;
  border-radius: 6px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  transition: background 0.12s, color 0.12s;
}
.seg button:hover { color: var(--text-secondary); }
.seg button.active {
  background: var(--card);
  box-shadow: var(--shadow-sm);
  color: var(--accent-ink);
}
.seg button:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--accent-soft); }

/* Compact-rail version picker overrides */
:deep(.compact-control) {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  flex-wrap: nowrap;
  justify-content: stretch;
}
:deep(.compact-control .entity-picker-wrap) {
  flex: 1 1 auto;
  min-width: 0;
}
:deep(.compact-control .entity-picker) {
  width: 100%;
  min-width: 0;
  max-width: none;
}
:deep(.compact-control .entity-save) { order: 1; }
:deep(.compact-popover) { width: 100%; }

/* Held (shared) version content */
.held-system {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
  max-height: 80px;
  overflow: auto;
  margin-bottom: 6px;
}
.held-prompt-editor {
  display: flex;
  min-height: 180px;
  max-height: 300px;
}

/* Rail footer: comparison save + Run, pinned below the scrollable railcards */
.rail-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.comparison-error { color: var(--danger-ink); font-size: 11px; }

.save-comparison-btn {
  padding: 9px 14px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-ctl);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}
.save-comparison-btn:hover:not(:disabled) { border-color: var(--border-strong, #aaa); color: var(--text-primary); }
.save-comparison-btn:disabled { opacity: 0.55; cursor: default; box-shadow: none; }

.run-btn {
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
.run-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-soft), 0 2px 9px color-mix(in srgb, var(--accent) 38%, transparent);
}
.run-btn:disabled,
.run-btn.running { opacity: 0.6; cursor: not-allowed; }

/* Spinner */
@keyframes ab-spin { to { transform: rotate(360deg); } }
.spinner {
  display: inline-block;
  width: 13px;
  height: 13px;
  border: 2px solid var(--bg-selected);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: ab-spin 0.7s linear infinite;
  vertical-align: middle;
  flex-shrink: 0;
}

/* ── Responsive ──────────────────────────────────────────────────────────────── */
/* Below ~1300px the three-column grid crowds; collapse the rail into a bottom
   drawer and stack A/B vertically on narrow viewports. */
@media (max-width: 1300px) {
  .ab-tester {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr auto;
  }
  .rail {
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 12px;
    overflow-x: auto;
    overflow-y: visible;
  }
  .rail-scroll {
    flex: 1 1 auto;
    flex-direction: row;
    flex-wrap: wrap;
    overflow: visible;
    min-height: 0;
    max-height: 260px;
  }
  .railcard { flex: 1 1 260px; }
  .rail-foot { flex: 0 0 auto; flex-direction: column; align-self: flex-end; min-width: 200px; }
  .run-btn { width: 100%; }
}

@media (max-width: 760px) {
  .ab-tester {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
  .vcol { min-height: 420px; }
  .rail { max-height: none; }
}
</style>
