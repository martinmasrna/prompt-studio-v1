import { Router } from 'express';
import db from '../db';

interface PromptRow {
  id: number;
  name: string;
  current_version: string | null;
}

const router = Router();

router.get('/', (_req, res) => {
  const prompts = db.all(`
    SELECT p.id, p.name, v.name AS current_version
    FROM prompts p
    LEFT JOIN versions v ON v.prompt_id = p.id AND v.is_current = 1
    ORDER BY p.name
  `) as unknown as PromptRow[];

  res.json(prompts);
});

router.post('/', (req, res) => {
  const { name } = req.body as { name?: string };

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  db.run('BEGIN');
  try {
    const promptResult = db.run('INSERT INTO prompts (name) VALUES (?)', [name.trim()]);
    const promptId = Number(promptResult.lastInsertRowid);

    db.run(
      'INSERT INTO versions (prompt_id, name, text, is_current) VALUES (?, ?, ?, 1)',
      [promptId, 'v1', '']
    );

    db.run('COMMIT');
    res.status(201).json({ id: promptId });
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
});

export default router;
