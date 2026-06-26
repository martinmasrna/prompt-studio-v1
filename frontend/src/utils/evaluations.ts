import type { EvaluationInput, EvaluationSource, SandboxRunResult } from '../api';
import { activePromptData, activeSystemPrompt, variableValues, versions } from '../store/editor';
import { activeModelId, availableModels } from '../store/settings';
import { selectedTestCase } from '../store/testCases';
import { enableThinking, maxTokens, temperature, topK, topP } from '../store/configs';

export type EvaluationContext = Omit<
  EvaluationInput,
  'response_text' | 'error_text' | 'tokens_used' | 'latency_ms'
>;

// The system prompt and sampling parameters default to the live editor/config
// state (the sandbox), but the A·B tester runs each side with its own version's
// system prompt and its own config's parameters, so it passes them explicitly.
export interface RunSettings {
  system_prompt: string;
  temperature: number;
  top_p: number;
  top_k: number;
  max_tokens: number;
  enable_thinking: boolean;
}

export function captureEvaluationContext(
  source: EvaluationSource,
  versionId: number,
  template: string,
  rendered: string,
  settings?: RunSettings
): EvaluationContext {
  const prompt = activePromptData.value;
  const version = versions.value.find(item => item.id === versionId);
  if (!prompt || !version) throw new Error('Cannot capture a run without a prompt and version');
  const model = availableModels.value.find(item => item.id === activeModelId.value);
  const fallbackModel = activeModelId.value ?? 'unknown';

  const effective: RunSettings = settings ?? {
    system_prompt: activeSystemPrompt.value,
    temperature: temperature.value,
    top_p: topP.value,
    top_k: topK.value,
    max_tokens: maxTokens.value,
    enable_thinking: enableThinking.value,
  };

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
    system_prompt: effective.system_prompt,
    temperature: effective.temperature,
    top_p: effective.top_p,
    top_k: effective.top_k,
    max_tokens: effective.max_tokens,
    enable_thinking: effective.enable_thinking,
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

// The request body /api/llm/run expects. An empty system prompt is sent as
// undefined (omitted) rather than an empty string.
export function buildRunRequest(userMessage: string, settings: RunSettings, modelId: string | null) {
  return {
    user_message: userMessage,
    model_id: modelId ?? undefined,
    system_prompt: settings.system_prompt || undefined,
    temperature: settings.temperature,
    top_p: settings.top_p,
    top_k: settings.top_k,
    max_tokens: settings.max_tokens,
    enable_thinking: settings.enable_thinking,
  };
}
