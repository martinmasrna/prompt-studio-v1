import db from '../db';

// Generic existence/ownership lookups shared by the resource routers. Kept
// table-agnostic so prompts, versions, and test cases all check the same way.

export function entityExists(table: 'prompts' | 'versions' | 'test_cases', id: number): boolean {
  return db.get(`SELECT 1 AS found FROM ${table} WHERE id = ?`, [id]) !== null;
}

export function entityBelongsToPrompt(table: 'versions' | 'test_cases', id: number, promptId: number): boolean {
  return db.get(`SELECT 1 AS found FROM ${table} WHERE id = ? AND prompt_id = ?`, [id, promptId]) !== null;
}
