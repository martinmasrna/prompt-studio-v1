import { Router } from 'express';
import {
  createConfig,
  deleteConfig,
  getConfigById,
  listConfigs,
  updateConfig,
  type ConfigValues,
} from '../repositories/configs';
import { entityExists } from '../repositories/entities';
import { ValidationError, numberInRange, uniqueNameError, PARAM_BOUNDS } from '../lib/validation';

const router = Router();

const DEFAULTS: Omit<ConfigValues, 'name'> = {
  temperature: 0.7,
  top_p: 1,
  top_k: 40,
  max_tokens: 1024,
  enable_thinking: false,
};

function parseValues(body: unknown, partial: boolean): Partial<ConfigValues> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('request body must be an object');
  }
  const input = body as Record<string, unknown>;
  const result: Partial<ConfigValues> = {};

  if (!partial || 'name' in input) {
    if (typeof input.name !== 'string' || !input.name.trim()) {
      throw new ValidationError('name is required');
    }
    result.name = input.name.trim();
  }
  if ('temperature' in input) result.temperature = numberInRange(input.temperature, 'temperature', PARAM_BOUNDS.temperature);
  if ('top_p' in input) result.top_p = numberInRange(input.top_p, 'top_p', PARAM_BOUNDS.top_p);
  if ('top_k' in input) result.top_k = numberInRange(input.top_k, 'top_k', PARAM_BOUNDS.top_k);
  if ('max_tokens' in input) result.max_tokens = numberInRange(input.max_tokens, 'max_tokens', PARAM_BOUNDS.max_tokens);
  if ('enable_thinking' in input) {
    if (typeof input.enable_thinking !== 'boolean') {
      throw new ValidationError('enable_thinking must be a boolean');
    }
    result.enable_thinking = input.enable_thinking;
  }
  return result;
}

router.get('/prompts/:promptId/configs', (req, res) => {
  const promptId = Number(req.params.promptId);
  if (!Number.isInteger(promptId) || !entityExists('prompts', promptId)) {
    res.status(404).json({ error: 'Prompt not found' });
    return;
  }
  res.json(listConfigs(promptId));
});

router.post('/prompts/:promptId/configs', (req, res) => {
  const promptId = Number(req.params.promptId);
  if (!Number.isInteger(promptId) || !entityExists('prompts', promptId)) {
    res.status(404).json({ error: 'Prompt not found' });
    return;
  }
  try {
    const parsed = parseValues(req.body, false) as Pick<ConfigValues, 'name'> & Partial<ConfigValues>;
    const config = createConfig(promptId, { ...DEFAULTS, ...parsed });
    res.status(201).json(config);
  } catch (error) {
    if (error instanceof ValidationError) res.status(400).json({ error: error.message });
    else if (uniqueNameError(error, 'configs')) res.status(409).json({ error: 'A config with this name already exists for the prompt' });
    else throw error;
  }
});

router.get('/configs/:id', (req, res) => {
  const config = getConfigById(Number(req.params.id));
  if (!config) { res.status(404).json({ error: 'Config not found' }); return; }
  res.json(config);
});

router.patch('/configs/:id', (req, res) => {
  try {
    const values = parseValues(req.body, true);
    const config = updateConfig(Number(req.params.id), values);
    if (!config) { res.status(404).json({ error: 'Config not found' }); return; }
    res.json(config);
  } catch (error) {
    if (error instanceof ValidationError) res.status(400).json({ error: error.message });
    else if (uniqueNameError(error, 'configs')) res.status(409).json({ error: 'A config with this name already exists for the prompt' });
    else throw error;
  }
});

router.delete('/configs/:id', (req, res) => {
  if (!deleteConfig(Number(req.params.id))) {
    res.status(404).json({ error: 'Config not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
