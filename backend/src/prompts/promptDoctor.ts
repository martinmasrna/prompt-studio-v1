import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Issue } from '../repositories/records';

const TEMPLATE_PATH = path.join(__dirname, '../../prompts/prompt-doctor.md');
const PLACEHOLDER_PATTERN = /{{([\s\S]*?)}}/g;
const EXPRESSION_PATTERN = /^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)(?:\s*\|\s*(json))?$/;
const NOT_PROVIDED = '(not provided)';

type PromptDoctorEvaluation = Pick<NonNullable<Issue['evaluation']>,
  'prompt_name_snapshot' | 'version_name_snapshot' | 'test_name_snapshot' | 'source' |
  'system_prompt' | 'prompt_template_snapshot' | 'variables' | 'rendered_prompt_snapshot' |
  'response_text' | 'error_text' | 'model_id_snapshot' | 'model_label_snapshot' |
  'upstream_model_snapshot' | 'temperature' | 'top_p' | 'top_k' | 'max_tokens' |
  'enable_thinking' | 'tokens_used' | 'latency_ms' | 'executed_at'
>;

export interface PromptDoctorContext {
  issue: Pick<Issue, 'title' | 'note' | 'status'>;
  evaluation: PromptDoctorEvaluation;
}

function resolvePath(context: object, expression: string): unknown {
  let value: unknown = context;
  for (const segment of expression.split('.')) {
    if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, segment)) {
      throw new Error(`Unknown Prompt Doctor placeholder: ${expression}`);
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function formatValue(value: unknown, expression: string, formatter?: 'json'): string {
  if (value === null || value === undefined || value === '') return NOT_PROVIDED;
  if (formatter === 'json') return JSON.stringify(value, null, 2);
  if (typeof value === 'object') {
    throw new Error(`Prompt Doctor placeholder ${expression} contains an object; use "| json"`);
  }
  return String(value);
}

/**
 * Renders only placeholders present in the template. Values inserted by a
 * replacement are never scanned again, so saved prompts may safely contain
 * their own {{variable}} syntax.
 */
export function renderPromptTemplate(template: string, context: object): string {
  return template.replace(PLACEHOLDER_PATTERN, (_placeholder, rawExpression: string) => {
    const expression = rawExpression.trim();
    const parsed = EXPRESSION_PATTERN.exec(expression);
    if (!parsed) throw new Error(`Invalid Prompt Doctor placeholder: {{${rawExpression}}}`);
    const [, propertyPath, formatter] = parsed;
    return formatValue(resolvePath(context, propertyPath), propertyPath, formatter as 'json' | undefined);
  });
}

export function buildPromptDoctorContext(issue: Issue): PromptDoctorContext {
  const evaluation = issue.evaluation;
  return {
    issue: {
      title: issue.title,
      note: issue.note,
      status: issue.status,
    },
    evaluation: {
      prompt_name_snapshot: evaluation.prompt_name_snapshot,
      version_name_snapshot: evaluation.version_name_snapshot,
      test_name_snapshot: evaluation.test_name_snapshot,
      source: evaluation.source,
      system_prompt: evaluation.system_prompt,
      prompt_template_snapshot: evaluation.prompt_template_snapshot,
      variables: evaluation.variables,
      rendered_prompt_snapshot: evaluation.rendered_prompt_snapshot,
      response_text: evaluation.response_text,
      error_text: evaluation.error_text,
      model_id_snapshot: evaluation.model_id_snapshot,
      model_label_snapshot: evaluation.model_label_snapshot,
      upstream_model_snapshot: evaluation.upstream_model_snapshot,
      temperature: evaluation.temperature,
      top_p: evaluation.top_p,
      top_k: evaluation.top_k,
      max_tokens: evaluation.max_tokens,
      enable_thinking: evaluation.enable_thinking,
      tokens_used: evaluation.tokens_used,
      latency_ms: evaluation.latency_ms,
      executed_at: evaluation.executed_at,
    },
  };
}

export function generatePromptDoctorPrompt(issue: Issue): string {
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  return renderPromptTemplate(template, buildPromptDoctorContext(issue));
}
