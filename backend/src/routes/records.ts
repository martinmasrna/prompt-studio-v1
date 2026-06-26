import { Router } from 'express';
import {
  createComparison,
  createEvaluation,
  createIssue,
  deleteComparison,
  deleteEvaluation,
  deleteIssue,
  getEvaluation,
  getIssue,
  listIssues,
  listResults,
  updateComparisonNote,
  updateEvaluationNote,
  updateIssue,
  type EvaluationInput,
  type EvaluationSource,
  type IssueUpdate,
} from '../repositories/records';
import { entityBelongsToPrompt, entityExists } from '../repositories/entities';
import { ValidationError, numberInRange, stringRecord, PARAM_BOUNDS } from '../lib/validation';
import { generatePromptDoctorPrompt } from '../prompts/promptDoctor';

const router = Router();

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('request body must be an object');
  return value as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, field: string, allowEmpty = false): string {
  const value = body[field];
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new ValidationError(`${field} is required`);
  return allowEmpty ? value : value.trim();
}

function nullableString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string or null`);
  return value;
}

function nullableInteger(body: Record<string, unknown>, field: string): number | null {
  const value = body[field];
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || (value as number) <= 0) throw new ValidationError(`${field} must be a positive integer or null`);
  return value as number;
}

const ID_BOUNDS = { min: 1, max: Number.MAX_SAFE_INTEGER, integer: true };
const COUNT_BOUNDS = { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true };

function parseEvaluation(value: unknown): EvaluationInput {
  const body = objectBody(value);
  const source = requiredString(body, 'source') as EvaluationSource;
  if (!['sandbox', 'ab', 'manual'].includes(source)) throw new ValidationError('source is invalid');
  if (typeof body.enable_thinking !== 'boolean') throw new ValidationError('enable_thinking must be a boolean');
  if (!stringRecord(body.variables)) throw new ValidationError('variables must be an object whose values are strings');
  const variables = body.variables;
  return {
    test_case_id: nullableInteger(body, 'test_case_id'),
    prompt_id: numberInRange(body.prompt_id, 'prompt_id', ID_BOUNDS),
    version_id: numberInRange(body.version_id, 'version_id', ID_BOUNDS),
    source,
    prompt_name_snapshot: requiredString(body, 'prompt_name_snapshot'),
    test_name_snapshot: nullableString(body, 'test_name_snapshot'),
    version_name_snapshot: requiredString(body, 'version_name_snapshot'),
    prompt_template_snapshot: requiredString(body, 'prompt_template_snapshot', true),
    rendered_prompt_snapshot: requiredString(body, 'rendered_prompt_snapshot', true),
    variables,
    system_prompt: requiredString(body, 'system_prompt', true),
    temperature: numberInRange(body.temperature, 'temperature', PARAM_BOUNDS.temperature),
    top_p: numberInRange(body.top_p, 'top_p', PARAM_BOUNDS.top_p),
    top_k: numberInRange(body.top_k, 'top_k', PARAM_BOUNDS.top_k),
    max_tokens: numberInRange(body.max_tokens, 'max_tokens', PARAM_BOUNDS.max_tokens),
    enable_thinking: body.enable_thinking,
    model_id_snapshot: requiredString(body, 'model_id_snapshot'),
    model_label_snapshot: requiredString(body, 'model_label_snapshot'),
    upstream_model_snapshot: requiredString(body, 'upstream_model_snapshot'),
    response_text: nullableString(body, 'response_text'),
    error_text: nullableString(body, 'error_text'),
    tokens_used: body.tokens_used === null || body.tokens_used === undefined
      ? null : numberInRange(body.tokens_used, 'tokens_used', COUNT_BOUNDS),
    latency_ms: body.latency_ms === null || body.latency_ms === undefined
      ? null : numberInRange(body.latency_ms, 'latency_ms', COUNT_BOUNDS),
    executed_at: numberInRange(body.executed_at, 'executed_at', ID_BOUNDS),
  };
}

function validateLineage(input: EvaluationInput, promptId = input.prompt_id): void {
  if (input.prompt_id !== promptId || !entityExists('prompts', promptId)) throw new ValidationError('Prompt not found');
  if (!entityBelongsToPrompt('versions', input.version_id, promptId)) throw new ValidationError('Version does not belong to prompt');
  if (input.test_case_id !== null && !entityBelongsToPrompt('test_cases', input.test_case_id, promptId)) {
    throw new ValidationError('Test case does not belong to prompt');
  }
}

function handleValidation(res: import('express').Response, error: unknown): boolean {
  if (!(error instanceof ValidationError)) return false;
  res.status(error.message === 'Prompt not found' ? 404 : 400).json({ error: error.message });
  return true;
}

function positiveParam(value: string, field: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError(`${field} is invalid`);
  return id;
}

function parseIssueUpdate(
  body: Record<string, unknown>,
  existing: NonNullable<ReturnType<typeof getIssue>>
): IssueUpdate {
  const values: IssueUpdate = {};
  if ('title' in body) values.title = requiredString(body, 'title');
  if ('note' in body) values.note = nullableString(body, 'note');
  if ('status' in body) {
    if (body.status !== 'open' && body.status !== 'diagnosed' && body.status !== 'closed') {
      throw new ValidationError('status must be open, diagnosed, or closed');
    }
    values.status = body.status;
  }
  if ('resolution_note' in body) values.resolution_note = nullableString(body, 'resolution_note');
  if ('resolved_version_id' in body) {
    values.resolved_version_id = nullableInteger(body, 'resolved_version_id');
    if (values.resolved_version_id !== null) {
      if (existing.prompt_id === null || !entityBelongsToPrompt('versions', values.resolved_version_id, existing.prompt_id)) {
        throw new ValidationError('Resolved version does not belong to issue prompt');
      }
    }
  }
  return values;
}

router.get('/prompts/:promptId/results', (req, res) => {
  const promptId = Number(req.params.promptId);
  if (!Number.isInteger(promptId) || !entityExists('prompts', promptId)) {
    res.status(404).json({ error: 'Prompt not found' }); return;
  }
  res.json(listResults(promptId));
});

router.post('/evaluations', (req, res) => {
  try {
    const input = parseEvaluation(req.body);
    validateLineage(input);
    res.status(201).json(createEvaluation(input));
  } catch (error) {
    if (!handleValidation(res, error)) throw error;
  }
});

router.post('/comparisons', (req, res) => {
  try {
    const body = objectBody(req.body);
    const promptId = numberInRange(body.prompt_id, 'prompt_id', ID_BOUNDS);
    if (!Array.isArray(body.items) || body.items.length !== 2) {
      throw new ValidationError('comparisons require exactly two evaluations');
    }
    const items = body.items.map(item => {
      const wrapper = objectBody(item);
      if ('evaluation_id' in wrapper) {
        const evaluationId = nullableInteger(wrapper, 'evaluation_id');
        if (evaluationId === null) throw new ValidationError('evaluation_id is required');
        const existing = getEvaluation(evaluationId);
        if (!existing || existing.prompt_id !== promptId) throw new ValidationError('Evaluation does not belong to prompt');
        if (existing.batch_id !== null) throw new ValidationError('Evaluation already belongs to a comparison');
        return evaluationId;
      }
      const input = parseEvaluation(wrapper.evaluation);
      validateLineage(input, promptId);
      return input;
    }) as [EvaluationInput | number, EvaluationInput | number];
    res.status(201).json(createComparison(promptId, items));
  } catch (error) {
    if (!handleValidation(res, error)) throw error;
  }
});

router.patch('/evaluations/:id', (req, res) => {
  try {
    const body = objectBody(req.body);
    if (!('note' in body)) { res.status(400).json({ error: 'note is required' }); return; }
    const updated = updateEvaluationNote(Number(req.params.id), nullableString(body, 'note'));
    if (!updated) { res.status(404).json({ error: 'Evaluation not found' }); return; }
    res.json(updated);
  } catch (error) {
    if (!handleValidation(res, error)) throw error;
  }
});

router.patch('/comparisons/:id', (req, res) => {
  try {
    const body = objectBody(req.body);
    if (!('note' in body)) { res.status(400).json({ error: 'note is required' }); return; }
    const updated = updateComparisonNote(Number(req.params.id), nullableString(body, 'note'));
    if (!updated) { res.status(404).json({ error: 'Comparison not found' }); return; }
    res.json(updated);
  } catch (error) {
    if (!handleValidation(res, error)) throw error;
  }
});

router.delete('/evaluations/:id', (req, res) => {
  const outcome = deleteEvaluation(Number(req.params.id));
  if (outcome === 'missing') { res.status(404).json({ error: 'Evaluation not found' }); return; }
  if (outcome === 'batched') { res.status(409).json({ error: 'Delete the containing comparison instead' }); return; }
  res.json({ ok: true });
});

router.delete('/comparisons/:id', (req, res) => {
  const outcome = deleteComparison(Number(req.params.id));
  if (outcome === 'missing') { res.status(404).json({ error: 'Comparison not found' }); return; }
  res.json({ ok: true });
});

router.get('/prompts/:promptId/issues', (req, res) => {
  const promptId = Number(req.params.promptId);
  if (!Number.isInteger(promptId) || !entityExists('prompts', promptId)) {
    res.status(404).json({ error: 'Prompt not found' }); return;
  }
  res.json(listIssues(promptId));
});

router.get('/evaluations/:evaluationId/issue', (req, res) => {
  try {
    const issue = getIssue(positiveParam(req.params.evaluationId, 'evaluation_id'));
    if (!issue) { res.status(404).json({ error: 'Issue not found' }); return; }
    res.json(issue);
  } catch (error) {
    if (!handleValidation(res, error)) throw error;
  }
});

router.post('/evaluations/:evaluationId/issue', (req, res) => {
  try {
    const evaluationId = positiveParam(req.params.evaluationId, 'evaluation_id');
    if (!getEvaluation(evaluationId)) { res.status(404).json({ error: 'Evaluation not found' }); return; }
    const body = objectBody(req.body);
    const issue = createIssue(requiredString(body, 'title'), nullableString(body, 'note'), evaluationId);
    if (issue === 'duplicate') { res.status(409).json({ error: 'Result is already flagged as an issue' }); return; }
    res.status(201).json(issue);
  } catch (error) {
    if (!handleValidation(res, error)) throw error;
  }
});

router.patch('/evaluations/:evaluationId/issue', (req, res) => {
  try {
    const evaluationId = positiveParam(req.params.evaluationId, 'evaluation_id');
    const existing = getIssue(evaluationId);
    if (!existing) { res.status(404).json({ error: 'Issue not found' }); return; }
    const issue = updateIssue(evaluationId, parseIssueUpdate(objectBody(req.body), existing));
    res.json(issue);
  } catch (error) {
    if (!handleValidation(res, error)) throw error;
  }
});

router.delete('/evaluations/:evaluationId/issue', (req, res) => {
  try {
    const evaluationId = positiveParam(req.params.evaluationId, 'evaluation_id');
    if (!deleteIssue(evaluationId)) { res.status(404).json({ error: 'Issue not found' }); return; }
    res.json({ ok: true });
  } catch (error) {
    if (!handleValidation(res, error)) throw error;
  }
});

router.get('/evaluations/:evaluationId/issue/prompt-doctor', (req, res) => {
  try {
    const issue = getIssue(positiveParam(req.params.evaluationId, 'evaluation_id'));
    if (!issue) { res.status(404).json({ error: 'Issue not found' }); return; }
    res.json({ prompt: generatePromptDoctorPrompt(issue) });
  } catch (error) {
    if (!handleValidation(res, error)) throw error;
  }
});

router.post('/prompts/:promptId/issues', (req, res) => {
  try {
    const promptId = Number(req.params.promptId);
    if (!Number.isInteger(promptId) || !entityExists('prompts', promptId)) throw new ValidationError('Prompt not found');
    const body = objectBody(req.body);
    const title = requiredString(body, 'title');
    const note = nullableString(body, 'note');
    const evaluationId = nullableInteger(body, 'evaluation_id');
    const evaluationInput = body.evaluation === undefined ? undefined : parseEvaluation(body.evaluation);
    if (evaluationId !== null && evaluationInput) throw new ValidationError('provide evaluation_id or evaluation, not both');
    if (evaluationId === null && !evaluationInput) throw new ValidationError('Issue requires a linked result');
    if (evaluationInput) validateLineage(evaluationInput, promptId);
    if (evaluationId !== null) {
      const evaluation = getEvaluation(evaluationId);
      if (!evaluation || evaluation.prompt_id !== promptId) throw new ValidationError('Evaluation does not belong to prompt');
    }
    const issue = createIssue(title, note, evaluationId, evaluationInput);
    if (issue === 'duplicate') { res.status(409).json({ error: 'Result is already flagged as an issue' }); return; }
    res.status(201).json(issue);
  } catch (error) {
    if (!handleValidation(res, error)) throw error;
  }
});

export default router;
