// LLM proxy route. Calls the llama.cpp OpenAI-compatible endpoint and returns a
// normalised response. Keeping this on the backend means the frontend never touches
// ACTIVE_MODEL_URI directly — env config stays server-side only.
import { Router } from 'express';

const router = Router();

interface ChatMessage { role: 'system' | 'user'; content: string; }

router.post('/run', async (req, res) => {
  const {
    system_prompt,
    user_message,
    temperature = 0.7,
    top_p = 1.0,
    top_k = 40,
    max_tokens = 1024,
    enable_thinking = false,
  } = req.body as {
    system_prompt?: string;
    user_message: string;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    max_tokens?: number;
    enable_thinking?: boolean;
  };

  const uri   = process.env.ACTIVE_MODEL_URI;
  const model = process.env.ACTIVE_MODEL_NAME;

  if (!uri || !model) {
    res.status(500).json({ error: 'LLM not configured — check ACTIVE_MODEL_URI and ACTIVE_MODEL_NAME in .env' });
    return;
  }

  const messages: ChatMessage[] = [];
  if (system_prompt?.trim()) messages.push({ role: 'system', content: system_prompt });
  messages.push({ role: 'user', content: user_message });

  // 5-minute abort guard — llama.cpp can be slow on large prompts but shouldn't stall forever
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);
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
        ? 'Request timed out (5 min limit) — the LLM server did not respond in time'
        : `Could not reach LLM server at ${uri}: ${msg}`,
    });
  }
});

export default router;
