// Branch-level routes: creating new versions on an existing branch.
import { Router } from 'express';
import db from '../db';

const router = Router();

// --- POST /api/branches/:id/versions ---
// bump: 'minor' increments x.N → x.(N+1), 'major' increments N.x → (N+1).0
router.post('/:id/versions', (req, res) => {
  const branchId = Number(req.params.id);
  const { text, note, bump } = req.body as {
    text: string;
    note?: string;
    bump: 'minor' | 'major';
  };

  if (typeof text !== 'string') { res.status(400).json({ error: 'text is required' }); return; }

  const current = db.get(
    'SELECT major, minor FROM versions WHERE branch_id = ? AND is_current = 1',
    [branchId]
  ) as { major: number; minor: number } | null;

  const base = current ?? { major: 1, minor: 0 };
  const newMajor = bump === 'major' ? base.major + 1 : base.major;
  const newMinor = bump === 'major' ? 0 : base.minor + 1;

  db.run('BEGIN');
  try {
    db.run('UPDATE versions SET is_current = 0 WHERE branch_id = ?', [branchId]);
    const result = db.run(
      'INSERT INTO versions (branch_id, major, minor, text, note, is_current) VALUES (?, ?, ?, ?, ?, 1)',
      [branchId, newMajor, newMinor, text, note ?? null]
    );
    db.run('COMMIT');
    res.status(201).json({
      id: Number(result.lastInsertRowid),
      major: newMajor,
      minor: newMinor,
    });
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
});

export default router;
