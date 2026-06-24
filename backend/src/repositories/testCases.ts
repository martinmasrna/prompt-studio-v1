import db from '../db';

export interface TestCase {
  id: number;
  prompt_id: number;
  name: string;
  description: string | null;
  variables: Record<string, string>;
  created_at: number;
  updated_at: number;
}

interface TestCaseRow extends Omit<TestCase, 'variables'> {
  variables_json: string;
}

export interface TestCaseValues {
  name: string;
  description: string | null;
  variables: Record<string, string>;
}

function mapRow(row: TestCaseRow): TestCase {
  const { variables_json, ...rest } = row;
  return {
    ...rest,
    variables: JSON.parse(variables_json) as Record<string, string>,
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
      prompt_id, name, description, variables_json
    ) VALUES (?, ?, ?, ?)`,
    [
      promptId,
      values.name,
      values.description,
      JSON.stringify(values.variables),
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
