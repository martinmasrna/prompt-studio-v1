import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import promptsRouter from './routes/prompts';
import promptDetailRouter from './routes/promptDetail';
import versionsRouter from './routes/versions';
import llmRouter from './routes/llm';
import testCasesRouter from './routes/testCases';
import configsRouter from './routes/configs';
import recordsRouter from './routes/records';

const app = express();

app.use(cors());
// Evaluation snapshots may contain a long source document both as a variable
// and inside the rendered prompt. Keep a deliberate local limit, but allow
// realistic study material rather than Express's small default payload.
app.use(express.json({ limit: '2mb' }));

app.use('/api/health', healthRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/prompts', promptDetailRouter);
app.use('/api/versions', versionsRouter);
app.use('/api/llm', llmRouter);
app.use('/api', testCasesRouter);
app.use('/api', configsRouter);
app.use('/api', recordsRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message, err.stack);
  res.status(500).json({ error: err.message });
});

export default app;
