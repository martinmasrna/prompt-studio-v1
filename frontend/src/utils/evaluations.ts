import type { EvaluationInput, EvaluationSource, SandboxRunResult } from '../api';
import { activePromptData, variableValues, versions } from '../store/editor';
import { activeModelId, availableModels } from '../store/settings';
import {
  enableThinking, maxTokens, selectedTestCase, systemPrompt,
  temperature, topK, topP,
} from '../store/testCases';

export type EvaluationContext = Omit<
  EvaluationInput,
  'response_text' | 'error_text' | 'tokens_used' | 'latency_ms'
>;

export function captureEvaluationContext(
  source: EvaluationSource,
  versionId: number,
  template: string,
  rendered: string
): EvaluationContext {
  const prompt = activePromptData.value;
  const version = versions.value.find(item => item.id === versionId);
  if (!prompt || !version) throw new Error('Cannot capture a run without a prompt and version');
  const model = availableModels.value.find(item => item.id === activeModelId.value);
  const fallbackModel = activeModelId.value ?? 'unknown';

  return {
    test_case_id: selectedTestCase.value?.id ?? null,
    prompt_id: prompt.id,
    version_id: version.id,
    source,
    prompt_name_snapshot: prompt.name,
    test_name_snapshot: selectedTestCase.value?.name ?? null,
    version_name_snapshot: version.name,
    prompt_template_snapshot: template,
    rendered_prompt_snapshot: rendered,
    variables: { ...variableValues.value },
    system_prompt: systemPrompt.value,
    temperature: temperature.value,
    top_p: topP.value,
    top_k: topK.value,
    max_tokens: maxTokens.value,
    enable_thinking: enableThinking.value,
    model_id_snapshot: model?.id ?? fallbackModel,
    model_label_snapshot: model?.label ?? fallbackModel,
    upstream_model_snapshot: model?.model ?? fallbackModel,
    executed_at: Math.floor(Date.now() / 1000),
  };
}

export function completeEvaluation(
  context: EvaluationContext,
  result: SandboxRunResult
): EvaluationInput {
  return {
    ...context,
    response_text: result.text,
    error_text: null,
    tokens_used: result.tokens_used,
    latency_ms: result.latency_ms,
  };
}
