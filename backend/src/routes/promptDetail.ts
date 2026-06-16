// Full prompt detail routes: GET/PATCH/DELETE /api/prompts/:id
// Also owns /api/prompts/:id/branches since it needs the same prompt-scoped context.
import { Router } from 'express';
import db from '../db';

const router = Router();

// --- GET /api/prompts/:id ---
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);

  const prompt = db.get(`
    SELECT p.id, p.name, p.description, p.folder_id,
           f.name AS folder_name, p.created_at, p.updated_at
    FROM prompts p
    LEFT JOIN folders f ON f.id = p.folder_id
    WHERE p.id = ?
  `, [id]) as Record<string, unknown> | null;

  if (!prompt) { res.status(404).json({ error: 'Prompt not found' }); return; }

  const tags = (db.all(`
    SELECT t.name FROM tags t
    JOIN prompt_tags pt ON pt.tag_id = t.id
    WHERE pt.prompt_id = ? ORDER BY t.name
  `, [id]) as unknown as { name: string }[]).map(r => r.name);

  // The version marked is_current on the branch named 'main' is the default view.
  // If the user has switched to another branch, the UI will update activeVersionId separately.
  const currentVersion = db.get(`
    SELECT v.id, v.branch_id, b.name AS branch_name,
           v.major, v.minor, v.text, v.note, v.is_current, v.created_at
    FROM versions v
    JOIN branches b ON b.id = v.branch_id
    WHERE b.prompt_id = ? AND v.is_current = 1
    ORDER BY b.id
    LIMIT 1
  `, [id]) as Record<string, unknown> | null;

  res.json({ ...prompt, tags, current_version: currentVersion ?? null });
});

// --- GET /api/prompts/:id/branches (all branches + all versions with text) ---
router.get('/:id/branches', (req, res) => {
  const promptId = Number(req.params.id);

  const branches = db.all(
    'SELECT id, name FROM branches WHERE prompt_id = ? ORDER BY id',
    [promptId]
  ) as unknown as { id: number; name: string }[];

  const result = branches.map(branch => {
    const versions = db.all(
      `SELECT id, major, minor, text, note, is_current, created_at
       FROM versions WHERE branch_id = ? ORDER BY major DESC, minor DESC`,
      [branch.id]
    ) as unknown as object[];
    return { ...branch, versions };
  });

  res.json(result);
});

// --- POST /api/prompts/:id/branches ---
router.post('/:id/branches', (req, res) => {
  const promptId = Number(req.params.id);
  const { name } = req.body as { name?: string };

  if (!name || !name.trim()) { res.status(400).json({ error: 'name is required' }); return; }

  // Copy the current version's text so the new branch starts from a meaningful baseline
  const currentVersion = db.get(`
    SELECT v.text FROM versions v
    JOIN branches b ON v.branch_id = b.id
    WHERE b.prompt_id = ? AND v.is_current = 1
    LIMIT 1
  `, [promptId]) as { text: string } | null;

  db.run('BEGIN');
  try {
    const branchId = Number(
      db.run('INSERT INTO branches (prompt_id, name) VALUES (?, ?)', [promptId, name.trim()]).lastInsertRowid
    );
    const versionId = Number(
      db.run(
        'INSERT INTO versions (branch_id, major, minor, text, is_current) VALUES (?, 1, 0, ?, 1)',
        [branchId, currentVersion?.text ?? '']
      ).lastInsertRowid
    );
    db.run('COMMIT');
    res.status(201).json({ id: branchId, version_id: versionId });
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
});

// --- PATCH /api/prompts/:id ---
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;

  const fields: string[] = ['updated_at = unixepoch()'];
  const vals: unknown[] = [];

  if (body.name != null)        { fields.push('name = ?');        vals.push(body.name); }
  if ('description' in body)    { fields.push('description = ?'); vals.push(body.description ?? null); }
  if ('folder_id' in body)      { fields.push('folder_id = ?');   vals.push(body.folder_id ?? null); }

  if (fields.length > 1) {
    vals.push(id);
    db.run(`UPDATE prompts SET ${fields.join(', ')} WHERE id = ?`, vals as never);
  }

  if (Array.isArray(body.tags)) {
    db.run('DELETE FROM prompt_tags WHERE prompt_id = ?', [id]);
    for (const raw of body.tags as unknown[]) {
      const tagName = String(raw).trim();
      if (!tagName) continue;
      db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName]);
      const tag = db.get('SELECT id FROM tags WHERE name = ?', [tagName]) as { id: number };
      db.run('INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)', [id, tag.id]);
    }
  }

  res.json({ ok: true });
});

// --- DELETE /api/prompts/:id ---
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  // Cascade handles branches → versions → prompt_tags via FK ON DELETE CASCADE
  db.run('DELETE FROM prompts WHERE id = ?', [id]);
  res.json({ ok: true });
});

export default router;
