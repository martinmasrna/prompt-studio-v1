// Single-version routes (mounted at /api/versions):
//   PATCH  /:id — update a version: set it current, and/or edit its text/name/note
//   DELETE /:id — delete a version (refuses to delete a prompt's only version)
// Each PATCH field is independent, so the frontend can update just one thing
// (e.g. only the note) without resending the rest.
import { Router } from 'express';
import db from '../db';
import { configBelongsToPrompt } from '../repositories/configs';
import { setCurrentVersion, deleteVersion } from '../repositories/versions';

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

  if (body.set_current) setCurrentVersion(version.prompt_id, id);

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
  const outcome = deleteVersion(Number(req.params.id));
  if (outcome === 'missing') { res.status(404).json({ error: 'Version not found' }); return; }
  if (outcome === 'only-version') { res.status(409).json({ error: 'Cannot delete the only version' }); return; }
  res.json({ ok: true });
});

export default router;
