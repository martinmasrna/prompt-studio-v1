import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/api';

const apiMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../src/api', () => ({
  api: { configs: apiMock },
}));

import {
  applyConfigById,
  configs,
  configSaving,
  configsError,
  configsLoading,
  deleteSelectedConfig,
  enableThinking,
  isConfigDirty,
  loadConfigs,
  maxTokens,
  saveNewConfig,
  saveSelectedConfig,
  selectConfig,
  selectedConfigId,
  temperature,
  topK,
  topP,
} from '../src/store/configs';

function fixture(id: number, name: string, overrides: Partial<Config> = {}): Config {
  return {
    id,
    prompt_id: 10,
    name,
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

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('confirm', vi.fn(() => true));
  await loadConfigs(null);
});

describe('config store', () => {
  it('loads configs and applies every parameter on select', async () => {
    apiMock.list.mockResolvedValue([fixture(1, 'Precise')]);
    await loadConfigs(10);
    expect(configsLoading.value).toBe(false);
    expect(selectConfig(1)).toBe(true);
    expect(selectedConfigId.value).toBe(1);
    expect(temperature.value).toBe(0.2);
    expect(topP.value).toBe(0.8);
    expect(topK.value).toBe(20);
    expect(maxTokens.value).toBe(512);
    expect(enableThinking.value).toBe(true);
    expect(isConfigDirty.value).toBe(false);
  });

  it('tracks parameter changes and protects them with discard confirmation', async () => {
    apiMock.list.mockResolvedValue([fixture(1, 'One'), fixture(2, 'Two')]);
    await loadConfigs(10);
    selectConfig(1);
    temperature.value = 0.9;
    expect(isConfigDirty.value).toBe(true);
    vi.mocked(confirm).mockReturnValueOnce(false);
    expect(selectConfig(2)).toBe(false);
    expect(selectedConfigId.value).toBe(1);
    vi.mocked(confirm).mockReturnValueOnce(true);
    expect(selectConfig(2)).toBe(true);
    expect(isConfigDirty.value).toBe(false);
  });

  it('applies a config by id without the unsaved-changes guard', async () => {
    apiMock.list.mockResolvedValue([fixture(1, 'One'), fixture(2, 'Two', { temperature: 1.1 })]);
    await loadConfigs(10);
    selectConfig(1);
    temperature.value = 0.5; // dirty, but applyConfigById must not prompt
    applyConfigById(2);
    expect(confirm).not.toHaveBeenCalled();
    expect(selectedConfigId.value).toBe(2);
    expect(temperature.value).toBe(1.1);
    expect(isConfigDirty.value).toBe(false);
    // A null id resets to scratch defaults.
    applyConfigById(null);
    expect(selectedConfigId.value).toBe(null);
    expect(temperature.value).toBe(0.7);
  });

  it('creates sorted configs from the current parameters and selects the result', async () => {
    apiMock.list.mockResolvedValue([fixture(1, 'Zulu')]);
    await loadConfigs(10);
    temperature.value = 0.4;
    maxTokens.value = 2048;
    apiMock.create.mockResolvedValue(fixture(3, 'Alpha', { temperature: 0.4, max_tokens: 2048 }));
    await saveNewConfig('  Alpha  ');
    expect(apiMock.create).toHaveBeenCalledWith(10, expect.objectContaining({
      name: 'Alpha', temperature: 0.4, max_tokens: 2048,
    }));
    expect(configs.value.map(item => item.name)).toEqual(['Alpha', 'Zulu']);
    expect(selectedConfigId.value).toBe(3);
    expect(isConfigDirty.value).toBe(false);
  });

  it('updates explicitly, resets dirty state, then deletes to scratch state', async () => {
    apiMock.list.mockResolvedValue([fixture(1, 'Editable')]);
    await loadConfigs(10);
    selectConfig(1);
    topK.value = 55;
    apiMock.update.mockResolvedValue(fixture(1, 'Editable', { top_k: 55, updated_at: 2 }));
    await saveSelectedConfig();
    expect(apiMock.update).toHaveBeenCalledWith(1, expect.objectContaining({ top_k: 55 }));
    expect(isConfigDirty.value).toBe(false);

    apiMock.delete.mockResolvedValue({ ok: true });
    await deleteSelectedConfig();
    expect(apiMock.delete).toHaveBeenCalledWith(1);
    expect(selectedConfigId.value).toBe(null);
    expect(temperature.value).toBe(0.7);
  });

  it('surfaces load and save failures and always clears activity flags', async () => {
    apiMock.list.mockRejectedValueOnce(new Error('load failed'));
    await loadConfigs(10);
    expect(configsError.value).toBe('load failed');
    expect(configsLoading.value).toBe(false);

    apiMock.list.mockResolvedValueOnce([]);
    await loadConfigs(10);
    apiMock.create.mockRejectedValueOnce(new Error('save failed'));
    await expect(saveNewConfig('Broken')).rejects.toThrow('save failed');
    expect(configsError.value).toBe('save failed');
    expect(configSaving.value).toBe(false);
  });
});
