import { ref } from 'vue';
import { api, type Config, type ConfigInput } from '../api';
import { createCollectionStore } from './collection';

// Live sampling-parameter state — the editable payload a config captures. Bound
// by ParameterControls; read into a config on save and written back on select.
export const temperature = ref(0.7);
export const topP = ref(1);
export const topK = ref(40);
export const maxTokens = ref(1024);
export const enableThinking = ref(false);

const DEFAULTS = { temperature: 0.7, top_p: 1, top_k: 40, max_tokens: 1024, enable_thinking: false };

export const configStore = createCollectionStore<Config, ConfigInput>({
  resource: api.configs,
  noun: 'config',
  pluralLabel: 'configs',
  capture: name => ({
    name,
    temperature: temperature.value,
    top_p: topP.value,
    top_k: topK.value,
    max_tokens: maxTokens.value,
    enable_thinking: enableThinking.value,
  }),
  apply: config => {
    temperature.value = config?.temperature ?? DEFAULTS.temperature;
    topP.value = config?.top_p ?? DEFAULTS.top_p;
    topK.value = config?.top_k ?? DEFAULTS.top_k;
    maxTokens.value = config?.max_tokens ?? DEFAULTS.max_tokens;
    enableThinking.value = config?.enable_thinking ?? DEFAULTS.enable_thinking;
  },
});

// Named handles the rest of the app reads.
export const configs = configStore.items;
export const selectedConfigId = configStore.selectedId;
export const loadConfigs = configStore.load;
export const applyConfigById = configStore.applyById;
