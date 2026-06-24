import assert from 'node:assert/strict';
import test from 'node:test';
import { jsonRequest, requestJson, startTestServer } from './helpers/testServer';

interface ConfigResponse {
  id: number;
  prompt_id: number;
  name: string;
  temperature: number;
  top_p: number;
  top_k: number;
  max_tokens: number;
  enable_thinking: boolean;
}

test('config API', async t => {
  const server = await startTestServer();
  t.after(() => server.close());

  const prompt = await requestJson<{ id: number }>(
    server.baseUrl,
    '/api/prompts',
    jsonRequest('POST', { name: 'Config prompt' })
  );
  const promptId = prompt.body.id;

  await t.test('applies defaults', async () => {
    const created = await requestJson<ConfigResponse>(
      server.baseUrl,
      `/api/prompts/${promptId}/configs`,
      jsonRequest('POST', { name: 'Default' })
    );
    assert.equal(created.response.status, 201);
    assert.equal(created.body.temperature, 0.7);
    assert.equal(created.body.top_p, 1);
    assert.equal(created.body.top_k, 40);
    assert.equal(created.body.max_tokens, 1024);
    assert.equal(created.body.enable_thinking, false);
  });

  await t.test('rejects invalid parameter ranges', async () => {
    const invalidBodies = [
      { name: '' },
      { name: 'bad temperature', temperature: 2.1 },
      { name: 'bad top p', top_p: -0.1 },
      { name: 'bad top k', top_k: 1.5 },
      { name: 'bad max tokens', max_tokens: 63 },
      { name: 'bad thinking', enable_thinking: 1 },
    ];
    for (const body of invalidBodies) {
      const result = await requestJson<{ error: string }>(
        server.baseUrl,
        `/api/prompts/${promptId}/configs`,
        jsonRequest('POST', body)
      );
      assert.equal(result.response.status, 400, JSON.stringify(body));
    }
  });

  await t.test('enforces case-insensitive names within one prompt', async () => {
    const duplicate = await requestJson<{ error: string }>(
      server.baseUrl,
      `/api/prompts/${promptId}/configs`,
      jsonRequest('POST', { name: 'default' })
    );
    assert.equal(duplicate.response.status, 409);

    const otherPrompt = await requestJson<{ id: number }>(
      server.baseUrl,
      '/api/prompts',
      jsonRequest('POST', { name: 'Other config prompt' })
    );
    const allowed = await requestJson<ConfigResponse>(
      server.baseUrl,
      `/api/prompts/${otherPrompt.body.id}/configs`,
      jsonRequest('POST', { name: 'default' })
    );
    assert.equal(allowed.response.status, 201);
  });

  await t.test('updates, lists, and deletes a config', async () => {
    const list = await requestJson<ConfigResponse[]>(server.baseUrl, `/api/prompts/${promptId}/configs`);
    const target = list.body.find(item => item.name === 'Default')!;
    const updated = await requestJson<ConfigResponse>(
      server.baseUrl,
      `/api/configs/${target.id}`,
      jsonRequest('PATCH', { name: 'Precise', temperature: 0.3, enable_thinking: true })
    );
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.name, 'Precise');
    assert.equal(updated.body.temperature, 0.3);
    assert.equal(updated.body.enable_thinking, true);

    const deleted = await requestJson<{ ok: boolean }>(
      server.baseUrl,
      `/api/configs/${target.id}`,
      { method: 'DELETE' }
    );
    assert.equal(deleted.response.status, 200);
    assert.equal((await fetch(`${server.baseUrl}/api/configs/${target.id}`)).status, 404);
  });

  await t.test('returns 404 for missing owners and configs', async () => {
    assert.equal((await fetch(`${server.baseUrl}/api/prompts/999999/configs`)).status, 404);
    assert.equal((await fetch(`${server.baseUrl}/api/configs/999999`)).status, 404);
    const create = await requestJson<{ error: string }>(
      server.baseUrl,
      '/api/prompts/999999/configs',
      jsonRequest('POST', { name: 'orphan' })
    );
    assert.equal(create.response.status, 404);
  });

  await t.test('cascades away when its prompt is deleted', async () => {
    const doomed = await requestJson<{ id: number }>(
      server.baseUrl,
      '/api/prompts',
      jsonRequest('POST', { name: 'Doomed' })
    );
    await requestJson(
      server.baseUrl,
      `/api/prompts/${doomed.body.id}/configs`,
      jsonRequest('POST', { name: 'gone' })
    );
    await requestJson(server.baseUrl, `/api/prompts/${doomed.body.id}`, { method: 'DELETE' });
    assert.equal(
      (server.db.get('SELECT COUNT(*) AS count FROM configs WHERE prompt_id = ?', [doomed.body.id]) as { count: number }).count,
      0
    );
  });
});
