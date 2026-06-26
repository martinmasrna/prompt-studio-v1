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

// The setup inspector (right rail) collapses to hand its width to the outputs
// while you read — you set up once, then mostly compare.
const setupOpen = ref(true);

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
// Per-side selectors for the varied axis, plus a shared selector for the held one.
const aVersionId = ref<number | null>(null);
const bVersionId = ref<number | null>(null);
const sharedVersionId = ref<number | null>(null);
const aConfigId = ref<number | null>(null);
const bConfigId = ref<number | null>(null);
// The held config (when varying version) is the live, editable config shared with
// the Sandbox — its params live in the configs store, not a per-side ref.

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

// A config's parameters come from the saved config; "Scratch" (no config) falls
// back to the live parameter state shared with the sandbox.
function settingsFor(versionId: number | null, configId: number | null): RunSettings {
  const c = configId === null ? null : configs.value.find(x => x.id === configId);
  const params = c
    ? { temperature: c.temperature, top_p: c.top_p, top_k: c.top_k, max_tokens: c.max_tokens, enable_thinking: c.enable_thinking }
    : { temperature: temperature.value, top_p: topP.value, top_k: topK.value, max_tokens: maxTokens.value, enable_thinking: enableThinking.value };
  return { system_prompt: systemPromptFor(versionId), ...params };
}

// The live, editable params — what both sides run with when varying version (and
// the Scratch fallback). Mirrors what the Sandbox runs with.
const liveParams = () => ({
  temperature: temperature.value, top_p: topP.value, top_k: topK.value,
  max_tokens: maxTokens.value, enable_thinking: enableThinking.value,
});

const aText = computed(() => textFor(versionAId.value));
const bText = computed(() => textFor(versionBId.value));

// ── Content of each axis (for the inspector's held preview and the inputs band) ──
// Params resolved the same way runs resolve them, so the preview is truthful: a
// saved config's values, or the live "Scratch" state when no config is chosen.
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
// Keys whose value differs between A and B — highlighted so the changed knobs pop.
const paramDiff = computed(() => {
  const set = new Set<string>();
  paramsA.value.forEach((p, i) => { if (p.value !== paramsB.value[i].value) set.add(p.key); });
  return set;
});

// Prompt broken into text + {{variable}} segments, for the inline raw template view.
const segmentsA = computed(() => tokenizePrompt(aText.value, variableValues.value));
const segmentsB = computed(() => tokenizePrompt(bText.value, variableValues.value));

// Held (shared) version content, shown once in the inspector when varying config.
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
  inputsOpenA.value = false; // hand the stage to the outputs once a run starts
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
  <div class="ab-tester" :class="{ 'setup-collapsed': !setupOpen }">

    <!-- ── Comparison (the stage) ─────────────────────────── -->
    <div class="comparison">

      <!-- Side A -->
      <div class="side">
        <div class="side-header">
          <span class="side-badge">A</span>
          <span class="side-axis">{{ varyAxis === 'version' ? 'Version' : 'Config' }}</span>
          <select v-if="varyAxis === 'version'" v-model="aVersionId" class="sel-version" aria-label="Version A">
            <option v-for="v in versions" :key="v.id" :value="v.id">
              {{ v.name }}{{ v.is_current ? ' ★' : '' }}
            </option>
          </select>
          <select v-else v-model="aConfigId" class="sel-version" aria-label="Config A">
            <option :value="null">Scratch</option>
            <option v-for="c in configs" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <!-- Inputs band: the content of the varied axis for this side -->
        <div class="side-input">
          <button class="io-head" :aria-expanded="inputsOpenA" @click="inputsOpenA = !inputsOpenA">
            <span class="io-chev">{{ inputsOpenA ? '▾' : '▸' }}</span>
            <span class="io-label">{{ varyAxis === 'version' ? 'Prompt' : 'Params' }}</span>
          </button>
          <template v-if="inputsOpenA">
            <div v-if="varyAxis === 'version'" class="io-prompt"><template v-for="(seg, i) in segmentsA" :key="i"><span v-if="seg.type === 'var'" class="io-var">{{ rawVar(seg.name) }}</span><template v-else>{{ seg.value }}</template></template></div>
            <div v-else class="params io-params">
              <span v-for="p in paramsA" :key="p.key" class="param" :class="{ diff: paramDiff.has(p.key) }">{{ p.label }} <b>{{ p.value }}</b></span>
            </div>
          </template>
        </div>

        <div class="side-output">
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

        <div v-if="outputA" class="side-footer">
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
      </div>

      <div class="col-divider" />

      <!-- Side B -->
      <div class="side">
        <div class="side-header">
          <span class="side-badge">B</span>
          <span class="side-axis">{{ varyAxis === 'version' ? 'Version' : 'Config' }}</span>
          <select v-if="varyAxis === 'version'" v-model="bVersionId" class="sel-version" aria-label="Version B">
            <option v-for="v in versions" :key="v.id" :value="v.id">
              {{ v.name }}{{ v.is_current ? ' ★' : '' }}
            </option>
          </select>
          <select v-else v-model="bConfigId" class="sel-version" aria-label="Config B">
            <option :value="null">Scratch</option>
            <option v-for="c in configs" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <!-- Inputs band: the content of the varied axis for this side -->
        <div class="side-input">
          <button class="io-head" :aria-expanded="inputsOpenB" @click="inputsOpenB = !inputsOpenB">
            <span class="io-chev">{{ inputsOpenB ? '▾' : '▸' }}</span>
            <span class="io-label">{{ varyAxis === 'version' ? 'Prompt' : 'Params' }}</span>
          </button>
          <template v-if="inputsOpenB">
            <div v-if="varyAxis === 'version'" class="io-prompt"><template v-for="(seg, i) in segmentsB" :key="i"><span v-if="seg.type === 'var'" class="io-var">{{ rawVar(seg.name) }}</span><template v-else>{{ seg.value }}</template></template></div>
            <div v-else class="params io-params">
              <span v-for="p in paramsB" :key="p.key" class="param" :class="{ diff: paramDiff.has(p.key) }">{{ p.label }} <b>{{ p.value }}</b></span>
            </div>
          </template>
        </div>

        <div class="side-output">
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

        <div v-if="outputB" class="side-footer">
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
      </div>

    </div>

    <!-- ── Setup inspector (right rail) ───────────────────── -->
    <aside class="setup" :class="{ collapsed: !setupOpen }">
      <button
        v-if="!setupOpen"
        class="setup-toggle"
        title="Expand setup"
        :aria-expanded="setupOpen"
        @click="setupOpen = true"
      >‹</button>

      <template v-if="setupOpen">
        <div class="setup-scroll">
          <div class="setup-title-row">
            <button
              class="setup-toggle"
              title="Collapse setup"
              :aria-expanded="setupOpen"
              @click="setupOpen = false"
            >›</button>
            <h2 class="setup-section-title">Shared configuration</h2>
          </div>

          <!-- Scenario + its variables -->
          <section class="panel-box">
            <header class="box-header">
              <h3 class="box-title">Shared variables</h3>
              <TestCaseControls />
            </header>
            <div class="box-body">
              <VariablesPanel v-if="detectedVars.length" :detected-vars="detectedVars" hide-label />
              <p v-else class="box-empty">Neither side uses variables yet.</p>
            </div>
          </section>

          <!-- Held (shared) axis — shown once, applied to both sides -->
          <section class="panel-box">
            <header class="box-header">
              <p class="setup-question">What are we A/B testing?</p>
              <div class="vary-toggle title-toggle" role="tablist" aria-label="A/B test mode">
                <button :class="{ active: varyAxis === 'version' }" role="tab" :aria-selected="varyAxis === 'version'" @click="varyAxis = 'version'">Prompt version</button>
                <button :class="{ active: varyAxis === 'config' }" role="tab" :aria-selected="varyAxis === 'config'" @click="varyAxis = 'config'">Config</button>
              </div>
              <p class="shared-axis-label">{{ varyAxis === 'version' ? 'Shared config' : 'Shared prompt version' }}</p>
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
            </header>
            <div class="box-body">
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
          </section>
        </div>

        <div class="setup-foot">
          <span v-if="comparisonError" class="comparison-error">{{ comparisonError }}</span>
          <button
            v-if="evaluationA && evaluationB"
            class="save-comparison-btn"
            :disabled="savedComparison !== null"
            @click="saveComparison"
          >{{ savedComparison ? 'Comparison saved' : 'Save comparison' }}</button>
          <button class="run-btn" :class="{ running: isRunning }" :disabled="isRunning" @click="runBoth">
            {{ isRunning ? 'Running…' : 'Run A/B test' }}
          </button>
        </div>
      </template>
    </aside>

  </div>
</template>

<style scoped>
/* ── Container ── */
/* A row: the comparison takes the stage, the setup inspector sits on the right. */
.ab-tester {
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow: hidden;
  height: 100%;
  background: var(--bg);
}

.vary-toggle { display: inline-flex; gap: 2px; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; width: 100%; padding: 2px; background: var(--bg); }
.vary-toggle button {
  flex: 1;
  padding: 6px 8px;
  background: var(--bg);
  border: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
  border-radius: 4px;
  white-space: nowrap;
}
.vary-toggle button + button { border-left: 1px solid transparent; }
.vary-toggle button:hover { color: var(--text-primary); background: var(--bg-hover); }
.vary-toggle button.active {
  background: var(--bg-selected);
  color: var(--text-primary);
  box-shadow: inset 0 0 0 1px #d8d8d8;
  font-weight: 600;
}
.vary-toggle.title-toggle {
  width: 100%;
}
.vary-toggle.title-toggle button {
  min-height: 30px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* ── Titled cards (shared visual language with the Sandbox/Overview panels) ── */
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
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  border-radius: 7px 7px 0 0;
  background: var(--bg-sunken);
}
.box-title { flex-shrink: 0; margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary); }
.setup-question,
.shared-axis-label {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.setup-question { color: var(--text-secondary); }
.shared-axis-label {
  margin-top: 2px;
  color: var(--text-faint);
}

/* In the narrow inspector, keep the card's title + compound picker
   on one row and let Save wrap below; cap the popover so it can't overflow left
   under the comparison panel. (Overview is unaffected — these are scoped overrides.) */
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
.box-body { padding: 12px; }
.box-empty { margin: 0; color: var(--text-faint); font-size: 12px; }

/* ── Setup inspector (right rail) ── */
.setup {
  flex-shrink: 0;
  width: 300px;
  position: relative;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  background: var(--bg);
  transition: width 0.16s ease;
}
.setup.collapsed { width: 44px; }
.setup:not(.collapsed) { width: 380px; }

.setup-toggle {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-muted);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  flex: 0 0 auto;
}
.setup.collapsed > .setup-toggle {
  position: absolute;
  top: 10px;
  left: 9px;
  z-index: 2;
}
.setup-toggle:hover { color: var(--text-primary); border-color: #aaa; }

.setup-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.setup-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 30px;
}
.setup-section-title {
  margin: 0;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.setup-foot {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
.save-comparison-btn { padding: 8px 14px; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--text-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.save-comparison-btn:hover:not(:disabled) { border-color: #aaa; color: var(--text-primary); }
.save-comparison-btn:disabled { opacity: .55; cursor: default; }
.comparison-error { color: #c04040; font-size: 11px; }

.run-btn {
  padding: 9px 24px;
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
}
.run-btn:hover:not(:disabled) { background: #333; }
.run-btn:disabled, .run-btn.running { opacity: 0.5; cursor: not-allowed; }

/* ── Comparison ── */
.comparison { flex: 1; min-width: 0; display: flex; overflow: hidden; }

.side { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

.col-divider { width: 1px; background: var(--border); flex-shrink: 0; }

/* ── Side header: announces what each side IS (axis + value) ── */
.side-header {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
  flex-shrink: 0;
}

.side-badge {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #fff;
  background: #1a1a1a;
  border-radius: 4px;
  padding: 3px 9px;
  flex-shrink: 0;
}

.side-axis {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
  flex-shrink: 0;
}

.sel-version {
  min-width: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-mono);
  padding: 4px 8px;
  cursor: pointer;
}
.sel-version:focus { outline: none; border-color: #aaa; }

/* ── Inputs band: content of the varied axis, per side ── */
.side-input {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 20px 12px;
  border-bottom: 1px solid var(--border);
  background: #fcfcfd;
}
/* The band header is the toggle: chevron + label, always visible so a collapsed
   band can be reopened. */
.io-head {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 0;
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
}
.io-chev { width: 10px; color: var(--text-faint); font-size: 10px; line-height: 1; }
.io-label { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
.io-head:hover .io-label, .io-head:hover .io-chev { color: var(--text-secondary); }

.io-prompt {
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 9px 11px;
}
.io-var { background: #fff2c2; border-radius: 2px; padding: 0 1px; }

.params { display: flex; flex-wrap: wrap; gap: 5px; }
.params.io-params { padding-top: 2px; }
.param { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); background: var(--bg-selected); border-radius: 4px; padding: 2px 7px; }
.param b { color: var(--text-primary); font-weight: 600; }
.param.diff { background: #efeaff; color: #5a3fd6; box-shadow: inset 0 0 0 1px #d9cdff; }
.param.diff b { color: #4a2fc6; }

/* ── Held (shared) axis content, shown once in the inspector card body ── */
.held-system { font-size: 11px; color: var(--text-muted); line-height: 1.5; max-height: 80px; overflow: auto; margin-bottom: 6px; }
.held-prompt-editor {
  display: flex;
  min-height: 180px;
  max-height: 300px;
}
.held-prompt {
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow: auto;
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

/* Container only; element styling comes from the global .markdown-body class. */
.output-text {
  font-size: 13.5px;
}

/* Metrics are diagnostic footnotes, not the headline — pinned to the column
   foot, muted, out of the scrolling output. */
.side-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 20px;
  border-top: 1px solid var(--border);
}
.meta-stats { display: flex; align-items: center; gap: 10px; }
.meta-chip {
  font-size: 11px;
  color: var(--text-faint);
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
