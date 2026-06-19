import db from '../db';

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

interface TestCaseRow extends Omit<TestCase, 'variables' | 'enable_thinking'> {
  variables_json: string;
  enable_thinking: number;
}

export interface TestCaseValues {
  name: string;
  description: string | null;
  variables: Record<string, string>;
  system_prompt: string;
  temperature: number;
  top_p: number;
  top_k: number;
  max_tokens: number;
  enable_thinking: boolean;
}

function mapRow(row: TestCaseRow): TestCase {
  const { variables_json, enable_thinking, ...rest } = row;
  return {
    ...rest,
    variables: JSON.parse(variables_json) as Record<string, string>,
    enable_thinking: enable_thinking === 1,
  };
}

export function promptExists(promptId: number): boolean {
  return db.get('SELECT 1 AS found FROM prompts WHERE id = ?', [promptId]) !== null;
}

export function listTestCases(promptId: number): TestCase[] {
  const rows = db.all(
    'SELECT * FROM test_cases WHERE prompt_id = ? ORDER BY name COLLATE NOCASE, id',
    [promptId]
  ) as unknown as TestCaseRow[];
  return rows.map(mapRow);
}

export function getTestCase(id: number): TestCase | null {
  const row = db.get('SELECT * FROM test_cases WHERE id = ?', [id]) as unknown as TestCaseRow | null;
  return row ? mapRow(row) : null;
}

export function createTestCase(promptId: number, values: TestCaseValues): TestCase {
  const result = db.run(
    `INSERT INTO test_cases (
      prompt_id, name, description, variables_json, system_prompt,
      temperature, top_p, top_k, max_tokens, enable_thinking
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      promptId,
      values.name,
      values.description,
      JSON.stringify(values.variables),
      values.system_prompt,
      values.temperature,
      values.top_p,
      values.top_k,
      values.max_tokens,
      values.enable_thinking ? 1 : 0,
    ]
  );
  return getTestCase(Number(result.lastInsertRowid))!;
}

export function updateTestCase(id: number, values: Partial<TestCaseValues>): TestCase | null {
  if (!getTestCase(id)) return null;

  const fields: string[] = [];
  const params: Array<string | number | null> = [];
  const add = (column: string, value: string | number | null) => {
    fields.push(`${column} = ?`);
    params.push(value);
  };

  if (values.name !== undefined) add('name', values.name);
  if (values.description !== undefined) add('description', values.description);
  if (values.variables !== undefined) add('variables_json', JSON.stringify(values.variables));
  if (values.system_prompt !== undefined) add('system_prompt', values.system_prompt);
  if (values.temperature !== undefined) add('temperature', values.temperature);
  if (values.top_p !== undefined) add('top_p', values.top_p);
  if (values.top_k !== undefined) add('top_k', values.top_k);
  if (values.max_tokens !== undefined) add('max_tokens', values.max_tokens);
  if (values.enable_thinking !== undefined) add('enable_thinking', values.enable_thinking ? 1 : 0);

  if (fields.length > 0) {
    fields.push('updated_at = unixepoch()');
    params.push(id);
    db.run(`UPDATE test_cases SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  return getTestCase(id);
}

export function deleteTestCase(id: number): boolean {
  return db.run('DELETE FROM test_cases WHERE id = ?', [id]).changes > 0;
}
