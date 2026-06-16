// Backend entry point. Loads env, wires up middleware and routes, starts the HTTP server.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import healthRouter      from './routes/health';
import foldersRouter     from './routes/folders';
import promptsRouter     from './routes/prompts';
import promptDetailRouter from './routes/promptDetail';
import branchesRouter    from './routes/branches';
import versionsRouter    from './routes/versions';
import llmRouter         from './routes/llm';

const app = express();
const PORT = process.env.PORT ?? 4701;

// CORS is permissive in dev — Vite dev server runs on a different port (4700)
app.use(cors());
app.use(express.json());

app.use('/api/health',   healthRouter);
app.use('/api/folders',  foldersRouter);
app.use('/api/prompts',  promptsRouter);       // list + create
app.use('/api/prompts',  promptDetailRouter);  // /:id detail, branches, patch, delete
app.use('/api/branches', branchesRouter);      // /:id/versions
app.use('/api/versions', versionsRouter);      // /:id patch/delete
app.use('/api/llm',      llmRouter);           // /run

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message, err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
  console.log(`[backend] model: ${process.env.ACTIVE_MODEL_NAME} @ ${process.env.ACTIVE_MODEL_URI}`);
});
