// Single-version routes (mounted at /api/versions):
//   PATCH  /:id — update a version: set it current, and/or edit its text/name/note
//   DELETE /:id — delete a version (refuses to delete a prompt's only version)
// Each PATCH field is independent, so the frontend can update just one thing
// (e.g. only the note) without resending the rest.
import { Router } from 'express';
import db from '../db';
import { configBelongsToPrompt } from '../repositories/configs';

const router = Router();

// --- PATCH /api/versions/:id ---
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as {
    note?: string | null; set_current?: boolean; text?: string; name?: string;
    system_prompt?: string; default_config_id?: number | null;
  };

  const version = db.get('SELECT prompt_id FROM versions WHERE id = ?', [id]) as { prompt_id: number } | null;
  if (!version) { res.status(404).json({ error: 'Version not found' }); return; }

  if ('system_prompt' in body && typeof body.system_prompt !== 'string') {
    res.status(400).json({ error: 'system_prompt must be a string' });
    return;
  }
  if ('default_config_id' in body && !configBelongsToPrompt(body.default_config_id, version.prompt_id)) {
    res.status(400).json({ error: 'default_config_id must reference a config of this prompt' });
    return;
  }

  if (body.set_current) {
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

  if (typeof body.text === 'string') {
    db.run('UPDATE versions SET text = ? WHERE id = ?', [body.text, id]);
  }

  if (typeof body.name === 'string' && body.name.trim()) {
    db.run('UPDATE versions SET name = ? WHERE id = ?', [body.name.trim(), id]);
  }

  if ('system_prompt' in body) {
    db.run('UPDATE versions SET system_prompt = ? WHERE id = ?', [body.system_prompt ?? '', id]);
  }

  if ('default_config_id' in body) {
    db.run('UPDATE versions SET default_config_id = ? WHERE id = ?', [body.default_config_id ?? null, id]);
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
