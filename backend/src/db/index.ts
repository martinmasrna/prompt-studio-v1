// Single shared database connection for the entire backend process.
// Using node-sqlite3-wasm (pure WebAssembly) to avoid node-gyp / Python build toolchain
// requirements — better-sqlite3 has the same synchronous API but requires native compilation.
// The database file lives in /backend/data/ so it persists across server restarts.

import { Database as SQLiteDatabase } from 'node-sqlite3-wasm';
import path from 'path';
import { SCHEMA_SQL } from './schema';

const DB_PATH = path.join(__dirname, '../../data/prompt-studio.db');

const db = new SQLiteDatabase(DB_PATH);

// Apply schema as a single exec — individual CREATE IF NOT EXISTS statements are idempotent
db.exec(SCHEMA_SQL);

// Migration: merge use_case + goal → description
const cols = (db.all("PRAGMA table_info(prompts)") as unknown as { name: string }[]).map(c => c.name);
if (!cols.includes('description')) {
  db.exec("ALTER TABLE prompts ADD COLUMN description TEXT");
  db.exec("UPDATE prompts SET description = TRIM(COALESCE(use_case,'') || CASE WHEN use_case IS NOT NULL AND goal IS NOT NULL THEN ' — ' ELSE '' END || COALESCE(goal,'')) WHERE description IS NULL");
}

export default db;
