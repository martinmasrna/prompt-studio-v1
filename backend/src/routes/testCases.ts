import { Router } from 'express';
import {
  createTestCase,
  deleteTestCase,
  getTestCase,
  listTestCases,
  promptExists,
  updateTestCase,
  type TestCaseValues,
} from '../repositories/testCases';

const router = Router();

const DEFAULTS: Omit<TestCaseValues, 'name'> = {
  description: null,
  variables: {},
  system_prompt: '',
  temperature: 0.7,
  top_p: 1,
  top_k: 40,
  max_tokens: 1024,
  enable_thinking: false,
};

class ValidationError extends Error {}

function stringRecord(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every(item => typeof item === 'string');
}

function validateNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
  integer = false
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`${field} must be a number between ${min} and ${max}`);
  }
  if (integer && !Number.isInteger(value)) throw new ValidationError(`${field} must be an integer`);
  return value;
}

function parseValues(body: unknown, partial: boolean): Partial<TestCaseValues> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('request body must be an object');
  }
  const input = body as Record<string, unknown>;
  const result: Partial<TestCaseValues> = {};

  if (!partial || 'name' in input) {
    if (typeof input.name !== 'string' || !input.name.trim()) {
      throw new ValidationError('name is required');
    }
    result.name = input.name.trim();
  }
  if ('description' in input) {
    if (input.description !== null && typeof input.description !== 'string') {
      throw new ValidationError('description must be a string or null');
    }
    result.description = typeof input.description === 'string' && input.description.trim()
      ? input.description.trim()
      : null;
  }
  if ('variables' in input) {
    if (!stringRecord(input.variables)) {
      throw new ValidationError('variables must be an object whose values are strings');
    }
    result.variables = input.variables;
  }
  if ('system_prompt' in input) {
    if (typeof input.system_prompt !== 'string') throw new ValidationError('system_prompt must be a string');
    result.system_prompt = input.system_prompt;
  }
  if ('temperature' in input) result.temperature = validateNumber(input.temperature, 'temperature', 0, 2);
  if ('top_p' in input) result.top_p = validateNumber(input.top_p, 'top_p', 0, 1);
  if ('top_k' in input) result.top_k = validateNumber(input.top_k, 'top_k', 1, 200, true);
  if ('max_tokens' in input) result.max_tokens = validateNumber(input.max_tokens, 'max_tokens', 64, 32768, true);
  if ('enable_thinking' in input) {
    if (typeof input.enable_thinking !== 'boolean') {
      throw new ValidationError('enable_thinking must be a boolean');
    }
    result.enable_thinking = input.enable_thinking;
  }
  return result;
}

function isUniqueNameError(error: unknown): boolean {
  return error instanceof Error
    && error.message.includes('UNIQUE constraint failed: test_cases.prompt_id, test_cases.name');
}

router.get('/prompts/:promptId/test-cases', (req, res) => {
  const promptId = Number(req.params.promptId);
  if (!Number.isInteger(promptId) || !promptExists(promptId)) {
    res.status(404).json({ error: 'Prompt not found' });
    return;
  }
  res.json(listTestCases(promptId));
});

router.post('/prompts/:promptId/test-cases', (req, res) => {
  const promptId = Number(req.params.promptId);
  if (!Number.isInteger(promptId) || !promptExists(promptId)) {
    res.status(404).json({ error: 'Prompt not found' });
    return;
  }
  try {
    const parsed = parseValues(req.body, false) as Pick<TestCaseValues, 'name'> & Partial<TestCaseValues>;
    const testCase = createTestCase(promptId, { ...DEFAULTS, ...parsed });
    res.status(201).json(testCase);
  } catch (error) {
    if (error instanceof ValidationError) res.status(400).json({ error: error.message });
    else if (isUniqueNameError(error)) res.status(409).json({ error: 'A test with this name already exists for the prompt' });
    else throw error;
  }
});

router.get('/test-cases/:id', (req, res) => {
  const testCase = getTestCase(Number(req.params.id));
  if (!testCase) { res.status(404).json({ error: 'Test case not found' }); return; }
  res.json(testCase);
});

router.patch('/test-cases/:id', (req, res) => {
  try {
    const values = parseValues(req.body, true);
    const testCase = updateTestCase(Number(req.params.id), values);
    if (!testCase) { res.status(404).json({ error: 'Test case not found' }); return; }
    res.json(testCase);
  } catch (error) {
    if (error instanceof ValidationError) res.status(400).json({ error: error.message });
    else if (isUniqueNameError(error)) res.status(409).json({ error: 'A test with this name already exists for the prompt' });
    else throw error;
  }
});

router.delete('/test-cases/:id', (req, res) => {
  if (!deleteTestCase(Number(req.params.id))) {
    res.status(404).json({ error: 'Test case not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
