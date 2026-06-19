import { computed, ref } from 'vue';
import { api, type TestCase, type TestCaseInput } from '../api';
import { variableValues } from './editor';

export const testCases = ref<TestCase[]>([]);
export const selectedTestCaseId = ref<number | null>(null);
export const testsLoading = ref(false);
export const testSaving = ref(false);
export const testsError = ref<string | null>(null);

export const systemPrompt = ref('');
export const temperature = ref(0.7);
export const topP = ref(1);
export const topK = ref(40);
export const maxTokens = ref(1024);
export const enableThinking = ref(false);

let activePromptId: number | null = null;
let savedSnapshot = '';
let loadGeneration = 0;

function currentConfiguration(name = '', description: string | null = null): TestCaseInput {
  return {
    name,
    description,
    variables: { ...variableValues.value },
    system_prompt: systemPrompt.value,
    temperature: temperature.value,
    top_p: topP.value,
    top_k: topK.value,
    max_tokens: maxTokens.value,
    enable_thinking: enableThinking.value,
  };
}

function configurationSnapshot(testCase?: TestCase): string {
  const selected = testCase ?? testCases.value.find(item => item.id === selectedTestCaseId.value);
  const config = currentConfiguration(selected?.name ?? '', selected?.description ?? null);
  return JSON.stringify(config);
}

function resetConfiguration(): void {
  selectedTestCaseId.value = null;
  variableValues.value = {};
  systemPrompt.value = '';
  temperature.value = 0.7;
  topP.value = 1;
  topK.value = 40;
  maxTokens.value = 1024;
  enableThinking.value = false;
  savedSnapshot = configurationSnapshot();
}

function applyTestCase(testCase: TestCase): void {
  selectedTestCaseId.value = testCase.id;
  variableValues.value = { ...testCase.variables };
  systemPrompt.value = testCase.system_prompt;
  temperature.value = testCase.temperature;
  topP.value = testCase.top_p;
  topK.value = testCase.top_k;
  maxTokens.value = testCase.max_tokens;
  enableThinking.value = testCase.enable_thinking;
  savedSnapshot = configurationSnapshot(testCase);
}

export const selectedTestCase = computed(() =>
  testCases.value.find(item => item.id === selectedTestCaseId.value) ?? null
);

export const isTestDirty = computed(() =>
  selectedTestCaseId.value !== null && configurationSnapshot() !== savedSnapshot
);

export async function loadTestCases(promptId: number | null): Promise<void> {
  const generation = ++loadGeneration;
  activePromptId = promptId;
  testCases.value = [];
  resetConfiguration();
  testsError.value = null;
  if (promptId === null) return;

  testsLoading.value = true;
  try {
    const loaded = await api.testCases.list(promptId);
    if (generation === loadGeneration && activePromptId === promptId) testCases.value = loaded;
  } catch (error) {
    if (generation === loadGeneration) {
      testsError.value = error instanceof Error ? error.message : 'Could not load saved tests';
    }
  } finally {
    if (generation === loadGeneration) testsLoading.value = false;
  }
}

export function selectTestCase(id: number | null): boolean {
  if (isTestDirty.value && !confirm('Discard unsaved changes to the selected test?')) return false;
  if (id === null) {
    resetConfiguration();
    return true;
  }
  const testCase = testCases.value.find(item => item.id === id);
  if (!testCase) return false;
  applyTestCase(testCase);
  return true;
}

export async function saveNewTest(name: string): Promise<void> {
  if (activePromptId === null || !name.trim()) return;
  testSaving.value = true;
  testsError.value = null;
  try {
    const created = await api.testCases.create(activePromptId, currentConfiguration(name.trim()));
    testCases.value = [...testCases.value, created]
      .sort((a, b) => a.name.localeCompare(b.name));
    applyTestCase(created);
  } catch (error) {
    testsError.value = error instanceof Error ? error.message : 'Could not save test';
    throw error;
  } finally {
    testSaving.value = false;
  }
}

export async function saveSelectedTest(): Promise<void> {
  const selected = selectedTestCase.value;
  if (!selected) return;
  testSaving.value = true;
  testsError.value = null;
  try {
    const updated = await api.testCases.update(
      selected.id,
      currentConfiguration(selected.name, selected.description)
    );
    const index = testCases.value.findIndex(item => item.id === updated.id);
    if (index >= 0) testCases.value[index] = updated;
    applyTestCase(updated);
  } catch (error) {
    testsError.value = error instanceof Error ? error.message : 'Could not update test';
    throw error;
  } finally {
    testSaving.value = false;
  }
}

export async function deleteSelectedTest(): Promise<void> {
  const selected = selectedTestCase.value;
  if (!selected) return;
  await api.testCases.delete(selected.id);
  testCases.value = testCases.value.filter(item => item.id !== selected.id);
  resetConfiguration();
}
