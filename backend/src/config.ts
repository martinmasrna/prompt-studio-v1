// App configuration, loaded from backend/config.json. This is the single private
// config file (git-ignored; see config.example.json for the template). It holds
// the server port and the model catalog — because our models can live on different
// servers, each entry pairs a server URL with the model name that server expects.
//
// config.json shape:
//   {
//     "port": 4701,                     // optional; defaults to 4701
//     "defaultModel": "Qwen 35B",       // optional: label to start on
//     "models": [
//       { "label": "Qwen 35B",  "uri": "http://host-a:8009", "model": "Qwen...gguf" },
//       { "label": "Gemma 26B", "uri": "http://host-b:8010", "model": "gemma...gguf" }
//     ]
//   }
//
// Each entry's `label` doubles as its id (sent by the UI), so labels must be unique.
import fs from 'fs';
import path from 'path';

export interface ModelEntry {
  id: string;     // stable identifier sent by the UI (equal to label)
  label: string;  // human-friendly name shown in the picker
  uri: string;    // server base URL for this model
  model: string;  // model name this server expects
}

const CONFIG_PATH = path.join(__dirname, '../config.json');
const DEFAULT_PORT = 4701;

interface RawConfig {
  port?: number;
  defaultModel?: string;
  models?: { label: string; uri: string; model: string }[];
}

// Read config.json fresh each call so edits are picked up without a restart.
// Returns {} when the file is absent; throws when it exists but is invalid JSON
// (callers surface a friendly error).
function readRaw(): RawConfig {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as RawConfig;
}

export function getConfig(): { port: number; models: ModelEntry[]; defaultId: string | null } {
  const raw = readRaw();

  const models: ModelEntry[] = (raw.models ?? [])
    .filter(m => m.label && m.uri && m.model)
    .map(m => ({ id: m.label, label: m.label, uri: m.uri, model: m.model }));

  const defaultId = raw.defaultModel && models.some(m => m.id === raw.defaultModel)
    ? raw.defaultModel
    : (models[0]?.id ?? null);

  return { port: raw.port ?? DEFAULT_PORT, models, defaultId };
}

// Resolve a UI-chosen id to its catalog entry, falling back to the default entry.
export function resolveModel(id: string | undefined): ModelEntry | null {
  const { models, defaultId } = getConfig();
  if (id) {
    const found = models.find(m => m.id === id);
    if (found) return found;
  }
  return models.find(m => m.id === defaultId) ?? models[0] ?? null;
}
