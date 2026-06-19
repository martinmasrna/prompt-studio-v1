// Shared app settings. Currently just the active LLM model, which the user picks
// in the Settings modal and which is sent with every run. The catalog of models
// (declared on the backend, possibly across several servers) is fetched once on
// startup.
import { ref, computed } from 'vue';
import { api } from '../api';
import type { ModelOption } from '../api';

const STORAGE_KEY = 'prompt-studio:model';

export const availableModels = ref<ModelOption[]>([]);
export const modelsError     = ref<string | null>(null);

// The chosen model's id. Persisted in localStorage so it survives reloads. Sent as
// `model_id` on /api/llm/run; the backend resolves it to the right server + model
// (and falls back to its default when null).
export const activeModelId = ref<string | null>(
  typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
);

// Friendly name of the active model, for display in the sidebar.
export const activeModelLabel = computed(() =>
  availableModels.value.find(m => m.id === activeModelId.value)?.label ?? activeModelId.value
);

// Modal visibility — toggled by the sidebar's Settings button, rendered by App.
export const showSettings = ref(false);

// Fetch the catalog from the backend. Resilient: on failure it records the error
// but leaves any previously stored selection intact so runs still work.
export async function loadModels(): Promise<void> {
  try {
    const { models, active } = await api.llm.models();
    availableModels.value = models;
    modelsError.value = null;

    // Keep the stored choice if it's still offered; otherwise fall back to the
    // backend's default, then to the first available model.
    if (!activeModelId.value || !models.some(m => m.id === activeModelId.value)) {
      activeModelId.value = (active && models.some(m => m.id === active))
        ? active
        : (models[0]?.id ?? null);
    }
  } catch (e: unknown) {
    modelsError.value = e instanceof Error ? e.message : 'Could not load models';
  }
}

export function setActiveModel(id: string): void {
  activeModelId.value = id;
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
}
