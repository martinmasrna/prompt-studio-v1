import { Router } from 'express';
import {
  createComparison,
  createEvaluation,
  createIssue,
  deleteComparison,
  deleteEvaluation,
  deleteIssue,
  entityBelongsToPrompt,
  entityExists,
  getEvaluation,
  getIssue,
  listIssues,
  listResults,
  updateIssue,
  type EvaluationInput,
  type EvaluationSource,
  type IssueStatus,
} from '../repositories/records';
import { generatePromptDoctorPrompt } from '../prompts/promptDoctor';

const router = Router();
class ValidationError extends Error {}

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

function numberField(body: Record<string, unknown>, field: string, min: number, max: number, integer = false): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new ValidationError(`${field} is invalid`);
  }
  return value;
}

function nullableInteger(body: Record<string, unknown>, field: string): number | null {
  const value = body[field];
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || (value as number) <= 0) throw new ValidationError(`${field} must be a positive integer or null`);
  return value as number;
}

function variablesField(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(item => typeof item !== 'string')) {
    throw new ValidationError('variables must be an object whose values are strings');
  }
  return value as Record<string, string>;
}

function parseEvaluation(value: unknown): EvaluationInput {
  const body = objectBody(value);
  const source = requiredString(body, 'source') as EvaluationSource;
  if (!['sandbox', 'ab', 'manual'].includes(source)) throw new ValidationError('source is invalid');
  if (typeof body.enable_thinking !== 'boolean') throw new ValidationError('enable_thinking must be a boolean');
  return {
    test_case_id: nullableInteger(body, 'test_case_id'),
    prompt_id: numberField(body, 'prompt_id', 1, Number.MAX_SAFE_INTEGER, true),
    version_id: numberField(body, 'version_id', 1, Number.MAX_SAFE_INTEGER, true),
    source,
    prompt_name_snapshot: requiredString(body, 'prompt_name_snapshot'),
    test_name_snapshot: nullableString(body, 'test_name_snapshot'),
    version_name_snapshot: requiredString(body, 'version_name_snapshot'),
    prompt_template_snapshot: requiredString(body, 'prompt_template_snapshot', true),
    rendered_prompt_snapshot: requiredString(body, 'rendered_prompt_snapshot', true),
    variables: variablesField(body.variables),
    system_prompt: requiredString(body, 'system_prompt', true),
    temperature: numberField(body, 'temperature', 0, 2),
    top_p: numberField(body, 'top_p', 0, 1),
    top_k: numberField(body, 'top_k', 1, 200, true),
    max_tokens: numberField(body, 'max_tokens', 64, 32768, true),
    enable_thinking: body.enable_thinking,
    model_id_snapshot: requiredString(body, 'model_id_snapshot'),
    model_label_snapshot: requiredString(body, 'model_label_snapshot'),
    upstream_model_snapshot: requiredString(body, 'upstream_model_snapshot'),
    response_text: nullableString(body, 'response_text'),
    error_text: nullableString(body, 'error_text'),
    tokens_used: body.tokens_used === null || body.tokens_used === undefined
      ? null : numberField(body, 'tokens_used', 0, Number.MAX_SAFE_INTEGER, true),
    latency_ms: body.latency_ms === null || body.latency_ms === undefined
      ? null : numberField(body, 'latency_ms', 0, Number.MAX_SAFE_INTEGER, true),
    executed_at: numberField(body, 'executed_at', 1, Number.MAX_SAFE_INTEGER, true),
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
    const promptId = numberField(body, 'prompt_id', 1, Number.MAX_SAFE_INTEGER, true);
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

router.delete('/evaluations/:id', (req, res) => {
  const outcome = deleteEvaluation(Number(req.params.id));
  if (outcome === 'missing') { res.status(404).json({ error: 'Evaluation not found' }); return; }
  if (outcome === 'linked') { res.status(409).json({ error: 'Delete linked issues before deleting this result' }); return; }
  if (outcome === 'batched') { res.status(409).json({ error: 'Delete the containing comparison instead' }); return; }
  res.json({ ok: true });
});

router.delete('/comparisons/:id', (req, res) => {
  const outcome = deleteComparison(Number(req.params.id));
  if (outcome === 'missing') { res.status(404).json({ error: 'Comparison not found' }); return; }
  if (outcome === 'linked') { res.status(409).json({ error: 'Delete linked issues before deleting this comparison' }); return; }
  res.json({ ok: true });
});

router.get('/prompts/:promptId/issues', (req, res) => {
  const promptId = Number(req.params.promptId);
  if (!Number.isInteger(promptId) || !entityExists('prompts', promptId)) {
    res.status(404).json({ error: 'Prompt not found' }); return;
  }
  res.json(listIssues(promptId));
});

router.get('/issues/:id/prompt-doctor', (req, res) => {
  const issue = getIssue(Number(req.params.id));
  if (!issue) { res.status(404).json({ error: 'Issue not found' }); return; }
  if (!issue.evaluation) {
    res.status(409).json({ error: 'Prompt Doctor requires a linked evaluation' }); return;
  }
  res.json({ prompt: generatePromptDoctorPrompt(issue) });
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
    if (evaluationInput) validateLineage(evaluationInput, promptId);
    if (evaluationId !== null) {
      const evaluation = getEvaluation(evaluationId);
      if (!evaluation || evaluation.prompt_id !== promptId) throw new ValidationError('Evaluation does not belong to prompt');
    }
    res.status(201).json(createIssue(promptId, title, note, evaluationId, evaluationInput));
  } catch (error) {
    if (!handleValidation(res, error)) throw error;
  }
});

router.patch('/issues/:id', (req, res) => {
  try {
    const body = objectBody(req.body);
    const values: Partial<{
      title: string;
      note: string | null;
      status: IssueStatus;
      resolution_note: string | null;
      resolved_version_id: number | null;
    }> = {};
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
        const existing = getIssue(Number(req.params.id));
        if (!existing) { res.status(404).json({ error: 'Issue not found' }); return; }
        if (existing.prompt_id === null || !entityBelongsToPrompt('versions', values.resolved_version_id, existing.prompt_id)) {
          throw new ValidationError('Resolved version does not belong to issue prompt');
        }
      }
    }
    const issue = updateIssue(Number(req.params.id), values);
    if (!issue) { res.status(404).json({ error: 'Issue not found' }); return; }
    res.json(issue);
  } catch (error) {
    if (!handleValidation(res, error)) throw error;
  }
});

router.delete('/issues/:id', (req, res) => {
  if (!deleteIssue(Number(req.params.id))) { res.status(404).json({ error: 'Issue not found' }); return; }
  res.json({ ok: true });
});

export default router;
