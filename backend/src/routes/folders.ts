// Folder routes. Folders are stored flat in the DB (parent_id self-reference);
// we build the nested tree in memory before responding — dataset will always be small.
import { Router } from 'express';
import db from '../db';

interface FolderRow {
  id: number;
  name: string;
  parent_id: number | null;
}

export interface FolderNode extends FolderRow {
  children: FolderNode[];
}

const router = Router();

function buildTree(rows: FolderRow[]): FolderNode[] {
  const map = new Map<number, FolderNode>();
  const roots: FolderNode[] = [];

  for (const row of rows) {
    map.set(row.id, { ...row, children: [] });
  }

  for (const node of map.values()) {
    if (node.parent_id === null) {
      roots.push(node);
    } else {
      const parent = map.get(node.parent_id);
      if (parent) parent.children.push(node);
    }
  }

  return roots;
}

router.get('/', (_req, res) => {
  const rows = db.all('SELECT id, name, parent_id FROM folders ORDER BY name') as unknown as FolderRow[];
  res.json(buildTree(rows));
});

router.post('/', (req, res) => {
  const { name, parent_id } = req.body as { name?: string; parent_id?: number | null };

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const result = db.run(
    'INSERT INTO folders (name, parent_id) VALUES (?, ?)',
    [name.trim(), parent_id ?? null]
  );

  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

export default router;
