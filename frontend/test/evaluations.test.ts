import { beforeEach, describe, expect, it } from 'vitest';
import { activePromptData, activeSystemPrompt, variableValues, versions } from '../src/store/editor';
import { activeModelId, availableModels } from '../src/store/settings';
import { selectedTestCaseId, testCases } from '../src/store/testCases';
import {
  enableThinking, maxTokens, temperature, topK, topP,
} from '../src/store/configs';
import { captureEvaluationContext, completeEvaluation } from '../src/utils/evaluations';

beforeEach(() => {
  activePromptData.value = {
    id: 5,
    name: 'Prompt',
    current_version: null,
  };
  versions.value = [{
    id: 8, name: 'v2', text: 'Ask {{query}}', note: null, is_current: 1,
    system_prompt: 'System', default_config_id: null,
  }];
  variableValues.value = { query: 'original', unused: 'kept' };
  availableModels.value = [{ id: 'gemma', label: 'Gemma', model: 'gemma.gguf', uri: 'http://private' }];
  activeModelId.value = 'gemma';
  testCases.value = [{
    id: 3, prompt_id: 5, name: 'Scenario', description: null,
    variables: { query: 'original' }, created_at: 1, updated_at: 1,
  }];
  selectedTestCaseId.value = 3;
  activeSystemPrompt.value = 'System';
  temperature.value = 0.2;
  topP.value = 0.8;
  topK.value = 20;
  maxTokens.value = 512;
  enableThinking.value = true;
});

describe('evaluation snapshots', () => {
  it('captures request state before later editor changes', () => {
    const context = captureEvaluationContext('sandbox', 8, 'Ask {{query}}', 'Ask original');

    variableValues.value.query = 'changed later';
    temperature.value = 1.5;
    versions.value[0].text = 'Different template';

    expect(context.variables).toEqual({ query: 'original', unused: 'kept' });
    expect(context.temperature).toBe(0.2);
    expect(context.prompt_template_snapshot).toBe('Ask {{query}}');
    expect(context.model_label_snapshot).toBe('Gemma');
    expect(context.test_name_snapshot).toBe('Scenario');
  });

  it('adds the exact response and metrics without changing the context', () => {
    const context = captureEvaluationContext('ab', 8, 'Ask {{query}}', 'Ask original');
    const evaluation = completeEvaluation(context, {
      text: 'Answer', tokens_used: 4, latency_ms: 12,
    });
    expect(evaluation).toMatchObject({
      source: 'ab', response_text: 'Answer', error_text: null,
      tokens_used: 4, latency_ms: 12, rendered_prompt_snapshot: 'Ask original',
    });
  });
});
