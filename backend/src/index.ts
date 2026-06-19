import { getConfig } from './config';
import app from './app';

// Read the port from config.json; tolerate a missing/invalid file so the server
// still starts (the /api/llm/models route surfaces config errors to the UI).
let port = 4701;
try {
  port = getConfig().port;
} catch (err) {
  console.error('[backend] config.json is invalid — using default port 4701:', (err as Error).message);
}

app.listen(port, () => {
  console.log(`[backend] listening on http://localhost:${port}`);
  try {
    const { models, defaultId } = getConfig();
    console.log(`[backend] ${models.length} model(s) configured; default: ${defaultId ?? 'none'}`);
  } catch {
    /* already warned above */
  }
});
