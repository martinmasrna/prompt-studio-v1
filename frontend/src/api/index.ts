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

export interface TestCase {
  id: number;
  prompt_id: number;
  name: string;
  description: string | null;
  variables: Record<string, string>;
  system_prompt: string;
  temperature: number;
  top_p: number;
  top_k: number;
  max_tokens: number;
  enable_thinking: boolean;
  created_at: number;
  updated_at: number;
}

export type TestCaseInput = Pick<TestCase,
  'name' | 'description' | 'variables' | 'system_prompt' | 'temperature' |
  'top_p' | 'top_k' | 'max_tokens' | 'enable_thinking'
>;

export type EvaluationSource = 'sandbox' | 'ab' | 'manual';

export interface EvaluationInput {
  test_case_id: number | null;
  prompt_id: number;
  version_id: number;
  source: EvaluationSource;
  prompt_name_snapshot: string;
  test_name_snapshot: string | null;
  version_name_snapshot: string;
  prompt_template_snapshot: string;
  rendered_prompt_snapshot: string;
  variables: Record<string, string>;
  system_prompt: string;
  temperature: number;
  top_p: number;
  top_k: number;
  max_tokens: number;
  enable_thinking: boolean;
  model_id_snapshot: string;
  model_label_snapshot: string;
  upstream_model_snapshot: string;
  response_text: string | null;
  error_text: string | null;
  tokens_used: number | null;
  latency_ms: number | null;
  executed_at: number;
}

export interface Evaluation extends EvaluationInput {
  id: number;
  batch_id: number | null;
  created_at: number;
}

export interface Comparison {
  id: number;
  prompt_id: number | null;
  kind: 'comparison';
  created_at: number;
  evaluations: Evaluation[];
}

export interface Issue {
  id: number;
  prompt_id: number | null;
  evaluation_id: number | null;
  title: string;
  status: 'open' | 'diagnosed' | 'closed';
  note: string | null;
  resolution_note: string | null;
  resolved_version_id: number | null;
  resolved_version: { id: number; name: string } | null;
  created_at: number;
  updated_at: number;
  evaluation: Evaluation | null;
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
  testCases: {
    list: (promptId: number) => apiFetch<TestCase[]>(`/api/prompts/${promptId}/test-cases`),
    get: (id: number) => apiFetch<TestCase>(`/api/test-cases/${id}`),
    create: (promptId: number, data: TestCaseInput) =>
      apiFetch<TestCase>(`/api/prompts/${promptId}/test-cases`, { method: 'POST', ...json(data) }),
    update: (id: number, data: Partial<TestCaseInput>) =>
      apiFetch<TestCase>(`/api/test-cases/${id}`, { method: 'PATCH', ...json(data) }),
    delete: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/test-cases/${id}`, { method: 'DELETE' }),
  },
  records: {
    list: (promptId: number) =>
      apiFetch<{ evaluations: Evaluation[]; comparisons: Comparison[] }>(`/api/prompts/${promptId}/results`),
    createEvaluation: (data: EvaluationInput) =>
      apiFetch<Evaluation>('/api/evaluations', { method: 'POST', ...json(data) }),
    createComparison: (
      promptId: number,
      items: [{ evaluation_id: number } | { evaluation: EvaluationInput }, { evaluation_id: number } | { evaluation: EvaluationInput }]
    ) => apiFetch<Comparison>('/api/comparisons', { method: 'POST', ...json({ prompt_id: promptId, items }) }),
    deleteEvaluation: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/evaluations/${id}`, { method: 'DELETE' }),
    deleteComparison: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/comparisons/${id}`, { method: 'DELETE' }),
  },
  issues: {
    list: (promptId: number) => apiFetch<Issue[]>(`/api/prompts/${promptId}/issues`),
    promptDoctor: (id: number) => apiFetch<{ prompt: string }>(`/api/issues/${id}/prompt-doctor`),
    create: (promptId: number, data: { title: string; note?: string | null; evaluation_id?: number; evaluation?: EvaluationInput }) =>
      apiFetch<Issue>(`/api/prompts/${promptId}/issues`, { method: 'POST', ...json(data) }),
    update: (id: number, data: Partial<{
      title: string;
      note: string | null;
      status: 'open' | 'diagnosed' | 'closed';
      resolution_note: string | null;
      resolved_version_id: number | null;
    }>) =>
      apiFetch<Issue>(`/api/issues/${id}`, { method: 'PATCH', ...json(data) }),
    delete: (id: number) => apiFetch<{ ok: boolean }>(`/api/issues/${id}`, { method: 'DELETE' }),
  },
  llm: {
    models: () => apiFetch<{ models: ModelOption[]; active: string | null }>('/api/llm/models'),
    run: (data: { system_prompt?: string; user_message: string; model_id?: string; temperature: number; top_p: number; top_k: number; max_tokens: number; enable_thinking: boolean }) =>
      apiFetch<SandboxRunResult>('/api/llm/run', { method: 'POST', ...json(data) }),
  },
};
