// --- Types ---

export interface Prompt {
  id: number;
  name: string;
  current_version: string | null;
}

export interface VersionInfo {
  id: number;
  name: string;
  text: string;
  note: string | null;
  is_current: 0 | 1;
}

export interface PromptDetail {
  id: number;
  name: string;
  description: string | null;
  current_version: {
    id: number;
    name: string;
    text: string;
    note: string | null;
    is_current: 1;
  } | null;
}

// One selectable model in the catalog. `id` (== label) is what runs send back.
export interface ModelOption {
  id: string;
  label: string;
  model: string;
  uri: string;
}

export interface SandboxRunResult {
  text: string;
  tokens_used: number | null;
  latency_ms: number;
}

// --- Fetch helper ---

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// --- API surface ---

export const api = {
  prompts: {
    list: () => apiFetch<Prompt[]>('/api/prompts'),
    get:  (id: number) => apiFetch<PromptDetail>(`/api/prompts/${id}`),
    create: (name: string) =>
      apiFetch<{ id: number }>('/api/prompts', { method: 'POST', ...json({ name }) }),
    patch: (id: number, data: Partial<{ name: string; description: string | null }>) =>
      apiFetch<{ ok: boolean }>(`/api/prompts/${id}`, { method: 'PATCH', ...json(data) }),
    delete: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/prompts/${id}`, { method: 'DELETE' }),
    versions: (id: number) => apiFetch<VersionInfo[]>(`/api/prompts/${id}/versions`),
    createVersion: (id: number, data: { text: string; name: string; note?: string }) =>
      apiFetch<{ id: number }>(`/api/prompts/${id}/versions`, { method: 'POST', ...json(data) }),
  },
  versions: {
    setCurrent: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/versions/${id}`, { method: 'PATCH', ...json({ set_current: true }) }),
    updateText: (id: number, text: string) =>
      apiFetch<{ ok: boolean }>(`/api/versions/${id}`, { method: 'PATCH', ...json({ text }) }),
    updateName: (id: number, name: string) =>
      apiFetch<{ ok: boolean }>(`/api/versions/${id}`, { method: 'PATCH', ...json({ name }) }),
    updateNote: (id: number, note: string | null) =>
      apiFetch<{ ok: boolean }>(`/api/versions/${id}`, { method: 'PATCH', ...json({ note }) }),
    delete: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/versions/${id}`, { method: 'DELETE' }),
  },
  llm: {
    models: () => apiFetch<{ models: ModelOption[]; active: string | null }>('/api/llm/models'),
    run: (data: { system_prompt?: string; user_message: string; model_id?: string; temperature: number; top_p: number; top_k: number; max_tokens: number; enable_thinking: boolean }) =>
      apiFetch<SandboxRunResult>('/api/llm/run', { method: 'POST', ...json(data) }),
  },
};
