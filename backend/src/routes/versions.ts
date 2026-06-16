import { Router } from 'express';
import db from '../db';

const router = Router();

// --- PATCH /api/versions/:id ---
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { note?: string | null; set_current?: boolean };

  if (body.set_current) {
    const version = db.get('SELECT prompt_id FROM versions WHERE id = ?', [id]) as { prompt_id: number } | null;
    if (!version) { res.status(404).json({ error: 'Version not found' }); return; }

    try {
      db.run('BEGIN');
      db.run('UPDATE versions SET is_current = 0 WHERE prompt_id = ?', [version.prompt_id]);
      db.run('UPDATE versions SET is_current = 1 WHERE id = ?', [id]);
      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
  }

  if ('note' in body) {
    db.run('UPDATE versions SET note = ? WHERE id = ?', [body.note ?? null, id]);
  }

  res.json({ ok: true });
});

// --- DELETE /api/versions/:id ---
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);

  const version = db.get(
    'SELECT prompt_id, is_current FROM versions WHERE id = ?',
    [id]
  ) as { prompt_id: number; is_current: number } | null;

  if (!version) { res.status(404).json({ error: 'Version not found' }); return; }

  const count = (db.get(
    'SELECT COUNT(*) AS n FROM versions WHERE prompt_id = ?',
    [version.prompt_id]
  ) as { n: number }).n;

  if (count <= 1) {
    res.status(409).json({ error: 'Cannot delete the only version' });
    return;
  }

  try {
    db.run('BEGIN');
    db.run('DELETE FROM versions WHERE id = ?', [id]);
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

  res.json({ ok: true });
});

export default router;
