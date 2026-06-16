import { Database as SQLiteDatabase } from 'node-sqlite3-wasm';
import path from 'path';
import { SCHEMA_SQL } from './schema';

const DB_PATH = path.join(__dirname, '../../data/prompt-studio.db');

const db = new SQLiteDatabase(DB_PATH);

// Migrate away from the old branches-based schema if needed
const tables = (db.all("SELECT name FROM sqlite_master WHERE type='table'") as { name: string }[]).map(r => r.name);
if (tables.includes('branches')) {
  db.exec(`
    DROP TABLE IF EXISTS versions;
    DROP TABLE IF EXISTS branches;
    DROP TABLE IF EXISTS prompt_tags;
    DROP TABLE IF EXISTS tags;
  `);
}

db.exec(SCHEMA_SQL);

// Migration: merge use_case + goal → description (for very old DBs).
// Must run before the use_case/goal columns are dropped below.
const promptCols = (db.all("PRAGMA table_info(prompts)") as unknown as { name: string }[]).map(c => c.name);
if (!promptCols.includes('description')) {
  db.exec("ALTER TABLE prompts ADD COLUMN description TEXT");
  db.exec("UPDATE prompts SET description = TRIM(COALESCE(use_case,'') || CASE WHEN use_case IS NOT NULL AND goal IS NOT NULL THEN ' — ' ELSE '' END || COALESCE(goal,'')) WHERE description IS NULL");
}

// Drop columns left over from older schemas (CREATE TABLE IF NOT EXISTS won't remove them).
// All of these are now unused: per-row timestamps and the pre-description use_case/goal fields.
function dropColumnIfExists(table: string, column: string): void {
  const cols = (db.all(`PRAGMA table_info(${table})`) as unknown as { name: string }[]).map(c => c.name);
  if (cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
}

dropColumnIfExists('prompts',  'created_at');
dropColumnIfExists('prompts',  'updated_at');
dropColumnIfExists('prompts',  'use_case');
dropColumnIfExists('prompts',  'goal');
dropColumnIfExists('versions', 'created_at');

// Folders were removed entirely. Drop the prompts.folder_id column first (this
// clears its foreign key into folders) so the folders table can be dropped safely.
dropColumnIfExists('prompts', 'folder_id');
db.exec('DROP TABLE IF EXISTS folders');

export default db;
