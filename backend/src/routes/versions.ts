// Version-level routes: update note, set as current, delete.
import { Router } from 'express';
import db from '../db';

const router = Router();

// --- PATCH /api/versions/:id ---
// Accepts { note } to update note, or { set_current: true } to make this version active.
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { note?: string | null; set_current?: boolean };

  if (body.set_current) {
    // Atomically unset all other is_current flags on the same branch, then set this one
    const version = db.get('SELECT branch_id FROM versions WHERE id = ?', [id]) as { branch_id: number } | null;
    if (!version) { res.status(404).json({ error: 'Version not found' }); return; }

    try {
      db.run('BEGIN');
      db.run('UPDATE versions SET is_current = 0 WHERE branch_id = ?', [version.branch_id]);
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
// Guard: refuse to delete the only version on a branch — the branch would be empty.
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);

  const version = db.get(
    'SELECT branch_id, is_current FROM versions WHERE id = ?',
    [id]
  ) as { branch_id: number; is_current: number } | null;

  if (!version) { res.status(404).json({ error: 'Version not found' }); return; }

  const count = (db.get(
    'SELECT COUNT(*) AS n FROM versions WHERE branch_id = ?',
    [version.branch_id]
  ) as { n: number }).n;

  if (count <= 1) {
    res.status(409).json({ error: 'Cannot delete the only version on a branch' });
    return;
  }

  try {
    db.run('BEGIN');
    db.run('DELETE FROM versions WHERE id = ?', [id]);
    // If we deleted the current version, promote the most recent remaining one
    if (version.is_current) {
      db.run(
        'UPDATE versions SET is_current = 1 WHERE id = (SELECT id FROM versions WHERE branch_id = ? ORDER BY major DESC, minor DESC LIMIT 1)',
        [version.branch_id]
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
