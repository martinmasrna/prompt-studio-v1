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
    { version: 6, name: 'add_evaluation_note' },
    { version: 7, name: 'drop_prompt_description' },
    { version: 8, name: 'decompose_test_config' },
    { version: 9, name: 'add_comparison_note' },
    { version: 10, name: 'make_issues_flagged_results' },
    { version: 11, name: 'cascade_prompt_evaluations' },
    { version: 12, name: 'repair_issues_evaluation_fk' },
  ]);
  const promptColumns = db.all('PRAGMA table_info(prompts)') as unknown as Array<{ name: string }>;
  assert.ok(!promptColumns.some(column => column.name === 'description'));
  assert.ok(db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'test_cases'"));
  assert.ok(db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'evaluations'"));
  assert.ok(db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'configs'"));
  const issueColumns = db.all('PRAGMA table_info(issues)') as unknown as Array<{ name: string }>;
  assert.ok(!issueColumns.some(column => column.name === 'id'));
  assert.ok(!issueColumns.some(column => column.name === 'prompt_id'));
  assert.ok(issueColumns.some(column => column.name === 'evaluation_id'));
  assert.ok(issueColumns.some(column => column.name === 'resolution_note'));
  assert.ok(issueColumns.some(column => column.name === 'resolved_version_id'));
  const evaluationColumns = db.all('PRAGMA table_info(evaluations)') as unknown as Array<{ name: string }>;
  assert.ok(evaluationColumns.some(column => column.name === 'note'));
  const comparisonColumns = db.all('PRAGMA table_info(evaluation_batches)') as unknown as Array<{ name: string }>;
  assert.ok(comparisonColumns.some(column => column.name === 'note'));
  // v8 moves sampling params into configs and the system prompt onto versions.
  const testCaseColumns = db.all('PRAGMA table_info(test_cases)') as unknown as Array<{ name: string }>;
  assert.ok(!testCaseColumns.some(column => column.name === 'temperature'));
  assert.ok(!testCaseColumns.some(column => column.name === 'system_prompt'));
  const versionColumns = db.all('PRAGMA table_info(versions)') as unknown as Array<{ name: string }>;
  assert.ok(versionColumns.some(column => column.name === 'system_prompt'));
  assert.ok(versionColumns.some(column => column.name === 'default_config_id'));
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

  // The prompt row survives; the description column is dropped (migration 7).
  assert.deepEqual(db.get('SELECT id, name FROM prompts WHERE id = 7'), {
    id: 7, name: 'kept',
  });
  const promptColumns = db.all('PRAGMA table_info(prompts)') as unknown as Array<{ name: string }>;
  assert.ok(!promptColumns.some(column => column.name === 'description'));
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
  // Sampling params now live on configs, which enforce the range checks.
  db.run("INSERT INTO configs (prompt_id, name, temperature) VALUES (?, 'ok', 1.5)", [promptId]);
  assert.throws(() => db.run(
    "INSERT INTO configs (prompt_id, name, temperature) VALUES (?, 'invalid', 3)",
    [promptId]
  ));

  db.run('DELETE FROM prompts WHERE id = ?', [promptId]);
  assert.equal((db.get('SELECT COUNT(*) AS count FROM test_cases') as { count: number }).count, 0);
  assert.equal((db.get('SELECT COUNT(*) AS count FROM configs') as { count: number }).count, 0);
}));

test('v8 decomposes bundled test config, preserving data', () => withDatabase(db => {
  // Seed a pre-v8 database: migrations 1–7 applied, test_cases still carrying
  // the bundled system_prompt + sampling params.
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT INTO schema_migrations (version, name) VALUES
      (1, 'baseline_prompt_schema'), (2, 'add_test_cases'),
      (3, 'add_results_and_issues'), (4, 'add_issue_resolutions'),
      (5, 'add_diagnosed_issue_status'), (6, 'add_evaluation_note'),
      (7, 'drop_prompt_description');
    CREATE TABLE prompts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      name TEXT NOT NULL, text TEXT NOT NULL, note TEXT,
      is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1))
    );
    CREATE TABLE test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      name TEXT NOT NULL, description TEXT,
      variables_json TEXT NOT NULL DEFAULT '{}',
      system_prompt TEXT NOT NULL DEFAULT '',
      temperature REAL NOT NULL DEFAULT 0.7,
      top_p REAL NOT NULL DEFAULT 1.0,
      top_k INTEGER NOT NULL DEFAULT 40,
      max_tokens INTEGER NOT NULL DEFAULT 1024,
      enable_thinking INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO prompts (id, name) VALUES (1, 'p');
    INSERT INTO versions (id, prompt_id, name, text, is_current) VALUES
      (10, 1, 'old', 't1', 0),
      (11, 1, 'cur', 't2', 1);
    -- Two test cases share the default tuple (deduped to one config); a third
    -- carries a non-default tuple plus a system prompt (the bearer).
    INSERT INTO test_cases (id, prompt_id, name, variables_json, system_prompt,
                            temperature, top_p, top_k, max_tokens, enable_thinking) VALUES
      (1, 1, 'a', '{}', '', 0.7, 1.0, 40, 1024, 0),
      (2, 1, 'b', '{}', '', 0.7, 1.0, 40, 1024, 0),
      (3, 1, 'c', '{"q":"x"}', 'PERSONA', 0.3, 1.0, 40, 2048, 0);
  `);

  runMigrations(db);

  // Distinct parameter tuples become two configs; the default tuple is "Default".
  const configs = db.all('SELECT id, name FROM configs WHERE prompt_id = 1 ORDER BY id') as unknown as Array<{ id: number; name: string }>;
  assert.equal(configs.length, 2);
  const defaultConfig = configs.find(c => c.name === 'Default');
  const bearerConfig = configs.find(c => c.name !== 'Default');
  assert.ok(defaultConfig, 'a Default config exists');
  assert.equal(bearerConfig?.name, 'temp 0.3, 2048 tok');

  // The system prompt moves onto the current version, with the bearer's config
  // as that version's default; the other version stays empty with the Default.
  const current = db.get('SELECT system_prompt, default_config_id FROM versions WHERE id = 11') as { system_prompt: string; default_config_id: number };
  assert.equal(current.system_prompt, 'PERSONA');
  assert.equal(current.default_config_id, bearerConfig!.id);
  const old = db.get('SELECT system_prompt, default_config_id FROM versions WHERE id = 10') as { system_prompt: string; default_config_id: number };
  assert.equal(old.system_prompt, '');
  assert.equal(old.default_config_id, defaultConfig!.id);

  // test_cases keeps every scenario and its variables; the bundled columns are gone.
  const testCaseColumns = db.all('PRAGMA table_info(test_cases)') as unknown as Array<{ name: string }>;
  assert.ok(!testCaseColumns.some(c => c.name === 'temperature'));
  assert.ok(!testCaseColumns.some(c => c.name === 'system_prompt'));
  assert.equal((db.get('SELECT COUNT(*) AS count FROM test_cases') as { count: number }).count, 3);
  assert.equal((db.get("SELECT variables_json FROM test_cases WHERE id = 3") as { variables_json: string }).variables_json, '{"q":"x"}');
}));

test('legacy issues become flagged results and manual issues are dropped', () => withDatabase(db => {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT INTO schema_migrations (version, name) VALUES
      (1, 'baseline_prompt_schema'), (2, 'add_test_cases'),
      (3, 'add_results_and_issues'), (4, 'add_issue_resolutions'),
      (5, 'add_diagnosed_issue_status'), (6, 'add_evaluation_note'),
      (7, 'drop_prompt_description'), (8, 'decompose_test_config'),
      (9, 'add_comparison_note');
    CREATE TABLE prompts (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE versions (
      id INTEGER PRIMARY KEY,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      note TEXT,
      is_current INTEGER NOT NULL DEFAULT 0,
      system_prompt TEXT NOT NULL DEFAULT '',
      default_config_id INTEGER
    );
    CREATE TABLE test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      name TEXT NOT NULL, description TEXT, variables_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE evaluation_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (kind IN ('comparison')),
      note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER REFERENCES evaluation_batches(id) ON DELETE CASCADE,
      test_case_id INTEGER REFERENCES test_cases(id) ON DELETE SET NULL,
      prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
      version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
      source TEXT NOT NULL CHECK (source IN ('sandbox', 'ab', 'manual')),
      prompt_name_snapshot TEXT NOT NULL, test_name_snapshot TEXT,
      version_name_snapshot TEXT NOT NULL, prompt_template_snapshot TEXT NOT NULL,
      rendered_prompt_snapshot TEXT NOT NULL,
      variables_json TEXT NOT NULL CHECK (json_valid(variables_json) AND json_type(variables_json) = 'object'),
      system_prompt TEXT NOT NULL DEFAULT '',
      temperature REAL NOT NULL, top_p REAL NOT NULL, top_k INTEGER NOT NULL,
      max_tokens INTEGER NOT NULL, enable_thinking INTEGER NOT NULL,
      model_id_snapshot TEXT NOT NULL, model_label_snapshot TEXT NOT NULL,
      upstream_model_snapshot TEXT NOT NULL,
      response_text TEXT, error_text TEXT, note TEXT,
      tokens_used INTEGER, latency_ms INTEGER,
      executed_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE issues (
      id INTEGER PRIMARY KEY,
      prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
      evaluation_id INTEGER,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'diagnosed', 'closed')),
      note TEXT,
      resolution_note TEXT,
      resolved_version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT INTO prompts (id, name) VALUES (1, 'kept');
    INSERT INTO versions (id, prompt_id, name, text) VALUES (2, 1, 'fixed', 'updated prompt');
    INSERT INTO evaluations (
      id, prompt_id, source, prompt_name_snapshot, version_name_snapshot,
      prompt_template_snapshot, rendered_prompt_snapshot, variables_json,
      temperature, top_p, top_k, max_tokens, enable_thinking,
      model_id_snapshot, model_label_snapshot, upstream_model_snapshot, executed_at
    ) VALUES
      (100, 1, 'ab', 'p', 'v', 'tmpl', 'rendered', '{}', 0.7, 1, 40, 1024, 0, 'm', 'M', 'up', 1),
      (101, 1, 'ab', 'p', 'v', 'tmpl', 'rendered', '{}', 0.7, 1, 40, 1024, 0, 'm', 'M', 'up', 1);
    INSERT INTO issues (
      id, prompt_id, evaluation_id, title, status, note,
      resolution_note, resolved_version_id, created_at, updated_at
    ) VALUES
      (1, 1, 100, 'Closed duplicate', 'closed', 'old closed', NULL, NULL, 10, 300),
      (2, 1, 100, 'Open winner', 'open', 'keep me', NULL, NULL, 20, 100),
      (3, 1, 100, 'Diagnosed duplicate', 'diagnosed', 'newer but lower priority', 'Diagnosis', 2, 30, 400),
      (4, 1, 101, 'Older closed', 'closed', NULL, NULL, NULL, 40, 50),
      (5, 1, 101, 'Newer closed', 'closed', NULL, 'Fixed', 2, 41, 70),
      (6, 1, NULL, 'Manual issue', 'open', 'drop me', NULL, NULL, 50, 500),
      (7, 1, 999, 'Dangling issue', 'open', 'drop me too', NULL, NULL, 60, 600);
  `);

  runMigrations(db);

  const issueColumns = db.all('PRAGMA table_info(issues)') as unknown as Array<{ name: string }>;
  assert.ok(!issueColumns.some(column => column.name === 'id'));
  assert.ok(!issueColumns.some(column => column.name === 'prompt_id'));
  assert.deepEqual(
    db.all('SELECT evaluation_id, title, status, note, resolution_note, resolved_version_id FROM issues ORDER BY evaluation_id'),
    [
      {
        evaluation_id: 100,
        title: 'Open winner',
        status: 'open',
        note: 'keep me',
        resolution_note: null,
        resolved_version_id: null,
      },
      {
        evaluation_id: 101,
        title: 'Newer closed',
        status: 'closed',
        note: null,
        resolution_note: 'Fixed',
        resolved_version_id: 2,
      },
    ]
  );
  assert.deepEqual(
    db.get('SELECT title, note, resolution_note, resolved_version_id FROM issues WHERE evaluation_id = 101'),
    {
      title: 'Newer closed',
      note: null,
      resolution_note: 'Fixed',
      resolved_version_id: 2,
    }
  );
  assert.throws(() => db.run("UPDATE issues SET status = 'invalid' WHERE evaluation_id = 100"));
}));

// Minimal valid evaluation row; callers supply the foreign keys.
function insertEvaluation(
  db: SQLiteDatabase,
  keys: { batch_id: number | null; test_case_id: number | null; prompt_id: number | null; version_id: number | null }
): number {
  return Number(db.run(
    `INSERT INTO evaluations (
       batch_id, test_case_id, prompt_id, version_id, source,
       prompt_name_snapshot, version_name_snapshot, prompt_template_snapshot,
       rendered_prompt_snapshot, variables_json, temperature, top_p, top_k,
       max_tokens, enable_thinking, model_id_snapshot, model_label_snapshot,
       upstream_model_snapshot, executed_at
     ) VALUES (?, ?, ?, ?, 'ab', 'p', 'v', 'tmpl', 'rendered', '{}',
               0.7, 1, 40, 1024, 0, 'm', 'M', 'up', 1)`,
    [keys.batch_id, keys.test_case_id, keys.prompt_id, keys.version_id]
  ).lastInsertRowid);
}

test('deleting a prompt cascades to its batches, evaluations, and issues', () => withDatabase(db => {
  runMigrations(db);
  const promptId = Number(db.run("INSERT INTO prompts (name) VALUES ('p')").lastInsertRowid);
  const versionId = Number(db.run(
    "INSERT INTO versions (prompt_id, name, text) VALUES (?, 'v1', 't')", [promptId]
  ).lastInsertRowid);
  const testCaseId = Number(db.run(
    "INSERT INTO test_cases (prompt_id, name) VALUES (?, 'tc')", [promptId]
  ).lastInsertRowid);
  const batchId = Number(db.run(
    "INSERT INTO evaluation_batches (prompt_id, kind) VALUES (?, 'comparison')", [promptId]
  ).lastInsertRowid);

  // A batched evaluation and a standalone (sandbox-style) one with no batch.
  const batchedEval = insertEvaluation(db, { batch_id: batchId, test_case_id: testCaseId, prompt_id: promptId, version_id: versionId });
  insertEvaluation(db, { batch_id: null, test_case_id: testCaseId, prompt_id: promptId, version_id: versionId });
  db.run("INSERT INTO issues (evaluation_id, title) VALUES (?, 'flagged')", [batchedEval]);

  db.run('DELETE FROM prompts WHERE id = ?', [promptId]);

  assert.equal((db.get('SELECT COUNT(*) AS count FROM evaluation_batches') as { count: number }).count, 0);
  assert.equal((db.get('SELECT COUNT(*) AS count FROM evaluations') as { count: number }).count, 0);
  assert.equal((db.get('SELECT COUNT(*) AS count FROM issues') as { count: number }).count, 0);
}));

test('deleting a version or test case preserves the evaluation, nulling the reference', () => withDatabase(db => {
  runMigrations(db);
  const promptId = Number(db.run("INSERT INTO prompts (name) VALUES ('p')").lastInsertRowid);
  const versionId = Number(db.run(
    "INSERT INTO versions (prompt_id, name, text) VALUES (?, 'v1', 't')", [promptId]
  ).lastInsertRowid);
  const testCaseId = Number(db.run(
    "INSERT INTO test_cases (prompt_id, name) VALUES (?, 'tc')", [promptId]
  ).lastInsertRowid);
  const evalId = insertEvaluation(db, { batch_id: null, test_case_id: testCaseId, prompt_id: promptId, version_id: versionId });

  db.run('DELETE FROM versions WHERE id = ?', [versionId]);
  db.run('DELETE FROM test_cases WHERE id = ?', [testCaseId]);

  // The evaluation survives with its prompt link intact; the deleted references null out.
  assert.deepEqual(
    db.get('SELECT prompt_id, version_id, test_case_id FROM evaluations WHERE id = ?', [evalId]),
    { prompt_id: promptId, version_id: null, test_case_id: null }
  );
}));

test('v11 rebuilds SET NULL evaluation FKs into CASCADE, preserving issues', () => withDatabase(db => {
  // Seed a pre-v11 database (migrations 1–10 applied) with the OLD SET NULL FKs
  // on evaluation_batches.prompt_id and evaluations.prompt_id, plus a flagged
  // issue whose row must survive the table rebuild.
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT INTO schema_migrations (version, name) VALUES
      (1, 'baseline_prompt_schema'), (2, 'add_test_cases'),
      (3, 'add_results_and_issues'), (4, 'add_issue_resolutions'),
      (5, 'add_diagnosed_issue_status'), (6, 'add_evaluation_note'),
      (7, 'drop_prompt_description'), (8, 'decompose_test_config'),
      (9, 'add_comparison_note'), (10, 'make_issues_flagged_results');
    CREATE TABLE prompts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      name TEXT NOT NULL, text TEXT NOT NULL, note TEXT,
      is_current INTEGER NOT NULL DEFAULT 0,
      system_prompt TEXT NOT NULL DEFAULT '', default_config_id INTEGER
    );
    CREATE TABLE test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      name TEXT NOT NULL, description TEXT, variables_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE evaluation_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (kind IN ('comparison')),
      note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER REFERENCES evaluation_batches(id) ON DELETE CASCADE,
      test_case_id INTEGER REFERENCES test_cases(id) ON DELETE SET NULL,
      prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
      version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
      source TEXT NOT NULL CHECK (source IN ('sandbox', 'ab', 'manual')),
      prompt_name_snapshot TEXT NOT NULL, test_name_snapshot TEXT,
      version_name_snapshot TEXT NOT NULL, prompt_template_snapshot TEXT NOT NULL,
      rendered_prompt_snapshot TEXT NOT NULL,
      variables_json TEXT NOT NULL CHECK (json_valid(variables_json) AND json_type(variables_json) = 'object'),
      system_prompt TEXT NOT NULL DEFAULT '',
      temperature REAL NOT NULL, top_p REAL NOT NULL, top_k INTEGER NOT NULL,
      max_tokens INTEGER NOT NULL, enable_thinking INTEGER NOT NULL,
      model_id_snapshot TEXT NOT NULL, model_label_snapshot TEXT NOT NULL,
      upstream_model_snapshot TEXT NOT NULL,
      response_text TEXT, error_text TEXT, note TEXT,
      tokens_used INTEGER, latency_ms INTEGER,
      executed_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE issues (
      evaluation_id INTEGER PRIMARY KEY REFERENCES evaluations(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'diagnosed', 'closed')),
      note TEXT, resolution_note TEXT,
      resolved_version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT INTO prompts (id, name) VALUES (1, 'kept');
    INSERT INTO versions (id, prompt_id, name, text) VALUES (5, 1, 'v1', 't');
    INSERT INTO evaluation_batches (id, prompt_id, kind) VALUES (9, 1, 'comparison');
    INSERT INTO evaluations (
      id, batch_id, prompt_id, version_id, source, prompt_name_snapshot,
      version_name_snapshot, prompt_template_snapshot, rendered_prompt_snapshot,
      variables_json, temperature, top_p, top_k, max_tokens, enable_thinking,
      model_id_snapshot, model_label_snapshot, upstream_model_snapshot, executed_at
    ) VALUES
      (100, 9, 1, 5, 'ab', 'p', 'v', 'tmpl', 'rendered', '{}', 0.7, 1, 40, 1024, 0, 'm', 'M', 'up', 1),
      (101, NULL, 1, 5, 'sandbox', 'p', 'v', 'tmpl', 'rendered', '{}', 0.7, 1, 40, 1024, 0, 'm', 'M', 'up', 1);
    INSERT INTO issues (evaluation_id, title, note) VALUES (100, 'flagged', 'keep me');
  `);

  runMigrations(db);

  // Data survives the rebuild — including the issue, which a naive rebuild would
  // have cascade-deleted when the old evaluations table was dropped.
  assert.equal((db.get('SELECT COUNT(*) AS count FROM evaluation_batches') as { count: number }).count, 1);
  assert.equal((db.get('SELECT COUNT(*) AS count FROM evaluations') as { count: number }).count, 2);
  assert.deepEqual(
    db.get('SELECT evaluation_id, title, note FROM issues'),
    { evaluation_id: 100, title: 'flagged', note: 'keep me' }
  );

  // The FK is now CASCADE: deleting the prompt clears all of its history.
  db.run('DELETE FROM prompts WHERE id = 1');
  assert.equal((db.get('SELECT COUNT(*) AS count FROM evaluation_batches') as { count: number }).count, 0);
  assert.equal((db.get('SELECT COUNT(*) AS count FROM evaluations') as { count: number }).count, 0);
  assert.equal((db.get('SELECT COUNT(*) AS count FROM issues') as { count: number }).count, 0);
}));

test('v12 repairs an issues table left referencing the dropped evaluations_old', () => withDatabase(db => {
  // Seed a database damaged by the early migration 11: migrations 1–11 recorded,
  // healthy evaluations, but issues.evaluation_id points at the long-gone
  // "evaluations_old" so inserts fail. Foreign keys are off so the dangling
  // reference can be created.
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT INTO schema_migrations (version, name) VALUES
      (1, 'baseline_prompt_schema'), (2, 'add_test_cases'),
      (3, 'add_results_and_issues'), (4, 'add_issue_resolutions'),
      (5, 'add_diagnosed_issue_status'), (6, 'add_evaluation_note'),
      (7, 'drop_prompt_description'), (8, 'decompose_test_config'),
      (9, 'add_comparison_note'), (10, 'make_issues_flagged_results'),
      (11, 'cascade_prompt_evaluations');
    CREATE TABLE prompts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      name TEXT NOT NULL, text TEXT NOT NULL, note TEXT,
      is_current INTEGER NOT NULL DEFAULT 0,
      system_prompt TEXT NOT NULL DEFAULT '', default_config_id INTEGER
    );
    CREATE TABLE evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER REFERENCES prompts(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('sandbox', 'ab', 'manual')),
      prompt_name_snapshot TEXT NOT NULL, test_name_snapshot TEXT,
      version_name_snapshot TEXT NOT NULL, prompt_template_snapshot TEXT NOT NULL,
      rendered_prompt_snapshot TEXT NOT NULL,
      variables_json TEXT NOT NULL CHECK (json_valid(variables_json) AND json_type(variables_json) = 'object'),
      system_prompt TEXT NOT NULL DEFAULT '',
      temperature REAL NOT NULL, top_p REAL NOT NULL, top_k INTEGER NOT NULL,
      max_tokens INTEGER NOT NULL, enable_thinking INTEGER NOT NULL,
      model_id_snapshot TEXT NOT NULL, model_label_snapshot TEXT NOT NULL,
      upstream_model_snapshot TEXT NOT NULL,
      response_text TEXT, error_text TEXT, note TEXT,
      tokens_used INTEGER, latency_ms INTEGER,
      executed_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE issues (
      evaluation_id INTEGER PRIMARY KEY REFERENCES evaluations_old(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'diagnosed', 'closed')),
      note TEXT, resolution_note TEXT,
      resolved_version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT INTO prompts (id, name) VALUES (1, 'p');
    INSERT INTO evaluations (
      id, prompt_id, source, prompt_name_snapshot, version_name_snapshot,
      prompt_template_snapshot, rendered_prompt_snapshot, variables_json,
      temperature, top_p, top_k, max_tokens, enable_thinking,
      model_id_snapshot, model_label_snapshot, upstream_model_snapshot, executed_at
    ) VALUES (50, 1, 'sandbox', 'p', 'v', 'tmpl', 'rendered', '{}', 0.7, 1, 40, 1024, 0, 'm', 'M', 'up', 1);
  `);

  runMigrations(db);

  // The foreign key now points back at evaluations, so issues can be created.
  const fkList = db.all('PRAGMA foreign_key_list(issues)') as unknown as Array<{ from: string; table: string }>;
  assert.equal(fkList.find(fk => fk.from === 'evaluation_id')?.table, 'evaluations');
  db.run("INSERT INTO issues (evaluation_id, title) VALUES (50, 'flagged')");
  assert.equal((db.get('SELECT COUNT(*) AS count FROM issues') as { count: number }).count, 1);

  // And the reinstated cascade works: deleting the evaluation clears its issue.
  db.run('DELETE FROM evaluations WHERE id = 50');
  assert.equal((db.get('SELECT COUNT(*) AS count FROM issues') as { count: number }).count, 0);
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
