import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TestCase } from '../src/api';

const apiMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../src/api', () => ({
  api: { testCases: apiMock },
}));

import { variableValues } from '../src/store/editor';
import {
  enableThinking,
  isTestDirty,
  loadTestCases,
  maxTokens,
  saveNewTest,
  saveSelectedTest,
  selectTestCase,
  selectedTestCaseId,
  systemPrompt,
  temperature,
  testCases,
  testSaving,
  testsError,
  testsLoading,
  topK,
  topP,
  deleteSelectedTest,
} from '../src/store/testCases';

function fixture(id: number, name: string, overrides: Partial<TestCase> = {}): TestCase {
  return {
    id,
    prompt_id: 10,
    name,
    description: null,
    variables: { query: 'saved', unused: 'preserved' },
    system_prompt: 'Be concise',
    temperature: 0.2,
    top_p: 0.8,
    top_k: 20,
    max_tokens: 512,
    enable_thinking: true,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('confirm', vi.fn(() => true));
  await loadTestCases(null);
});

describe('saved-test store', () => {
  it('loads tests, applies every setting, and preserves unused variables', async () => {
    apiMock.list.mockResolvedValue([fixture(1, 'Loaded')]);
    await loadTestCases(10);
    expect(testsLoading.value).toBe(false);
    expect(selectTestCase(1)).toBe(true);
    expect(selectedTestCaseId.value).toBe(1);
    expect(variableValues.value).toEqual({ query: 'saved', unused: 'preserved' });
    expect(systemPrompt.value).toBe('Be concise');
    expect(temperature.value).toBe(0.2);
    expect(topP.value).toBe(0.8);
    expect(topK.value).toBe(20);
    expect(maxTokens.value).toBe(512);
    expect(enableThinking.value).toBe(true);
    expect(isTestDirty.value).toBe(false);
  });

  it('ignores stale loads, including their errors and loading cleanup', async () => {
    const first = deferred<TestCase[]>();
    const second = deferred<TestCase[]>();
    apiMock.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const firstLoad = loadTestCases(1);
    const secondLoad = loadTestCases(2);
    first.reject(new Error('stale failure'));
    await firstLoad;
    expect(testsLoading.value).toBe(true);
    expect(testsError.value).toBe(null);
    second.resolve([fixture(2, 'Current', { prompt_id: 2 })]);
    await secondLoad;
    expect(testCases.value.map(item => item.name)).toEqual(['Current']);
    expect(testsLoading.value).toBe(false);
  });

  it('tracks changes and protects them with discard confirmation', async () => {
    apiMock.list.mockResolvedValue([fixture(1, 'One'), fixture(2, 'Two')]);
    await loadTestCases(10);
    selectTestCase(1);
    temperature.value = 0.9;
    expect(isTestDirty.value).toBe(true);
    vi.mocked(confirm).mockReturnValueOnce(false);
    expect(selectTestCase(2)).toBe(false);
    expect(selectedTestCaseId.value).toBe(1);
    vi.mocked(confirm).mockReturnValueOnce(true);
    expect(selectTestCase(2)).toBe(true);
    expect(isTestDirty.value).toBe(false);
  });

  it('creates sorted tests from the complete draft and selects the result', async () => {
    apiMock.list.mockResolvedValue([fixture(1, 'Zulu')]);
    await loadTestCases(10);
    variableValues.value = { query: 'new value' };
    systemPrompt.value = 'System';
    temperature.value = 0.4;
    apiMock.create.mockResolvedValue(fixture(3, 'Alpha', {
      variables: { query: 'new value' }, system_prompt: 'System', temperature: 0.4,
    }));
    await saveNewTest('  Alpha  ');
    expect(apiMock.create).toHaveBeenCalledWith(10, expect.objectContaining({
      name: 'Alpha', variables: { query: 'new value' }, system_prompt: 'System', temperature: 0.4,
    }));
    expect(testCases.value.map(item => item.name)).toEqual(['Alpha', 'Zulu']);
    expect(selectedTestCaseId.value).toBe(3);
    expect(isTestDirty.value).toBe(false);
  });

  it('updates explicitly, resets dirty state, then deletes to scratch state', async () => {
    const original = fixture(1, 'Editable');
    apiMock.list.mockResolvedValue([original]);
    await loadTestCases(10);
    selectTestCase(1);
    topK.value = 55;
    apiMock.update.mockResolvedValue(fixture(1, 'Editable', { top_k: 55, updated_at: 2 }));
    await saveSelectedTest();
    expect(apiMock.update).toHaveBeenCalledWith(1, expect.objectContaining({ top_k: 55 }));
    expect(isTestDirty.value).toBe(false);

    apiMock.delete.mockResolvedValue({ ok: true });
    await deleteSelectedTest();
    expect(apiMock.delete).toHaveBeenCalledWith(1);
    expect(selectedTestCaseId.value).toBe(null);
    expect(variableValues.value).toEqual({});
  });

  it('surfaces load and save failures and always clears activity flags', async () => {
    apiMock.list.mockRejectedValueOnce(new Error('load failed'));
    await loadTestCases(10);
    expect(testsError.value).toBe('load failed');
    expect(testsLoading.value).toBe(false);

    apiMock.list.mockResolvedValueOnce([]);
    await loadTestCases(10);
    apiMock.create.mockRejectedValueOnce(new Error('save failed'));
    await expect(saveNewTest('Broken')).rejects.toThrow('save failed');
    expect(testsError.value).toBe('save failed');
    expect(testSaving.value).toBe(false);
  });
});
