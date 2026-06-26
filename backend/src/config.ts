// App configuration, loaded from backend/config.json. This is the single private
// config file (git-ignored; see config.example.json for the template). It holds
// the server port and the model catalog — because our models can live on different
// servers, each entry pairs a server URL with the model name that server expects.
//
// config.json shape:
//   {
//     "port": 4747,                     // optional; defaults to 4747
//     "defaultModel": "qwen-35b",       // optional: id (or label) to start on
//     "models": [
//       { "id": "qwen-35b",  "label": "Qwen 35B",  "uri": "http://host-a:8009", "model": "Qwen...gguf" },
//       { "id": "gemma-26b", "label": "Gemma 26B", "uri": "http://host-b:8010", "model": "gemma...gguf" }
//     ]
//   }
//
// `id` is the stable identifier the UI sends back and that saved results/settings
// reference; it must be unique. `label` is the renameable display name. `id` is
// optional and defaults to `label` for older configs — but once results or
// settings reference an id, renaming the label is safe whereas changing the id
// is not.
import fs from 'fs';
import path from 'path';

export interface ModelEntry {
  id: string;     // stable identifier sent by the UI (defaults to label)
  label: string;  // human-friendly name shown in the picker
  uri: string;    // server base URL for this model
  model: string;  // model name this server expects
}

const CONFIG_PATH = process.env.PROMPT_STUDIO_CONFIG_PATH
  ? path.resolve(process.env.PROMPT_STUDIO_CONFIG_PATH)
  : path.join(__dirname, '../config.json');
const DEFAULT_PORT = 4747;

interface RawConfig {
  port?: number;
  defaultModel?: string;
  models?: { id?: string; label: string; uri: string; model: string }[];
}

// Read config.json fresh each call so edits are picked up without a restart.
// Returns {} when the file is absent; throws when it exists but is invalid JSON
// (callers surface a friendly error).
function readRaw(): RawConfig {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as RawConfig;
}

function resolveDefaultId(defaultModel: string | undefined, models: ModelEntry[]): string | null {
  if (defaultModel) {
    const byId = models.find(m => m.id === defaultModel);
    if (byId) return byId.id;
    const byLabel = models.find(m => m.label === defaultModel);
    if (byLabel) return byLabel.id;
  }
  return models[0]?.id ?? null;
}

export function getConfig(): { port: number; models: ModelEntry[]; defaultId: string | null } {
  const raw = readRaw();

  const models: ModelEntry[] = (raw.models ?? [])
    .filter(m => m.label && m.uri && m.model)
    .map(m => ({ id: m.id?.trim() || m.label, label: m.label, uri: m.uri, model: m.model }));

  // `defaultModel` normally names an id. Fall back to matching a label so older
  // configs (which named the model by its then-label-equals-id) still resolve.
  const defaultId = resolveDefaultId(raw.defaultModel, models);

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
