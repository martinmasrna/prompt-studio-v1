// Single-prompt routes (also mounted at /api/prompts):
//   GET    /:id            — one prompt + its current version
//   GET    /:id/versions   — all versions of a prompt (newest first)
//   POST   /:id/versions   — save a new version, making it the current one
//   PATCH  /:id            — rename a prompt
//   DELETE /:id            — delete a prompt (its versions cascade away)
// "Current version" is tracked by a single is_current = 1 row per prompt;
// saving a new version flips the old current off inside one transaction.
import { Router } from 'express';
import db from '../db';

const router = Router();

// --- GET /api/prompts/:id ---
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);

  const prompt = db.get(
    'SELECT id, name FROM prompts WHERE id = ?',
    [id]
  ) as Record<string, unknown> | null;

  if (!prompt) { res.status(404).json({ error: 'Prompt not found' }); return; }

  const currentVersion = db.get(
    'SELECT id, name, text, note, is_current FROM versions WHERE prompt_id = ? AND is_current = 1',
    [id]
  ) as Record<string, unknown> | null;

  res.json({ ...prompt, current_version: currentVersion ?? null });
});

// --- GET /api/prompts/:id/versions ---
router.get('/:id/versions', (req, res) => {
  const promptId = Number(req.params.id);
  const versions = db.all(
    'SELECT id, name, text, note, is_current FROM versions WHERE prompt_id = ? ORDER BY id DESC',
    [promptId]
  ) as unknown as object[];
  res.json(versions);
});

// --- POST /api/prompts/:id/versions ---
router.post('/:id/versions', (req, res) => {
  const promptId = Number(req.params.id);
  const { text, name, note } = req.body as { text: string; name?: string; note?: string };

  if (typeof text !== 'string') { res.status(400).json({ error: 'text is required' }); return; }
  if (!name || !name.trim()) { res.status(400).json({ error: 'name is required' }); return; }

  db.run('BEGIN');
  try {
    db.run('UPDATE versions SET is_current = 0 WHERE prompt_id = ?', [promptId]);
    const result = db.run(
      'INSERT INTO versions (prompt_id, name, text, note, is_current) VALUES (?, ?, ?, ?, 1)',
      [promptId, name.trim(), text, note?.trim() || null]
    );
    db.run('COMMIT');
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
});

// --- PATCH /api/prompts/:id ---
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;

  const fields: string[] = [];
  const vals: unknown[] = [];

  if (body.name != null) { fields.push('name = ?'); vals.push(body.name); }

  if (fields.length > 0) {
    vals.push(id);
    db.run(`UPDATE prompts SET ${fields.join(', ')} WHERE id = ?`, vals as never);
  }

  res.json({ ok: true });
});

// --- DELETE /api/prompts/:id ---
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.run('DELETE FROM prompts WHERE id = ?', [id]);
  res.json({ ok: true });
});

export default router;
