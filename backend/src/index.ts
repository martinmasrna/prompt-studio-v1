import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import healthRouter      from './routes/health';
import promptsRouter     from './routes/prompts';
import promptDetailRouter from './routes/promptDetail';
import versionsRouter    from './routes/versions';
import llmRouter         from './routes/llm';

const app = express();
const PORT = process.env.PORT ?? 4701;

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

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
  console.log(`[backend] model: ${process.env.ACTIVE_MODEL_NAME} @ ${process.env.ACTIVE_MODEL_URI}`);
});
