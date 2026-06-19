import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Database as SQLiteDatabase } from 'node-sqlite3-wasm';
import { runMigrations, type Migration } from '../src/db/migrations';

function withDatabase(run: (db: SQLiteDatabase) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), 'prompt-studio-'));
  const db = new SQLiteDatabase(path.join(directory, 'test.db'));
  try {
    run(db);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test('fresh migrations are complete and idempotent', () => withDatabase(db => {
  runMigrations(db);
  runMigrations(db);

  const applied = db.all('SELECT version, name FROM schema_migrations ORDER BY version');
  assert.deepEqual(applied, [
    { version: 1, name: 'baseline_prompt_schema' },
    { version: 2, name: 'add_test_cases' },
    { version: 3, name: 'add_results_and_issues' },
    { version: 4, name: 'add_issue_resolutions' },
    { version: 5, name: 'add_diagnosed_issue_status' },
  ]);
  assert.ok(db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'test_cases'"));
  assert.ok(db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'evaluations'"));
  const issueColumns = db.all('PRAGMA table_info(issues)') as unknown as Array<{ name: string }>;
  assert.ok(issueColumns.some(column => column.name === 'resolution_note'));
  assert.ok(issueColumns.some(column => column.name === 'resolved_version_id'));
}));

test('existing v1 data is preserved and duplicate current rows are repaired', () => withDatabase(db => {
  db.exec(`
    CREATE TABLE prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT
    );
    CREATE TABLE versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      note TEXT,
      is_current INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO prompts (id, name, description) VALUES (7, 'kept', 'existing data');
    INSERT INTO versions (id, prompt_id, name, text, is_current) VALUES
      (10, 7, 'v1', 'first', 1),
      (11, 7, 'v2', 'second', 1);
  `);

  runMigrations(db);

  assert.deepEqual(db.get('SELECT id, name, description FROM prompts WHERE id = 7'), {
    id: 7, name: 'kept', description: 'existing data',
  });
  assert.equal((db.get('SELECT COUNT(*) AS count FROM versions WHERE prompt_id = 7') as { count: number }).count, 2);
  assert.equal((db.get('SELECT COUNT(*) AS count FROM versions WHERE prompt_id = 7 AND is_current = 1') as { count: number }).count, 1);
  assert.throws(() => db.run(
    "INSERT INTO versions (prompt_id, name, text, is_current) VALUES (7, 'v3', 'third', 1)"
  ));
}));

test('test-case constraints, Unicode JSON, uniqueness, and cascade deletion work', () => withDatabase(db => {
  runMigrations(db);
  const promptId = Number(db.run("INSERT INTO prompts (name) VALUES ('invoice')").lastInsertRowid);
  const variables = JSON.stringify({ query: 'Žiadosť\n第二行', language: 'slovenčina' });
  db.run(
    `INSERT INTO test_cases (prompt_id, name, variables_json)
     VALUES (?, 'Long invoice', ?)`,
    [promptId, variables]
  );

  assert.equal((db.get('SELECT variables_json FROM test_cases') as { variables_json: string }).variables_json, variables);
  assert.throws(() => db.run(
    "INSERT INTO test_cases (prompt_id, name) VALUES (?, 'long INVOICE')",
    [promptId]
  ));
  assert.throws(() => db.run(
    "INSERT INTO test_cases (prompt_id, name, temperature) VALUES (?, 'invalid', 3)",
    [promptId]
  ));

  db.run('DELETE FROM prompts WHERE id = ?', [promptId]);
  assert.equal((db.get('SELECT COUNT(*) AS count FROM test_cases') as { count: number }).count, 0);
}));

test('existing issues gain resolution fields without losing data', () => withDatabase(db => {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT INTO schema_migrations (version, name) VALUES
      (1, 'baseline_prompt_schema'),
      (2, 'add_test_cases'),
      (3, 'add_results_and_issues');
    CREATE TABLE prompts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT);
    CREATE TABLE versions (
      id INTEGER PRIMARY KEY,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      note TEXT,
      is_current INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE evaluations (id INTEGER PRIMARY KEY);
    CREATE TABLE issues (
      id INTEGER PRIMARY KEY,
      prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
      evaluation_id INTEGER,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT INTO prompts (id, name) VALUES (1, 'kept');
    INSERT INTO versions (id, prompt_id, name, text) VALUES (2, 1, 'fixed', 'updated prompt');
    INSERT INTO issues (id, prompt_id, title, note) VALUES (3, 1, 'Existing issue', 'Original note');
  `);

  runMigrations(db);
  db.run(
    "UPDATE issues SET status = 'diagnosed', resolution_note = ?, resolved_version_id = ? WHERE id = 3",
    ['Diagnosis', 2]
  );
  assert.deepEqual(
    db.get('SELECT title, note, resolution_note, resolved_version_id FROM issues WHERE id = 3'),
    {
      title: 'Existing issue',
      note: 'Original note',
      resolution_note: 'Diagnosis',
      resolved_version_id: 2,
    }
  );
  assert.throws(() => db.run("UPDATE issues SET status = 'invalid' WHERE id = 3"));
}));

test('a failed migration rolls back both schema and migration record', () => withDatabase(db => {
  const failing: Migration = {
    version: 99,
    name: 'deliberate_failure',
    up(database) {
      database.exec('CREATE TABLE should_rollback (id INTEGER PRIMARY KEY)');
      throw new Error('stop');
    },
  };

  assert.throws(() => runMigrations(db, [failing]), /Migration 99/);
  assert.equal(db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'should_rollback'"), null);
  assert.equal(db.get('SELECT 1 FROM schema_migrations WHERE version = 99'), null);
}));
