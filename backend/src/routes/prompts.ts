// Prompt routes. GET returns sidebar-ready data (no full text body — that comes
// from a separate detail endpoint we'll add with the editor). POST scaffolds a
// full prompt: row + default 'main' branch + empty version 1.0, wrapped in a
// transaction so the DB never ends up with an orphaned prompt.
import { Router } from 'express';
import db from '../db';

interface PromptRow {
  id: number;
  name: string;
  folder_id: number | null;
  current_branch: string | null;
  current_version: string | null;
}

const router = Router();

router.get('/', (_req, res) => {
  const prompts = db.all(`
    SELECT
      p.id,
      p.name,
      p.folder_id,
      b.name                          AS current_branch,
      (v.major || '.' || v.minor)     AS current_version
    FROM prompts p
    LEFT JOIN branches b ON b.prompt_id = p.id AND b.name = 'main'
    LEFT JOIN versions v ON v.branch_id = b.id AND v.is_current = 1
    ORDER BY p.name
  `) as unknown as PromptRow[];

  res.json(prompts);
});

router.post('/', (req, res) => {
  const { name, folder_id, use_case, goal } = req.body as {
    name?: string;
    folder_id?: number | null;
    use_case?: string;
    goal?: string;
  };

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  db.run('BEGIN');
  try {
    const promptResult = db.run(
      'INSERT INTO prompts (name, folder_id, use_case, goal) VALUES (?, ?, ?, ?)',
      [name.trim(), folder_id ?? null, use_case ?? null, goal ?? null]
    );
    const promptId = Number(promptResult.lastInsertRowid);

    const branchResult = db.run(
      'INSERT INTO branches (prompt_id, name) VALUES (?, ?)',
      [promptId, 'main']
    );
    const branchId = Number(branchResult.lastInsertRowid);

    db.run(
      'INSERT INTO versions (branch_id, major, minor, text, is_current) VALUES (?, 1, 0, ?, 1)',
      [branchId, '']
    );

    db.run('COMMIT');
    res.status(201).json({ id: promptId });
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
});

export default router;
