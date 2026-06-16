import express from 'express';
import cors from 'cors';
import { getConfig } from './config';
import healthRouter      from './routes/health';
import promptsRouter     from './routes/prompts';
import promptDetailRouter from './routes/promptDetail';
import versionsRouter    from './routes/versions';
import llmRouter         from './routes/llm';

const app = express();

// Read the port from config.json; tolerate a missing/invalid file so the server
// still starts (the /api/llm/models route surfaces config errors to the UI).
let port = 4701;
try {
  port = getConfig().port;
} catch (err) {
  console.error('[backend] config.json is invalid — using default port 4701:', (err as Error).message);
}

app.use(cors());
app.use(express.json());

app.use('/api/health',   healthRouter);
app.use('/api/prompts',  promptsRouter);
app.use('/api/prompts',  promptDetailRouter);
app.use('/api/versions', versionsRouter);
app.use('/api/llm',      llmRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message, err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(port, () => {
  console.log(`[backend] listening on http://localhost:${port}`);
  try {
    const { models, defaultId } = getConfig();
    console.log(`[backend] ${models.length} model(s) configured; default: ${defaultId ?? 'none'}`);
  } catch {
    /* already warned above */
  }
});
