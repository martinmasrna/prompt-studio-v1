// Module-level singletons for all editor state. Keeping these at module scope
// means any component can import and mutate without prop-drilling or Pinia setup.
import { ref } from 'vue';
import type { EvaluationInput, PromptDetail, VersionInfo } from '../api';

export type ModuleTab = 'overview' | 'ab-tester' | 'results' | 'issues';

export interface SandboxEntry {
  id: number;
  timestamp: number;
  userMessage: string;   // first 80 chars — for log preview
  text: string;
  tokens_used: number | null;
  latency_ms: number;
  evaluation: EvaluationInput;
  savedEvaluationId: number | null;
}

export const activeModule      = ref<ModuleTab>('overview');
export const activePromptData  = ref<PromptDetail | null>(null);
export const activeVersionId   = ref<number | null>(null);
export const activeVersionText = ref<string>('');
export const versions          = ref<VersionInfo[]>([]);
export const activeIssueId     = ref<number | null>(null);
export const newVersionDraftText = ref<string | null>(null);

export function openIssue(issueId: number) {
  activeIssueId.value = issueId;
  activeModule.value = 'issues';
}

// Variable values are shared between LeftPanel and SandboxPanel
export const variableValues = ref<Record<string, string>>({});

// Shared modal flags — set by any component, read by the component that owns the modal UI
export const showSaveModal = ref(false);

// Sandbox session log — lives only for this page session, not persisted
export const sandboxOutput  = ref<SandboxEntry | null>(null);
export const outputLog      = ref<SandboxEntry[]>([]);
let logCounter = 0;

export function addSandboxEntry(entry: Omit<SandboxEntry, 'id'>): SandboxEntry {
  const e = { ...entry, id: ++logCounter };
  outputLog.value.unshift(e);
  sandboxOutput.value = e;
  return e;
}

export function useEditorState() {
  return {
    activeModule,
    activePromptData,
    activeVersionId,
    activeVersionText,
    versions,
    activeIssueId,
    newVersionDraftText,
    variableValues,
    sandboxOutput,
    outputLog,
    addSandboxEntry,
  };
}
