// Module-level singletons for all editor state. Keeping these at module scope
// means any component can import and mutate without prop-drilling or Pinia setup.
import { ref } from 'vue';
import type { EvaluationInput, PromptDetail, VersionInfo } from '../api';
import { applyConfigById } from './configs';

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

// The active version's system prompt is part of the version, not the test case.
// `activeSystemPrompt` is the live, editable value (bound by the sandbox/A·B
// advanced panels); `savedSystemPrompt` is the version's persisted baseline,
// used to tell whether the version has unsaved system-prompt edits.
export const activeSystemPrompt = ref<string>('');
export const savedSystemPrompt  = ref<string>('');

export function openIssue(issueId: number) {
  activeIssueId.value = issueId;
  activeModule.value = 'issues';
}

// Make a version the active one: load its text and system prompt (resetting the
// dirty baselines), and select its default config so the parameter panel
// reflects how the version is meant to run.
export function applyActiveVersion(version: Pick<VersionInfo, 'id' | 'text' | 'system_prompt' | 'default_config_id'>): void {
  activeVersionId.value = version.id;
  activeVersionText.value = version.text;
  activeSystemPrompt.value = version.system_prompt;
  savedSystemPrompt.value = version.system_prompt;
  applyConfigById(version.default_config_id);
}

// Clear active-version state when there is no prompt/version selected.
export function clearActiveVersion(): void {
  activeVersionId.value = null;
  activeVersionText.value = '';
  activeSystemPrompt.value = '';
  savedSystemPrompt.value = '';
  applyConfigById(null);
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
