// LLM routes. Lists the declared model catalog and proxies chat requests to the
// right server. Keeping the URLs server-side (in config) means the frontend
// only ever deals with model ids/labels, never raw server addresses.
import { Router } from 'express';
import { getConfig, resolveModel } from '../config';

const router = Router();

interface ChatMessage { role: 'system' | 'user'; content: string; }

// --- GET /api/llm/models ---
// Returns the declared model catalog (from backend/config.json) for the Settings
// model picker. `active` is the default id the UI starts on.
router.get('/models', (_req, res) => {
  try {
    const { models, defaultId } = getConfig();
    res.json({
      models: models.map(m => ({ id: m.id, label: m.label, model: m.model, uri: m.uri })),
      active: defaultId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Could not read model catalog (backend/config.json): ${msg}` });
  }
});

router.post('/run', async (req, res) => {
  const {
    system_prompt,
    user_message,
    model_id,
    temperature = 0.7,
    top_p = 1.0,
    top_k = 40,
    max_tokens = 1024,
    enable_thinking = false,
  } = req.body as {
    system_prompt?: string;
    user_message: string;
    model_id?: string;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    max_tokens?: number;
    enable_thinking?: boolean;
  };

  // Resolve the UI-chosen model id to its server URL + model name.
  const entry = resolveModel(model_id);
  if (!entry) {
    res.status(500).json({ error: 'No model configured — add models to backend/config.json (see config.example.json)' });
    return;
  }
  const { uri, model } = entry;

  const messages: ChatMessage[] = [];
  if (system_prompt?.trim()) messages.push({ role: 'system', content: system_prompt });
  messages.push({ role: 'user', content: user_message });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2 * 60 * 1000);
  const t0 = Date.now();

  try {
    const upstream = await fetch(`${uri}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages, temperature, top_p, top_k, max_tokens, stream: false,
        chat_template_kwargs: { enable_thinking },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!upstream.ok) {
      const body = await upstream.text();
      res.status(502).json({ error: `LLM server returned ${upstream.status}: ${body}` });
      return;
    }

    const data = await upstream.json() as {
      choices: { message: { content: string } }[];
      usage?: { completion_tokens?: number };
    };

    const text = data.choices[0]?.message?.content ?? '';

    res.json({
      text,
      tokens_used: data.usage?.completion_tokens ?? null,
      latency_ms:  Date.now() - t0,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('abort') || msg.includes('AbortError');
    res.status(502).json({
      error: isTimeout
        ? 'Request timed out (2 min limit) — the LLM server did not respond in time'
        : `Could not reach LLM server at ${uri}: ${msg}`,
    });
  }
});

export default router;
