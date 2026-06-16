// Thin fetch wrappers. All requests go to /api/* — Vite proxies these to the
// backend in dev, so no port is ever hard-coded here.

// --- Types ---

export interface FolderNode {
  id: number;
  name: string;
  parent_id: number | null;
  children: FolderNode[];
}

export interface Prompt {
  id: number;
  name: string;
  folder_id: number | null;
  current_branch: string | null;
  current_version: string | null;
}

export interface VersionInfo {
  id: number;
  major: number;
  minor: number;
  text: string;
  note: string | null;
  is_current: 0 | 1;
  created_at: number;
}

export interface BranchWithVersions {
  id: number;
  name: string;
  versions: VersionInfo[];
}

export interface PromptDetail {
  id: number;
  name: string;
  description: string | null;
  folder_id: number | null;
  folder_name: string | null;
  created_at: number;
  updated_at: number;
  tags: string[];
  current_version: {
    id: number;
    branch_id: number;
    branch_name: string;
    major: number;
    minor: number;
    text: string;
    note: string | null;
    is_current: 1;
    created_at: number;
  } | null;
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
  folders: {
    list: () => apiFetch<FolderNode[]>('/api/folders'),
    create: (name: string, parent_id?: number | null) =>
      apiFetch<{ id: number }>('/api/folders', { method: 'POST', ...json({ name, parent_id }) }),
  },
  prompts: {
    list: () => apiFetch<Prompt[]>('/api/prompts'),
    get:  (id: number) => apiFetch<PromptDetail>(`/api/prompts/${id}`),
    create: (name: string, folder_id?: number | null) =>
      apiFetch<{ id: number }>('/api/prompts', { method: 'POST', ...json({ name, folder_id }) }),
    patch:  (id: number, data: Partial<{ name: string; description: string | null; folder_id: number | null; tags: string[] }>) =>
      apiFetch<{ ok: boolean }>(`/api/prompts/${id}`, { method: 'PATCH', ...json(data) }),
    delete: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/prompts/${id}`, { method: 'DELETE' }),
    branches: (id: number) => apiFetch<BranchWithVersions[]>(`/api/prompts/${id}/branches`),
    createBranch: (id: number, name: string) =>
      apiFetch<{ id: number; version_id: number }>(`/api/prompts/${id}/branches`, { method: 'POST', ...json({ name }) }),
  },
  branches: {
    createVersion: (branchId: number, data: { text: string; bump: 'minor' | 'major'; note?: string }) =>
      apiFetch<{ id: number; major: number; minor: number }>(`/api/branches/${branchId}/versions`, { method: 'POST', ...json(data) }),
  },
  versions: {
    setCurrent: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/versions/${id}`, { method: 'PATCH', ...json({ set_current: true }) }),
    updateNote: (id: number, note: string | null) =>
      apiFetch<{ ok: boolean }>(`/api/versions/${id}`, { method: 'PATCH', ...json({ note }) }),
    delete: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/versions/${id}`, { method: 'DELETE' }),
  },
  llm: {
    run: (data: { system_prompt?: string; user_message: string; temperature: number; top_p: number; top_k: number; max_tokens: number; enable_thinking: boolean }) =>
      apiFetch<SandboxRunResult>('/api/llm/run', { method: 'POST', ...json(data) }),
  },
};
