import { Database as SQLiteDatabase } from 'node-sqlite3-wasm';
import path from 'path';
import { runMigrations } from './migrations';

const DB_PATH = process.env.PROMPT_STUDIO_DB_PATH
  ? path.resolve(process.env.PROMPT_STUDIO_DB_PATH)
  : path.join(__dirname, '../../data/prompt-studio.db');

const db = new SQLiteDatabase(DB_PATH);
runMigrations(db);

export default db;
