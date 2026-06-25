import { Database as SQLiteDatabase } from 'node-sqlite3-wasm';
import { BASE_SCHEMA_SQL, CONFIGS_SCHEMA_SQL, RESULTS_SCHEMA_SQL, TEST_CASES_SCHEMA_SQL } from './schema';

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

// The sampling parameters that, prior to v8, lived on every test case. These
// defaults match the old test_cases column defaults; a test case carrying
// exactly these is mapped to the "Default" config.
interface BundledConfig {
  temperature: number;
  top_p: number;
  top_k: number;
  max_tokens: number;
  enable_thinking: number;
}

const DEFAULT_CONFIG: BundledConfig = {
  temperature: 0.7, top_p: 1.0, top_k: 40, max_tokens: 1024, enable_thinking: 0,
};

function configSignature(c: BundledConfig): string {
  return `${c.temperature}|${c.top_p}|${c.top_k}|${c.max_tokens}|${c.enable_thinking}`;
}

function isDefaultConfig(c: BundledConfig): boolean {
  return configSignature(c) === configSignature(DEFAULT_CONFIG);
}

// A readable, deterministic name for a non-default config — only the fields
// that differ from the defaults are spelled out, so two distinct parameter
// tuples never collapse to the same name.
function deriveConfigName(c: BundledConfig): string {
  if (isDefaultConfig(c)) return 'Default';
  const parts = [`temp ${c.temperature}`, `${c.max_tokens} tok`];
  if (c.top_p !== DEFAULT_CONFIG.top_p) parts.push(`top-p ${c.top_p}`);
  if (c.top_k !== DEFAULT_CONFIG.top_k) parts.push(`top-k ${c.top_k}`);
  if (c.enable_thinking) parts.push('thinking');
  return parts.join(', ');
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
  {
    version: 6,
    name: 'add_evaluation_note',
    up(db) {
      if (!columnNames(db, 'evaluations').includes('note')) {
        db.exec('ALTER TABLE evaluations ADD COLUMN note TEXT');
      }
    },
  },
  {
    version: 7,
    name: 'drop_prompt_description',
    up(db) {
      // The prompt name plus the prompt text convey everything the description
      // used to; it was never surfaced anywhere else, so it's removed.
      if (columnNames(db, 'prompts').includes('description')) {
        db.exec('ALTER TABLE prompts DROP COLUMN description');
      }
    },
  },
  {
    version: 8,
    name: 'decompose_test_config',
    // Splits the bundled (variables + system_prompt + sampling params) test case
    // into three independent axes: the scenario stays in test_cases (variables
    // only), the sampling params move into a new prompt-scoped `configs` table
    // (distinct tuples deduplicated), and the system prompt moves onto the
    // prompt's current version. evaluations keep their own snapshot columns and
    // are untouched.
    up(db) {
      if (!tableNames(db).includes('configs')) db.exec(CONFIGS_SCHEMA_SQL);

      const versionColumns = columnNames(db, 'versions');
      if (!versionColumns.includes('system_prompt')) {
        db.exec("ALTER TABLE versions ADD COLUMN system_prompt TEXT NOT NULL DEFAULT ''");
      }
      if (!versionColumns.includes('default_config_id')) {
        db.exec('ALTER TABLE versions ADD COLUMN default_config_id INTEGER REFERENCES configs(id) ON DELETE SET NULL');
      }

      // Nothing to decompose unless test_cases still carries the bundled columns.
      if (!tableNames(db).includes('test_cases')) return;
      if (!columnNames(db, 'test_cases').includes('temperature')) return;

      interface TestCaseRow extends BundledConfig {
        id: number;
        prompt_id: number;
        system_prompt: string;
      }
      const rows = db.all(
        `SELECT id, prompt_id, system_prompt,
                temperature, top_p, top_k, max_tokens, enable_thinking
         FROM test_cases ORDER BY prompt_id, id`
      ) as unknown as TestCaseRow[];

      // Group test cases by prompt so configs are deduplicated per prompt.
      const byPrompt = new Map<number, TestCaseRow[]>();
      for (const row of rows) {
        const list = byPrompt.get(row.prompt_id) ?? [];
        list.push(row);
        byPrompt.set(row.prompt_id, list);
      }

      for (const [promptId, testCases] of byPrompt) {
        // 1. Create one config per distinct parameter tuple (first appearance wins).
        const configIdBySignature = new Map<string, number>();
        const usedNames = new Set<string>();
        for (const tc of testCases) {
          const signature = configSignature(tc);
          if (configIdBySignature.has(signature)) continue;

          let name = deriveConfigName(tc);
          for (let suffix = 2; usedNames.has(name.toLowerCase()); suffix++) {
            name = `${deriveConfigName(tc)} (${suffix})`;
          }
          usedNames.add(name.toLowerCase());

          const result = db.run(
            `INSERT INTO configs (prompt_id, name, temperature, top_p, top_k, max_tokens, enable_thinking)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [promptId, name, tc.temperature, tc.top_p, tc.top_k, tc.max_tokens, tc.enable_thinking]
          );
          configIdBySignature.set(signature, Number(result.lastInsertRowid));
        }

        // 2. Point every version of this prompt at the "Default" config (or, if
        //    none of its test cases used the defaults, the first config created).
        const defaultRow = db.get(
          "SELECT id FROM configs WHERE prompt_id = ? ORDER BY (name = 'Default') DESC, id LIMIT 1",
          [promptId]
        ) as { id: number } | null;
        const defaultConfigId = defaultRow?.id ?? null;
        if (defaultConfigId !== null) {
          db.run('UPDATE versions SET default_config_id = ? WHERE prompt_id = ?', [defaultConfigId, promptId]);
        }

        // 3. Relocate a non-empty system prompt onto the current version. A test
        //    case has no link to a version, so the most recent test case that
        //    carried a system prompt is attached to the prompt's current version,
        //    and that version's default config is set to the one the same test
        //    case used — reconstructing the original bundle on the new axes.
        const bearer = testCases
          .filter(tc => (tc.system_prompt ?? '').trim() !== '')
          .sort((a, b) => b.id - a.id)[0];
        if (bearer) {
          const current = db.get(
            'SELECT id FROM versions WHERE prompt_id = ? AND is_current = 1',
            [promptId]
          ) as { id: number } | null;
          if (current) {
            const bearerConfigId = configIdBySignature.get(configSignature(bearer)) ?? defaultConfigId;
            db.run(
              'UPDATE versions SET system_prompt = ?, default_config_id = ? WHERE id = ?',
              [bearer.system_prompt, bearerConfigId, current.id]
            );
          }
        }
      }

      // 4. Drop the now-relocated columns from test_cases, leaving the scenario.
      for (const column of ['system_prompt', 'temperature', 'top_p', 'top_k', 'max_tokens', 'enable_thinking']) {
        db.exec(`ALTER TABLE test_cases DROP COLUMN ${column}`);
      }
    },
  },
  {
    version: 9,
    name: 'add_comparison_note',
    up(db) {
      if (tableNames(db).includes('evaluation_batches') && !columnNames(db, 'evaluation_batches').includes('note')) {
        db.exec('ALTER TABLE evaluation_batches ADD COLUMN note TEXT');
      }
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
