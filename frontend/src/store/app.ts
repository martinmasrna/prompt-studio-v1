// Module-level singleton — one shared ref for the selected prompt ID across
// all components. Avoids prop-drilling through arbitrary component depths.
import { ref } from 'vue';
import type { Prompt, FolderNode } from '../api';

const selectedPromptId = ref<number | null>(null);
const folders = ref<FolderNode[]>([]);
const prompts = ref<Prompt[]>([]);

export function useAppState() {
  return { selectedPromptId, folders, prompts };
}
