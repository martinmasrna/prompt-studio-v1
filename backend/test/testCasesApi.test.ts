import assert from 'node:assert/strict';
import test from 'node:test';
import { jsonRequest, requestJson, startTestServer } from './helpers/testServer';

interface TestCaseResponse {
  id: number;
  prompt_id: number;
  name: string;
  description: string | null;
  variables: Record<string, string>;
  system_prompt: string;
  temperature: number;
  top_p: number;
  top_k: number;
  max_tokens: number;
  enable_thinking: boolean;
}

test('test-case API', async t => {
  const server = await startTestServer();
  t.after(() => server.close());

  const prompt = await requestJson<{ id: number }>(
    server.baseUrl,
    '/api/prompts',
    jsonRequest('POST', { name: 'API prompt' })
  );
  const promptId = prompt.body.id;

  await t.test('applies defaults and round-trips Unicode variables', async () => {
    const created = await requestJson<TestCaseResponse>(
      server.baseUrl,
      `/api/prompts/${promptId}/test-cases`,
      jsonRequest('POST', { name: 'Defaults', variables: { query: 'Žiadosť\n第二行' } })
    );
    assert.equal(created.response.status, 201);
    assert.deepEqual(created.body.variables, { query: 'Žiadosť\n第二行' });
    assert.equal(created.body.temperature, 0.7);
    assert.equal(created.body.top_p, 1);
    assert.equal(created.body.top_k, 40);
    assert.equal(created.body.max_tokens, 1024);
    assert.equal(created.body.enable_thinking, false);
  });

  await t.test('rejects invalid fields and parameter ranges', async () => {
    const invalidBodies = [
      { name: '', variables: {} },
      { name: 'bad variables', variables: { query: 4 } },
      { name: 'bad temperature', temperature: 2.1 },
      { name: 'bad top p', top_p: -0.1 },
      { name: 'bad top k', top_k: 1.5 },
      { name: 'bad max tokens', max_tokens: 63 },
      { name: 'bad thinking', enable_thinking: 1 },
    ];
    for (const body of invalidBodies) {
      const result = await requestJson<{ error: string }>(
        server.baseUrl,
        `/api/prompts/${promptId}/test-cases`,
        jsonRequest('POST', body)
      );
      assert.equal(result.response.status, 400, JSON.stringify(body));
    }
  });

  await t.test('enforces case-insensitive names within one prompt', async () => {
    const duplicate = await requestJson<{ error: string }>(
      server.baseUrl,
      `/api/prompts/${promptId}/test-cases`,
      jsonRequest('POST', { name: 'defaults' })
    );
    assert.equal(duplicate.response.status, 409);

    const otherPrompt = await requestJson<{ id: number }>(
      server.baseUrl,
      '/api/prompts',
      jsonRequest('POST', { name: 'Other prompt' })
    );
    const allowed = await requestJson<TestCaseResponse>(
      server.baseUrl,
      `/api/prompts/${otherPrompt.body.id}/test-cases`,
      jsonRequest('POST', { name: 'defaults' })
    );
    assert.equal(allowed.response.status, 201);
  });

  await t.test('updates, lists, and deletes a test case', async () => {
    const list = await requestJson<TestCaseResponse[]>(server.baseUrl, `/api/prompts/${promptId}/test-cases`);
    const target = list.body.find(item => item.name === 'Defaults')!;
    const updated = await requestJson<TestCaseResponse>(
      server.baseUrl,
      `/api/test-cases/${target.id}`,
      jsonRequest('PATCH', {
        name: 'Renamed',
        description: 'A durable case',
        temperature: 0.4,
        enable_thinking: true,
      })
    );
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.name, 'Renamed');
    assert.equal(updated.body.description, 'A durable case');
    assert.equal(updated.body.temperature, 0.4);
    assert.equal(updated.body.enable_thinking, true);

    const deleted = await requestJson<{ ok: boolean }>(
      server.baseUrl,
      `/api/test-cases/${target.id}`,
      { method: 'DELETE' }
    );
    assert.equal(deleted.response.status, 200);
    assert.equal((await fetch(`${server.baseUrl}/api/test-cases/${target.id}`)).status, 404);
  });

  await t.test('returns 404 for missing owners and test cases', async () => {
    assert.equal((await fetch(`${server.baseUrl}/api/prompts/999999/test-cases`)).status, 404);
    assert.equal((await fetch(`${server.baseUrl}/api/test-cases/999999`)).status, 404);
    const create = await requestJson<{ error: string }>(
      server.baseUrl,
      '/api/prompts/999999/test-cases',
      jsonRequest('POST', { name: 'orphan' })
    );
    assert.equal(create.response.status, 404);
  });
});
