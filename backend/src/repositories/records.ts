import db from '../db';

export type EvaluationSource = 'sandbox' | 'ab' | 'manual';
export type IssueStatus = 'open' | 'diagnosed' | 'closed';

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
  note: string | null;
  created_at: number;
  // Present only on results listings: the issue this result was auto-saved for, if any.
  issue_id?: number | null;
}

interface EvaluationRow extends Omit<Evaluation, 'variables' | 'enable_thinking'> {
  variables_json: string;
  enable_thinking: number;
}

export interface Comparison {
  id: number;
  prompt_id: number | null;
  kind: 'comparison';
  note: string | null;
  created_at: number;
  evaluations: Evaluation[];
}

export interface Issue {
  id: number;
  prompt_id: number | null;
  evaluation_id: number | null;
  title: string;
  status: IssueStatus;
  note: string | null;
  resolution_note: string | null;
  resolved_version_id: number | null;
  created_at: number;
  updated_at: number;
  evaluation: Evaluation | null;
  resolved_version: { id: number; name: string } | null;
}

interface IssueRow extends Omit<Issue, 'evaluation' | 'resolved_version'> {}

function mapEvaluation(row: EvaluationRow): Evaluation {
  const { variables_json, enable_thinking, ...rest } = row;
  return {
    ...rest,
    variables: JSON.parse(variables_json) as Record<string, string>,
    enable_thinking: enable_thinking === 1,
  };
}

export function entityExists(table: 'prompts' | 'versions' | 'test_cases', id: number): boolean {
  return db.get(`SELECT 1 AS found FROM ${table} WHERE id = ?`, [id]) !== null;
}

export function entityBelongsToPrompt(table: 'versions' | 'test_cases', id: number, promptId: number): boolean {
  return db.get(`SELECT 1 AS found FROM ${table} WHERE id = ? AND prompt_id = ?`, [id, promptId]) !== null;
}

export function getEvaluation(id: number): Evaluation | null {
  const row = db.get('SELECT * FROM evaluations WHERE id = ?', [id]) as unknown as EvaluationRow | null;
  return row ? mapEvaluation(row) : null;
}

function insertEvaluation(input: EvaluationInput, batchId: number | null): Evaluation {
  const result = db.run(
    `INSERT INTO evaluations (
      batch_id, test_case_id, prompt_id, version_id, source,
      prompt_name_snapshot, test_name_snapshot, version_name_snapshot,
      prompt_template_snapshot, rendered_prompt_snapshot, variables_json,
      system_prompt, temperature, top_p, top_k, max_tokens, enable_thinking,
      model_id_snapshot, model_label_snapshot, upstream_model_snapshot,
      response_text, error_text, tokens_used, latency_ms, executed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      batchId, input.test_case_id, input.prompt_id, input.version_id, input.source,
      input.prompt_name_snapshot, input.test_name_snapshot, input.version_name_snapshot,
      input.prompt_template_snapshot, input.rendered_prompt_snapshot, JSON.stringify(input.variables),
      input.system_prompt, input.temperature, input.top_p, input.top_k, input.max_tokens,
      input.enable_thinking ? 1 : 0, input.model_id_snapshot, input.model_label_snapshot,
      input.upstream_model_snapshot, input.response_text, input.error_text,
      input.tokens_used, input.latency_ms, input.executed_at,
    ]
  );
  return getEvaluation(Number(result.lastInsertRowid))!;
}

export function createEvaluation(input: EvaluationInput): Evaluation {
  return insertEvaluation(input, null);
}

export function createComparison(
  promptId: number,
  items: [EvaluationInput | number, EvaluationInput | number]
): Comparison {
  db.run('BEGIN IMMEDIATE');
  try {
    const result = db.run(
      "INSERT INTO evaluation_batches (prompt_id, kind) VALUES (?, 'comparison')",
      [promptId]
    );
    const batchId = Number(result.lastInsertRowid);
    const evaluations = items.map(item => {
      if (typeof item !== 'number') return insertEvaluation(item, batchId);
      db.run('UPDATE evaluations SET batch_id = ? WHERE id = ?', [batchId, item]);
      return getEvaluation(item)!;
    });
    db.run('COMMIT');
    const batch = db.get('SELECT * FROM evaluation_batches WHERE id = ?', [batchId]) as unknown as Omit<Comparison, 'evaluations'>;
    return { ...batch, evaluations };
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

export function listResults(promptId: number): { evaluations: Evaluation[]; comparisons: Comparison[] } {
  const standalone = (db.all(
    `SELECT e.*,
            (SELECT i.id FROM issues i WHERE i.evaluation_id = e.id ORDER BY i.id LIMIT 1) AS issue_id
     FROM evaluations e
     WHERE e.prompt_id = ? AND e.batch_id IS NULL
     ORDER BY e.executed_at DESC, e.id DESC`,
    [promptId]
  ) as unknown as EvaluationRow[]).map(mapEvaluation);
  const batches = db.all(
    'SELECT * FROM evaluation_batches WHERE prompt_id = ? ORDER BY created_at DESC, id DESC',
    [promptId]
  ) as unknown as Array<Omit<Comparison, 'evaluations'>>;
  const comparisons = batches.map(batch => ({
    ...batch,
    evaluations: (db.all(
      'SELECT * FROM evaluations WHERE batch_id = ? ORDER BY id',
      [batch.id]
    ) as unknown as EvaluationRow[]).map(mapEvaluation),
  }));
  return { evaluations: standalone, comparisons };
}

function evaluationHasIssue(id: number): boolean {
  return db.get('SELECT 1 AS found FROM issues WHERE evaluation_id = ? LIMIT 1', [id]) !== null;
}

export function deleteEvaluation(id: number): 'deleted' | 'missing' | 'linked' | 'batched' {
  const evaluation = getEvaluation(id);
  if (!evaluation) return 'missing';
  if (evaluation.batch_id !== null) return 'batched';
  if (evaluationHasIssue(id)) return 'linked';
  db.run('DELETE FROM evaluations WHERE id = ?', [id]);
  return 'deleted';
}

export function updateEvaluationNote(id: number, note: string | null): Evaluation | null {
  if (!getEvaluation(id)) return null;
  db.run('UPDATE evaluations SET note = ? WHERE id = ?', [note, id]);
  return getEvaluation(id);
}

export function updateComparisonNote(id: number, note: string | null): Comparison | null {
  const batch = db.get('SELECT * FROM evaluation_batches WHERE id = ?', [id]) as unknown as Omit<Comparison, 'evaluations'> | null;
  if (!batch) return null;
  db.run('UPDATE evaluation_batches SET note = ? WHERE id = ?', [note, id]);
  const updated = db.get('SELECT * FROM evaluation_batches WHERE id = ?', [id]) as unknown as Omit<Comparison, 'evaluations'>;
  return {
    ...updated,
    evaluations: (db.all(
      'SELECT * FROM evaluations WHERE batch_id = ? ORDER BY id',
      [id]
    ) as unknown as EvaluationRow[]).map(mapEvaluation),
  };
}

export function deleteComparison(id: number): 'deleted' | 'missing' | 'linked' {
  const batch = db.get('SELECT id FROM evaluation_batches WHERE id = ?', [id]);
  if (!batch) return 'missing';
  const linked = db.get(
    `SELECT 1 AS found FROM issues i
     JOIN evaluations e ON e.id = i.evaluation_id
     WHERE e.batch_id = ? LIMIT 1`,
    [id]
  );
  if (linked) return 'linked';
  db.run('DELETE FROM evaluation_batches WHERE id = ?', [id]);
  return 'deleted';
}

function mapIssue(row: IssueRow): Issue {
  const resolvedVersion = row.resolved_version_id
    ? db.get('SELECT id, name FROM versions WHERE id = ?', [row.resolved_version_id]) as { id: number; name: string } | null
    : null;
  return {
    ...row,
    evaluation: row.evaluation_id ? getEvaluation(row.evaluation_id) : null,
    resolved_version: resolvedVersion,
  };
}

export function getIssue(id: number): Issue | null {
  const row = db.get('SELECT * FROM issues WHERE id = ?', [id]) as unknown as IssueRow | null;
  return row ? mapIssue(row) : null;
}

export function listIssues(promptId: number): Issue[] {
  return (db.all(
    "SELECT * FROM issues WHERE prompt_id = ? ORDER BY status = 'open' DESC, created_at DESC, id DESC",
    [promptId]
  ) as unknown as IssueRow[]).map(mapIssue);
}

export function createIssue(
  promptId: number,
  title: string,
  note: string | null,
  evaluationId: number | null,
  evaluationInput?: EvaluationInput
): Issue {
  db.run('BEGIN IMMEDIATE');
  try {
    const linkedEvaluationId = evaluationInput
      ? insertEvaluation(evaluationInput, null).id
      : evaluationId;
    const result = db.run(
      "INSERT INTO issues (prompt_id, evaluation_id, title, status, note) VALUES (?, ?, ?, 'open', ?)",
      [promptId, linkedEvaluationId, title, note]
    );
    db.run('COMMIT');
    return getIssue(Number(result.lastInsertRowid))!;
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

export function updateIssue(
  id: number,
  values: Partial<{
    title: string;
    note: string | null;
    status: IssueStatus;
    resolution_note: string | null;
    resolved_version_id: number | null;
  }>
): Issue | null {
  if (!getIssue(id)) return null;
  const fields: string[] = [];
  const params: Array<string | number | null> = [];
  if (values.title !== undefined) { fields.push('title = ?'); params.push(values.title); }
  if (values.note !== undefined) { fields.push('note = ?'); params.push(values.note); }
  if (values.status !== undefined) { fields.push('status = ?'); params.push(values.status); }
  if (values.resolution_note !== undefined) { fields.push('resolution_note = ?'); params.push(values.resolution_note); }
  if (values.resolved_version_id !== undefined) { fields.push('resolved_version_id = ?'); params.push(values.resolved_version_id); }
  if (fields.length) {
    fields.push('updated_at = unixepoch()');
    params.push(id);
    db.run(`UPDATE issues SET ${fields.join(', ')} WHERE id = ?`, params);
  }
  return getIssue(id);
}

export function deleteIssue(id: number): boolean {
  return db.run('DELETE FROM issues WHERE id = ?', [id]).changes > 0;
}
