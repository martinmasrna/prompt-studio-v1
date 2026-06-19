import { Database as SQLiteDatabase } from 'node-sqlite3-wasm';
import { BASE_SCHEMA_SQL, RESULTS_SCHEMA_SQL, TEST_CASES_SCHEMA_SQL } from './schema';

export interface Migration {
  version: number;
  name: string;
  up: (db: SQLiteDatabase) => void;
}

function tableNames(db: SQLiteDatabase): string[] {
  return (db.all("SELECT name FROM sqlite_master WHERE type = 'table'") as { name: string }[])
    .map(row => row.name);
}

function columnNames(db: SQLiteDatabase, table: string): string[] {
  return (db.all(`PRAGMA table_info(${table})`) as unknown as { name: string }[])
    .map(row => row.name);
}

function migrateLegacyBranches(db: SQLiteDatabase): void {
  const tables = tableNames(db);
  if (!tables.includes('branches') || !tables.includes('versions')) return;
  if (columnNames(db, 'versions').includes('prompt_id')) return;

  db.exec(`
    ALTER TABLE versions RENAME TO versions_legacy;

    CREATE TABLE versions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id  INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      text       TEXT NOT NULL,
      note       TEXT,
      is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1))
    );

    INSERT INTO versions (id, prompt_id, name, text, note, is_current)
    SELECT v.id,
           b.prompt_id,
           b.name || ' ' || v.major || '.' || v.minor,
           v.text,
           v.note,
           0
    FROM versions_legacy v
    JOIN branches b ON b.id = v.branch_id;

    UPDATE versions
    SET is_current = 1
    WHERE id = (
      SELECT candidate.id
      FROM versions candidate
      WHERE candidate.prompt_id = versions.prompt_id
      ORDER BY candidate.id DESC
      LIMIT 1
    );

    DROP TABLE versions_legacy;
    DROP TABLE branches;
    DROP TABLE IF EXISTS prompt_tags;
    DROP TABLE IF EXISTS tags;
  `);
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'baseline_prompt_schema',
    up(db) {
      const tables = tableNames(db);

      if (tables.includes('prompts') && !columnNames(db, 'prompts').includes('description')) {
        db.exec('ALTER TABLE prompts ADD COLUMN description TEXT');
        const cols = columnNames(db, 'prompts');
        if (cols.includes('use_case') && cols.includes('goal')) {
          db.exec(`
            UPDATE prompts
            SET description = TRIM(
              COALESCE(use_case, '') ||
              CASE WHEN use_case IS NOT NULL AND goal IS NOT NULL THEN ' — ' ELSE '' END ||
              COALESCE(goal, '')
            )
            WHERE description IS NULL
          `);
        } else if (cols.includes('use_case')) {
          db.exec("UPDATE prompts SET description = TRIM(COALESCE(use_case, '')) WHERE description IS NULL");
        } else if (cols.includes('goal')) {
          db.exec("UPDATE prompts SET description = TRIM(COALESCE(goal, '')) WHERE description IS NULL");
        }
      }

      migrateLegacyBranches(db);
      db.exec(BASE_SCHEMA_SQL);

      // Repair any legacy duplicate-current rows before enforcing the invariant.
      db.exec(`
        UPDATE versions
        SET is_current = 0
        WHERE is_current = 1
          AND id NOT IN (
            SELECT MAX(id) FROM versions WHERE is_current = 1 GROUP BY prompt_id
          );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_one_current
        ON versions(prompt_id)
        WHERE is_current = 1;
      `);
    },
  },
  {
    version: 2,
    name: 'add_test_cases',
    up(db) {
      if (!tableNames(db).includes('test_cases')) db.exec(TEST_CASES_SCHEMA_SQL);
    },
  },
  {
    version: 3,
    name: 'add_results_and_issues',
    up(db) {
      if (!tableNames(db).includes('evaluations')) db.exec(RESULTS_SCHEMA_SQL);
    },
  },
  {
    version: 4,
    name: 'add_issue_resolutions',
    up(db) {
      const columns = columnNames(db, 'issues');
      if (!columns.includes('resolution_note')) {
        db.exec('ALTER TABLE issues ADD COLUMN resolution_note TEXT');
      }
      if (!columns.includes('resolved_version_id')) {
        db.exec('ALTER TABLE issues ADD COLUMN resolved_version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_issues_resolved_version ON issues(resolved_version_id)');
    },
  },
  {
    version: 5,
    name: 'add_diagnosed_issue_status',
    up(db) {
      db.exec(`
        ALTER TABLE issues RENAME TO issues_before_diagnosed_status;

        CREATE TABLE issues (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          prompt_id           INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
          evaluation_id       INTEGER REFERENCES evaluations(id) ON DELETE SET NULL,
          title               TEXT NOT NULL,
          status              TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'diagnosed', 'closed')),
          note                TEXT,
          resolution_note     TEXT,
          resolved_version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
          created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
        );

        INSERT INTO issues (
          id, prompt_id, evaluation_id, title, status, note,
          resolution_note, resolved_version_id, created_at, updated_at
        )
        SELECT
          id, prompt_id, evaluation_id, title, status, note,
          resolution_note, resolved_version_id, created_at, updated_at
        FROM issues_before_diagnosed_status;

        DROP TABLE issues_before_diagnosed_status;

        CREATE INDEX idx_issues_prompt ON issues(prompt_id, status, created_at DESC);
        CREATE INDEX idx_issues_evaluation ON issues(evaluation_id);
        CREATE INDEX idx_issues_resolved_version ON issues(resolved_version_id);
      `);
    },
  },
];

export function runMigrations(db: SQLiteDatabase, migrationList: Migration[] = migrations): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const applied = new Set(
    (db.all('SELECT version FROM schema_migrations') as unknown as { version: number }[])
      .map(row => row.version)
  );

  for (const migration of migrationList) {
    if (applied.has(migration.version)) continue;

    db.run('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.run(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [migration.version, migration.name]
      );
      db.run('COMMIT');
    } catch (error) {
      db.run('ROLLBACK');
      throw new Error(`Migration ${migration.version} (${migration.name}) failed`, { cause: error });
    }
  }
}
