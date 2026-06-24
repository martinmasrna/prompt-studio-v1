import db from '../db';

export interface Config {
  id: number;
  prompt_id: number;
  name: string;
  temperature: number;
  top_p: number;
  top_k: number;
  max_tokens: number;
  enable_thinking: boolean;
  created_at: number;
  updated_at: number;
}

interface ConfigRow extends Omit<Config, 'enable_thinking'> {
  enable_thinking: number;
}

export interface ConfigValues {
  name: string;
  temperature: number;
  top_p: number;
  top_k: number;
  max_tokens: number;
  enable_thinking: boolean;
}

function mapRow(row: ConfigRow): Config {
  return { ...row, enable_thinking: row.enable_thinking === 1 };
}

export function promptExists(promptId: number): boolean {
  return db.get('SELECT 1 AS found FROM prompts WHERE id = ?', [promptId]) !== null;
}

// A version's default_config_id is optional, but when set it must point at a
// config belonging to the same prompt. Returns true for "no default" too.
export function configBelongsToPrompt(configId: number | null | undefined, promptId: number): boolean {
  if (configId === undefined || configId === null) return true;
  if (!Number.isInteger(configId)) return false;
  return db.get('SELECT 1 AS found FROM configs WHERE id = ? AND prompt_id = ?', [configId, promptId]) !== null;
}

export function listConfigs(promptId: number): Config[] {
  const rows = db.all(
    'SELECT * FROM configs WHERE prompt_id = ? ORDER BY name COLLATE NOCASE, id',
    [promptId]
  ) as unknown as ConfigRow[];
  return rows.map(mapRow);
}

export function getConfig(id: number): Config | null {
  const row = db.get('SELECT * FROM configs WHERE id = ?', [id]) as unknown as ConfigRow | null;
  return row ? mapRow(row) : null;
}

export function createConfig(promptId: number, values: ConfigValues): Config {
  const result = db.run(
    `INSERT INTO configs (
      prompt_id, name, temperature, top_p, top_k, max_tokens, enable_thinking
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      promptId,
      values.name,
      values.temperature,
      values.top_p,
      values.top_k,
      values.max_tokens,
      values.enable_thinking ? 1 : 0,
    ]
  );
  return getConfig(Number(result.lastInsertRowid))!;
}

export function updateConfig(id: number, values: Partial<ConfigValues>): Config | null {
  if (!getConfig(id)) return null;

  const fields: string[] = [];
  const params: Array<string | number | null> = [];
  const add = (column: string, value: string | number | null) => {
    fields.push(`${column} = ?`);
    params.push(value);
  };

  if (values.name !== undefined) add('name', values.name);
  if (values.temperature !== undefined) add('temperature', values.temperature);
  if (values.top_p !== undefined) add('top_p', values.top_p);
  if (values.top_k !== undefined) add('top_k', values.top_k);
  if (values.max_tokens !== undefined) add('max_tokens', values.max_tokens);
  if (values.enable_thinking !== undefined) add('enable_thinking', values.enable_thinking ? 1 : 0);

  if (fields.length > 0) {
    fields.push('updated_at = unixepoch()');
    params.push(id);
    db.run(`UPDATE configs SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  return getConfig(id);
}

export function deleteConfig(id: number): boolean {
  return db.run('DELETE FROM configs WHERE id = ?', [id]).changes > 0;
}
