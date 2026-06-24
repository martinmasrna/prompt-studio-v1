import { computed, ref } from 'vue';
import { api, type Config, type ConfigInput } from '../api';

// A config is a reusable, prompt-scoped set of sampling parameters, selected
// independently of the prompt version and the test scenario. Mirrors the saved-
// test store, but for the "how to decode" axis rather than the scenario.
export const configs = ref<Config[]>([]);
export const selectedConfigId = ref<number | null>(null);
export const configsLoading = ref(false);
export const configSaving = ref(false);
export const configsError = ref<string | null>(null);

export const temperature = ref(0.7);
export const topP = ref(1);
export const topK = ref(40);
export const maxTokens = ref(1024);
export const enableThinking = ref(false);

let activePromptId: number | null = null;
let savedSnapshot = '';
let loadGeneration = 0;

function currentValues(name = ''): ConfigInput {
  return {
    name,
    temperature: temperature.value,
    top_p: topP.value,
    top_k: topK.value,
    max_tokens: maxTokens.value,
    enable_thinking: enableThinking.value,
  };
}

function snapshot(config?: Config): string {
  const selected = config ?? configs.value.find(item => item.id === selectedConfigId.value);
  return JSON.stringify(currentValues(selected?.name ?? ''));
}

function applyParams(config: Config): void {
  temperature.value = config.temperature;
  topP.value = config.top_p;
  topK.value = config.top_k;
  maxTokens.value = config.max_tokens;
  enableThinking.value = config.enable_thinking;
}

function resetParams(): void {
  selectedConfigId.value = null;
  temperature.value = 0.7;
  topP.value = 1;
  topK.value = 40;
  maxTokens.value = 1024;
  enableThinking.value = false;
  savedSnapshot = snapshot();
}

function applyConfig(config: Config): void {
  selectedConfigId.value = config.id;
  applyParams(config);
  savedSnapshot = snapshot(config);
}

export const selectedConfig = computed(() =>
  configs.value.find(item => item.id === selectedConfigId.value) ?? null
);

export const isConfigDirty = computed(() =>
  selectedConfigId.value !== null && snapshot() !== savedSnapshot
);

export async function loadConfigs(promptId: number | null): Promise<void> {
  const generation = ++loadGeneration;
  activePromptId = promptId;
  configs.value = [];
  resetParams();
  configsError.value = null;
  if (promptId === null) return;

  configsLoading.value = true;
  try {
    const loaded = await api.configs.list(promptId);
    if (generation === loadGeneration && activePromptId === promptId) configs.value = loaded;
  } catch (error) {
    if (generation === loadGeneration) {
      configsError.value = error instanceof Error ? error.message : 'Could not load configs';
    }
  } finally {
    if (generation === loadGeneration) configsLoading.value = false;
  }
}

export function selectConfig(id: number | null): boolean {
  if (isConfigDirty.value && !confirm('Discard unsaved changes to the selected config?')) return false;
  if (id === null) {
    resetParams();
    return true;
  }
  const config = configs.value.find(item => item.id === id);
  if (!config) return false;
  applyConfig(config);
  return true;
}

// Select a config by id without the unsaved-changes guard. Used when loading a
// prompt version, whose default config drives the initial parameter selection.
export function applyConfigById(id: number | null): void {
  const config = id === null ? undefined : configs.value.find(item => item.id === id);
  if (config) applyConfig(config);
  else resetParams();
}

export async function saveNewConfig(name: string): Promise<void> {
  if (activePromptId === null || !name.trim()) return;
  configSaving.value = true;
  configsError.value = null;
  try {
    const created = await api.configs.create(activePromptId, currentValues(name.trim()));
    configs.value = [...configs.value, created].sort((a, b) => a.name.localeCompare(b.name));
    applyConfig(created);
  } catch (error) {
    configsError.value = error instanceof Error ? error.message : 'Could not save config';
    throw error;
  } finally {
    configSaving.value = false;
  }
}

export async function saveSelectedConfig(): Promise<void> {
  const selected = selectedConfig.value;
  if (!selected) return;
  configSaving.value = true;
  configsError.value = null;
  try {
    const updated = await api.configs.update(selected.id, currentValues(selected.name));
    const index = configs.value.findIndex(item => item.id === updated.id);
    if (index >= 0) configs.value[index] = updated;
    applyConfig(updated);
  } catch (error) {
    configsError.value = error instanceof Error ? error.message : 'Could not update config';
    throw error;
  } finally {
    configSaving.value = false;
  }
}

export async function deleteSelectedConfig(): Promise<void> {
  const selected = selectedConfig.value;
  if (!selected) return;
  await api.configs.delete(selected.id);
  configs.value = configs.value.filter(item => item.id !== selected.id);
  resetParams();
}
