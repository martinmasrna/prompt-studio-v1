import assert from 'node:assert/strict';
import test from 'node:test';
import { jsonRequest, requestJson, startTestServer } from './helpers/testServer';

interface Version {
  id: number;
  name: string;
  text: string;
  note: string | null;
  is_current: 0 | 1;
  system_prompt: string;
  default_config_id: number | null;
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

  await t.test('versions carry a system prompt and default config', async () => {
    const created = await requestJson<{ id: number }>(
      server.baseUrl,
      '/api/prompts',
      jsonRequest('POST', { name: 'Tutor' })
    );
    const promptId = created.body.id;

    const config = await requestJson<{ id: number }>(
      server.baseUrl,
      `/api/prompts/${promptId}/configs`,
      jsonRequest('POST', { name: 'Precise', temperature: 0.3 })
    );

    // New version saved with a system prompt and a default config of this prompt.
    const version = await requestJson<{ id: number }>(
      server.baseUrl,
      `/api/prompts/${promptId}/versions`,
      jsonRequest('POST', { name: 'v2', text: 'hi', system_prompt: 'You are a tutor.', default_config_id: config.body.id })
    );
    assert.equal(version.response.status, 201);

    let versions = (await requestJson<Version[]>(server.baseUrl, `/api/prompts/${promptId}/versions`)).body;
    const saved = versions.find(v => v.id === version.body.id)!;
    assert.equal(saved.system_prompt, 'You are a tutor.');
    assert.equal(saved.default_config_id, config.body.id);

    // The current-version read surface exposes the same fields.
    const detail = await requestJson<{ current_version: Version }>(server.baseUrl, `/api/prompts/${promptId}`);
    assert.equal(detail.body.current_version.system_prompt, 'You are a tutor.');
    assert.equal(detail.body.current_version.default_config_id, config.body.id);

    // PATCH can edit the system prompt and clear the default config.
    await requestJson(
      server.baseUrl,
      `/api/versions/${version.body.id}`,
      jsonRequest('PATCH', { system_prompt: 'Updated persona.', default_config_id: null })
    );
    versions = (await requestJson<Version[]>(server.baseUrl, `/api/prompts/${promptId}/versions`)).body;
    const patched = versions.find(v => v.id === version.body.id)!;
    assert.equal(patched.system_prompt, 'Updated persona.');
    assert.equal(patched.default_config_id, null);

    // A default config belonging to a different prompt is rejected.
    const otherPrompt = await requestJson<{ id: number }>(
      server.baseUrl,
      '/api/prompts',
      jsonRequest('POST', { name: 'Stranger' })
    );
    const otherConfig = await requestJson<{ id: number }>(
      server.baseUrl,
      `/api/prompts/${otherPrompt.body.id}/configs`,
      jsonRequest('POST', { name: 'Default' })
    );
    const rejected = await requestJson<{ error: string }>(
      server.baseUrl,
      `/api/versions/${version.body.id}`,
      jsonRequest('PATCH', { default_config_id: otherConfig.body.id })
    );
    assert.equal(rejected.response.status, 400);
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
