import db from '../db';

export interface NewVersion {
  name: string;
  text: string;
  note: string | null;
  system_prompt: string;
  default_config_id: number | null;
}

// Exactly one version per prompt carries is_current = 1. The three mutations
// that touch that invariant live here so it has a single owner; simple reads
// and per-field edits stay in the routes.

// Save a version and make it the prompt's current one, flipping the previous
// current off in the same transaction.
export function createVersion(promptId: number, values: NewVersion): number {
  db.run('BEGIN');
  try {
    db.run('UPDATE versions SET is_current = 0 WHERE prompt_id = ?', [promptId]);
    const result = db.run(
      'INSERT INTO versions (prompt_id, name, text, note, is_current, system_prompt, default_config_id) VALUES (?, ?, ?, ?, 1, ?, ?)',
      [promptId, values.name, values.text, values.note, values.system_prompt, values.default_config_id]
    );
    db.run('COMMIT');
    return Number(result.lastInsertRowid);
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

// Flip the current-version flag to this version within its prompt.
export function setCurrentVersion(promptId: number, versionId: number): void {
  db.run('BEGIN');
  try {
    db.run('UPDATE versions SET is_current = 0 WHERE prompt_id = ?', [promptId]);
    db.run('UPDATE versions SET is_current = 1 WHERE id = ?', [versionId]);
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

// Delete a version, refusing a prompt's only version and promoting the newest
// remaining version to current when the deleted one was current.
export function deleteVersion(versionId: number): 'deleted' | 'missing' | 'only-version' {
  const version = db.get(
    'SELECT prompt_id, is_current FROM versions WHERE id = ?',
    [versionId]
  ) as { prompt_id: number; is_current: number } | null;
  if (!version) return 'missing';

  const { n } = db.get(
    'SELECT COUNT(*) AS n FROM versions WHERE prompt_id = ?',
    [version.prompt_id]
  ) as { n: number };
  if (n <= 1) return 'only-version';

  db.run('BEGIN');
  try {
    db.run('DELETE FROM versions WHERE id = ?', [versionId]);
    if (version.is_current) {
      db.run(
        'UPDATE versions SET is_current = 1 WHERE id = (SELECT id FROM versions WHERE prompt_id = ? ORDER BY id DESC LIMIT 1)',
        [version.prompt_id]
      );
    }
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
  return 'deleted';
}
