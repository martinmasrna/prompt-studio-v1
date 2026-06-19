import assert from 'node:assert/strict';
import test from 'node:test';
import { jsonRequest, requestJson, startTestServer } from './helpers/testServer';

test('results, comparisons, and issues API', async t => {
  const server = await startTestServer();
  t.after(() => server.close());

  const prompt = await requestJson<{ id: number }>(
    server.baseUrl, '/api/prompts', jsonRequest('POST', { name: 'Evaluation prompt' })
  );
  const detail = await requestJson<{ current_version: { id: number; name: string; text: string } }>(
    server.baseUrl, `/api/prompts/${prompt.body.id}`
  );
  const baseEvaluation = {
    test_case_id: null,
    prompt_id: prompt.body.id,
    version_id: detail.body.current_version.id,
    source: 'sandbox',
    prompt_name_snapshot: 'Evaluation prompt',
    test_name_snapshot: null,
    version_name_snapshot: 'v1',
    prompt_template_snapshot: 'Answer {{query}}',
    rendered_prompt_snapshot: 'Answer poker odds',
    variables: { query: 'poker odds' },
    system_prompt: '',
    temperature: 0.7,
    top_p: 1,
    top_k: 40,
    max_tokens: 1024,
    enable_thinking: false,
    model_id_snapshot: 'gemma',
    model_label_snapshot: 'Gemma',
    upstream_model_snapshot: 'gemma.gguf',
    response_text: '33%',
    error_text: null,
    tokens_used: 3,
    latency_ms: 15,
    executed_at: 1_750_000_000,
  };

  let evaluationId = 0;
  await t.test('saves and lists an immutable evaluation snapshot', async () => {
    const created = await requestJson<typeof baseEvaluation & { id: number }>(
      server.baseUrl, '/api/evaluations', jsonRequest('POST', baseEvaluation)
    );
    assert.equal(created.response.status, 201);
    evaluationId = created.body.id;
    assert.deepEqual(created.body.variables, { query: 'poker odds' });
    assert.equal(created.body.rendered_prompt_snapshot, 'Answer poker odds');
    const results = await requestJson<{ evaluations: Array<{ id: number }>; comparisons: unknown[] }>(
      server.baseUrl, `/api/prompts/${prompt.body.id}/results`
    );
    assert.deepEqual(results.body.evaluations.map(item => item.id), [evaluationId]);
    assert.deepEqual(results.body.comparisons, []);
  });

  await t.test('accepts realistic long-document snapshots', async () => {
    const longText = 'študijný text\n'.repeat(12_000);
    const created = await requestJson<{ id: number; variables: { studyText: string } }>(
      server.baseUrl,
      '/api/evaluations',
      jsonRequest('POST', {
        ...baseEvaluation,
        rendered_prompt_snapshot: `Analyze:\n${longText}`,
        variables: { studyText: longText },
      })
    );
    assert.equal(created.response.status, 201);
    assert.equal(created.body.variables.studyText, longText);
    assert.equal((await fetch(`${server.baseUrl}/api/evaluations/${created.body.id}`, { method: 'DELETE' })).status, 200);
  });

  let issueId = 0;
  let manualIssueId = 0;
  await t.test('creates linked and manual issues with open/closed lifecycle', async () => {
    const linked = await requestJson<{ id: number; status: string; evaluation_id: number }>(
      server.baseUrl,
      `/api/prompts/${prompt.body.id}/issues`,
      jsonRequest('POST', { title: 'Wrong answer', note: 'Expected 33%', evaluation_id: evaluationId })
    );
    assert.equal(linked.response.status, 201);
    assert.equal(linked.body.status, 'open');
    assert.equal(linked.body.evaluation_id, evaluationId);
    issueId = linked.body.id;

    const manual = await requestJson<{ id: number; evaluation_id: null; status: string }>(
      server.baseUrl,
      `/api/prompts/${prompt.body.id}/issues`,
      jsonRequest('POST', { title: 'Manual issue' })
    );
    assert.equal(manual.body.evaluation_id, null);
    assert.equal(manual.body.status, 'open');
    manualIssueId = manual.body.id;

    const diagnosed = await requestJson<{
      status: string;
      title: string;
      resolution_note: string;
      resolved_version_id: number;
      resolved_version: { id: number; name: string };
    }>(
      server.baseUrl,
      `/api/issues/${issueId}`,
      jsonRequest('PATCH', {
        status: 'diagnosed',
        title: 'Confirmed wrong answer',
        resolution_note: 'Prompt Doctor found missing context.',
        resolved_version_id: detail.body.current_version.id,
      })
    );
    assert.equal(diagnosed.body.status, 'diagnosed');
    assert.equal(diagnosed.body.title, 'Confirmed wrong answer');
    assert.equal(diagnosed.body.resolution_note, 'Prompt Doctor found missing context.');
    assert.equal(diagnosed.body.resolved_version_id, detail.body.current_version.id);
    assert.equal(diagnosed.body.resolved_version.name, 'v1');

    const closed = await requestJson<{ status: string; resolution_note: string }>(
      server.baseUrl,
      `/api/issues/${issueId}`,
      jsonRequest('PATCH', {
        status: 'closed',
        resolution_note: 'Prompt Doctor found missing context. Fix verified.',
      })
    );
    assert.equal(closed.body.status, 'closed');
    assert.match(closed.body.resolution_note, /Fix verified/);
  });

  await t.test('generates Prompt Doctor evidence only for linked issues', async () => {
    const generated = await requestJson<{ prompt: string }>(
      server.baseUrl, `/api/issues/${issueId}/prompt-doctor`
    );
    assert.equal(generated.response.status, 200);
    assert.match(generated.body.prompt, /Confirmed wrong answer/);
    assert.match(generated.body.prompt, /"query": "poker odds"/);
    assert.match(generated.body.prompt, /Answer \{\{query\}\}/);
    assert.doesNotMatch(generated.body.prompt, /\{\{\s*evaluation\./);

    assert.equal(
      (await fetch(`${server.baseUrl}/api/issues/${manualIssueId}/prompt-doctor`)).status,
      409
    );
    assert.equal(
      (await fetch(`${server.baseUrl}/api/issues/999999/prompt-doctor`)).status,
      404
    );
  });

  await t.test('protects linked evidence, then allows deletion after issue removal', async () => {
    assert.equal((await fetch(`${server.baseUrl}/api/evaluations/${evaluationId}`, { method: 'DELETE' })).status, 409);
    assert.equal((await fetch(`${server.baseUrl}/api/issues/${issueId}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${server.baseUrl}/api/evaluations/${evaluationId}`, { method: 'DELETE' })).status, 200);
  });

  await t.test('atomically flags an unsaved result', async () => {
    const issue = await requestJson<{ evaluation_id: number; evaluation: { response_text: string } }>(
      server.baseUrl,
      `/api/prompts/${prompt.body.id}/issues`,
      jsonRequest('POST', { title: 'One click', evaluation: { ...baseEvaluation, response_text: 'bad output' } })
    );
    assert.equal(issue.response.status, 201);
    assert.ok(issue.body.evaluation_id);
    assert.equal(issue.body.evaluation.response_text, 'bad output');
  });

  await t.test('saves a comparison while reusing an already saved side', async () => {
    const sideA = await requestJson<{ id: number }>(
      server.baseUrl, '/api/evaluations', jsonRequest('POST', { ...baseEvaluation, source: 'ab', response_text: 'A' })
    );
    const comparison = await requestJson<{ id: number; evaluations: Array<{ id: number; response_text: string }> }>(
      server.baseUrl,
      '/api/comparisons',
      jsonRequest('POST', {
        prompt_id: prompt.body.id,
        items: [
          { evaluation_id: sideA.body.id },
          { evaluation: { ...baseEvaluation, source: 'ab', response_text: 'B' } },
        ],
      })
    );
    assert.equal(comparison.response.status, 201);
    assert.equal(comparison.body.evaluations[0].id, sideA.body.id);
    assert.deepEqual(comparison.body.evaluations.map(item => item.response_text), ['A', 'B']);
    assert.equal((await fetch(`${server.baseUrl}/api/evaluations/${sideA.body.id}`, { method: 'DELETE' })).status, 409);
    assert.equal((await fetch(`${server.baseUrl}/api/comparisons/${comparison.body.id}`, { method: 'DELETE' })).status, 200);
  });
});
