import { computed, ref } from 'vue';
import { api, type TestCase, type TestCaseInput } from '../api';
import { variableValues } from './editor';

// A test case is now purely a scenario: a name and a set of variable values.
// Sampling parameters live in the configs store; the system prompt lives on the
// prompt version.
export const testCases = ref<TestCase[]>([]);
export const selectedTestCaseId = ref<number | null>(null);
export const testsLoading = ref(false);
export const testSaving = ref(false);
export const testsError = ref<string | null>(null);

let activePromptId: number | null = null;
let savedSnapshot = '';
let loadGeneration = 0;

function currentScenario(name = '', description: string | null = null): TestCaseInput {
  return {
    name,
    description,
    variables: { ...variableValues.value },
  };
}

function scenarioSnapshot(testCase?: TestCase): string {
  const selected = testCase ?? testCases.value.find(item => item.id === selectedTestCaseId.value);
  return JSON.stringify(currentScenario(selected?.name ?? '', selected?.description ?? null));
}

function updateSavedSnapshotName(name: string): void {
  try {
    const snapshot = JSON.parse(savedSnapshot) as TestCaseInput;
    savedSnapshot = JSON.stringify({ ...snapshot, name });
  } catch {
    savedSnapshot = scenarioSnapshot();
  }
}

function resetScenario(): void {
  selectedTestCaseId.value = null;
  variableValues.value = {};
  savedSnapshot = scenarioSnapshot();
}

function applyTestCase(testCase: TestCase): void {
  selectedTestCaseId.value = testCase.id;
  variableValues.value = { ...testCase.variables };
  savedSnapshot = scenarioSnapshot(testCase);
}

export const selectedTestCase = computed(() =>
  testCases.value.find(item => item.id === selectedTestCaseId.value) ?? null
);

export const isTestDirty = computed(() =>
  selectedTestCaseId.value !== null && scenarioSnapshot() !== savedSnapshot
);

export async function loadTestCases(promptId: number | null): Promise<void> {
  const generation = ++loadGeneration;
  activePromptId = promptId;
  testCases.value = [];
  resetScenario();
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
    resetScenario();
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
    const created = await api.testCases.create(activePromptId, currentScenario(name.trim()));
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
      currentScenario(selected.name, selected.description)
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

export async function renameTestCase(id: number, name: string): Promise<void> {
  const selected = testCases.value.find(item => item.id === id);
  const trimmed = name.trim();
  if (!selected || !trimmed || trimmed === selected.name) return;
  testSaving.value = true;
  testsError.value = null;
  try {
    const updated = await api.testCases.update(selected.id, { name: trimmed });
    const next = testCases.value.map(item => item.id === updated.id ? updated : item)
      .sort((a, b) => a.name.localeCompare(b.name));
    testCases.value = next;
    if (selectedTestCaseId.value === updated.id) updateSavedSnapshotName(updated.name);
  } catch (error) {
    testsError.value = error instanceof Error ? error.message : 'Could not rename test';
    throw error;
  } finally {
    testSaving.value = false;
  }
}

export async function renameSelectedTest(name: string): Promise<void> {
  const selected = selectedTestCase.value;
  if (!selected) return;
  await renameTestCase(selected.id, name);
}

export async function deleteTestCase(id: number): Promise<void> {
  await api.testCases.delete(id);
  testCases.value = testCases.value.filter(item => item.id !== id);
  if (selectedTestCaseId.value === id) resetScenario();
}

export async function deleteSelectedTest(): Promise<void> {
  const selected = selectedTestCase.value;
  if (!selected) return;
  await deleteTestCase(selected.id);
}
