import assert from 'node:assert/strict';
import test from 'node:test';
import { jsonRequest, requestJson, startTestServer } from './helpers/testServer';

interface Version {
  id: number;
  name: string;
  text: string;
  note: string | null;
  is_current: 0 | 1;
}

test('prompt and version API', async t => {
  const server = await startTestServer();
  t.after(() => server.close());

  await t.test('creates a prompt with exactly one current v1', async () => {
    const created = await requestJson<{ id: number }>(
      server.baseUrl,
      '/api/prompts',
      jsonRequest('POST', { name: 'Summarizer' })
    );
    assert.equal(created.response.status, 201);

    const detail = await requestJson<{
      name: string;
      current_version: Version;
    }>(server.baseUrl, `/api/prompts/${created.body.id}`);
    assert.equal(detail.body.name, 'Summarizer');
    assert.equal(detail.body.current_version.name, 'v1');
    assert.equal(detail.body.current_version.text, '');
    assert.equal(detail.body.current_version.is_current, 1);

    const count = server.db.get(
      'SELECT COUNT(*) AS count FROM versions WHERE prompt_id = ? AND is_current = 1',
      [created.body.id]
    ) as { count: number };
    assert.equal(count.count, 1);
  });

  await t.test('renames a prompt', async () => {
    const created = await requestJson<{ id: number }>(
      server.baseUrl,
      '/api/prompts',
      jsonRequest('POST', { name: 'Before' })
    );
    const patched = await requestJson<{ ok: boolean }>(
      server.baseUrl,
      `/api/prompts/${created.body.id}`,
      jsonRequest('PATCH', { name: 'After' })
    );
    assert.equal(patched.response.status, 200);
    const detail = await requestJson<{ name: string }>(
      server.baseUrl,
      `/api/prompts/${created.body.id}`
    );
    assert.equal(detail.body.name, 'After');
  });

  await t.test('creates, switches, edits, and safely deletes versions', async () => {
    const created = await requestJson<{ id: number }>(
      server.baseUrl,
      '/api/prompts',
      jsonRequest('POST', { name: 'Versioned' })
    );
    const promptId = created.body.id;
    const initial = await requestJson<Version[]>(server.baseUrl, `/api/prompts/${promptId}/versions`);
    const v1 = initial.body[0];

    const second = await requestJson<{ id: number }>(
      server.baseUrl,
      `/api/prompts/${promptId}/versions`,
      jsonRequest('POST', { name: 'v2', text: 'Hello {{query}}', note: 'candidate' })
    );
    assert.equal(second.response.status, 201);

    let versions = (await requestJson<Version[]>(server.baseUrl, `/api/prompts/${promptId}/versions`)).body;
    assert.equal(versions.find(v => v.id === second.body.id)?.is_current, 1);
    assert.equal(versions.find(v => v.id === v1.id)?.is_current, 0);

    await requestJson<{ ok: boolean }>(
      server.baseUrl,
      `/api/versions/${v1.id}`,
      jsonRequest('PATCH', { set_current: true, text: 'edited', name: 'baseline', note: 'kept' })
    );
    versions = (await requestJson<Version[]>(server.baseUrl, `/api/prompts/${promptId}/versions`)).body;
    assert.equal(versions.find(v => v.id === v1.id)?.is_current, 1);
    assert.equal(versions.find(v => v.id === v1.id)?.text, 'edited');

    const deletedCurrent = await requestJson<{ ok: boolean }>(
      server.baseUrl,
      `/api/versions/${v1.id}`,
      { method: 'DELETE' }
    );
    assert.equal(deletedCurrent.response.status, 200);
    versions = (await requestJson<Version[]>(server.baseUrl, `/api/prompts/${promptId}/versions`)).body;
    assert.equal(versions.length, 1);
    assert.equal(versions[0].id, second.body.id);
    assert.equal(versions[0].is_current, 1);

    const onlyVersion = await requestJson<{ error: string }>(
      server.baseUrl,
      `/api/versions/${second.body.id}`,
      { method: 'DELETE' }
    );
    assert.equal(onlyVersion.response.status, 409);
    assert.equal((server.db.get(
      'SELECT COUNT(*) AS count FROM versions WHERE prompt_id = ? AND is_current = 1',
      [promptId]
    ) as { count: number }).count, 1);
  });

  await t.test('deleting a prompt cascades to versions and test cases', async () => {
    const created = await requestJson<{ id: number }>(
      server.baseUrl,
      '/api/prompts',
      jsonRequest('POST', { name: 'Disposable' })
    );
    await requestJson(
      server.baseUrl,
      `/api/prompts/${created.body.id}/test-cases`,
      jsonRequest('POST', { name: 'Owned test' })
    );
    const deleted = await requestJson<{ ok: boolean }>(
      server.baseUrl,
      `/api/prompts/${created.body.id}`,
      { method: 'DELETE' }
    );
    assert.equal(deleted.response.status, 200);
    assert.equal((server.db.get('SELECT COUNT(*) AS count FROM versions WHERE prompt_id = ?', [created.body.id]) as { count: number }).count, 0);
    assert.equal((server.db.get('SELECT COUNT(*) AS count FROM test_cases WHERE prompt_id = ?', [created.body.id]) as { count: number }).count, 0);
  });
});
