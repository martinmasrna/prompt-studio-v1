import assert from 'node:assert/strict';
import test from 'node:test';
import { jsonRequest, requestJson, startTestServer } from './helpers/testServer';

interface TestCaseResponse {
  id: number;
  prompt_id: number;
  name: string;
  description: string | null;
  variables: Record<string, string>;
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
    assert.equal(created.body.description, null);
  });

  await t.test('rejects invalid fields', async () => {
    const invalidBodies = [
      { name: '', variables: {} },
      { name: 'bad variables', variables: { query: 4 } },
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
        variables: { query: 'updated' },
      })
    );
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.name, 'Renamed');
    assert.equal(updated.body.description, 'A durable case');
    assert.deepEqual(updated.body.variables, { query: 'updated' });

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
