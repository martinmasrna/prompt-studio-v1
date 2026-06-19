import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import test from 'node:test';
import { jsonRequest, requestJson, startTestServer } from './helpers/testServer';

async function listen(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fake upstream did not bind');
  return `http://127.0.0.1:${address.port}`;
}

test('LLM proxy API', async t => {
  let upstreamStatus = 200;
  let capturedBody: Record<string, unknown> | null = null;
  const upstream = createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      capturedBody = JSON.parse(raw) as Record<string, unknown>;
      res.statusCode = upstreamStatus;
      res.setHeader('Content-Type', 'application/json');
      res.end(upstreamStatus === 200
        ? JSON.stringify({ choices: [{ message: { content: 'mock answer' } }], usage: { completion_tokens: 7 } })
        : JSON.stringify({ error: 'upstream failed' }));
    });
  });
  const upstreamUrl = await listen(upstream);
  const modelConfig = {
    defaultModel: 'Mock model',
    models: [{ label: 'Mock model', uri: upstreamUrl, model: 'mock.gguf' }],
  };
  const appServer = await startTestServer(modelConfig);
  t.after(async () => {
    await appServer.close();
    await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
  });

  await t.test('lists and resolves configured models', async () => {
    const result = await requestJson<{
      active: string;
      models: Array<{ id: string; label: string; model: string }>;
    }>(appServer.baseUrl, '/api/llm/models');
    assert.equal(result.response.status, 200);
    assert.equal(result.body.active, 'Mock model');
    assert.equal(result.body.models[0].model, 'mock.gguf');
  });

  await t.test('forwards the exact request shape and maps the response', async () => {
    upstreamStatus = 200;
    capturedBody = null;
    const result = await requestJson<{ text: string; tokens_used: number; latency_ms: number }>(
      appServer.baseUrl,
      '/api/llm/run',
      jsonRequest('POST', {
        model_id: 'Mock model',
        system_prompt: 'Be concise',
        user_message: 'Summarize this',
        temperature: 0.2,
        top_p: 0.8,
        top_k: 12,
        max_tokens: 256,
        enable_thinking: true,
      })
    );
    assert.equal(result.response.status, 200);
    assert.equal(result.body.text, 'mock answer');
    assert.equal(result.body.tokens_used, 7);
    assert.ok(result.body.latency_ms >= 0);
    assert.deepEqual(capturedBody, {
      model: 'mock.gguf',
      messages: [
        { role: 'system', content: 'Be concise' },
        { role: 'user', content: 'Summarize this' },
      ],
      temperature: 0.2,
      top_p: 0.8,
      top_k: 12,
      max_tokens: 256,
      stream: false,
      chat_template_kwargs: { enable_thinking: true },
    });
  });

  await t.test('maps upstream HTTP failures to 502', async () => {
    upstreamStatus = 503;
    const result = await requestJson<{ error: string }>(
      appServer.baseUrl,
      '/api/llm/run',
      jsonRequest('POST', { user_message: 'hello' })
    );
    assert.equal(result.response.status, 502);
    assert.match(result.body.error, /503/);
  });

  await t.test('reports missing model configuration', async () => {
    appServer.writeConfig({ models: [] });
    const result = await requestJson<{ error: string }>(
      appServer.baseUrl,
      '/api/llm/run',
      jsonRequest('POST', { user_message: 'hello' })
    );
    assert.equal(result.response.status, 500);
    assert.match(result.body.error, /No model configured/);
  });

  await t.test('maps unreachable upstreams to 502', async () => {
    appServer.writeConfig({
      models: [{ label: 'Offline', uri: 'http://127.0.0.1:1', model: 'offline.gguf' }],
    });
    const result = await requestJson<{ error: string }>(
      appServer.baseUrl,
      '/api/llm/run',
      jsonRequest('POST', { user_message: 'hello' })
    );
    assert.equal(result.response.status, 502);
    assert.match(result.body.error, /Could not reach LLM server/);
  });
});
