export const BASE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS prompts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS versions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_id  INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    text       TEXT NOT NULL,
    note       TEXT,
    is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1))
  );
`;

export const TEST_CASES_SCHEMA_SQL = `
  CREATE TABLE test_cases (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_id       INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    name            TEXT NOT NULL COLLATE NOCASE,
    description     TEXT,
    variables_json  TEXT NOT NULL DEFAULT '{}'
                    CHECK (json_valid(variables_json) AND json_type(variables_json) = 'object'),
    system_prompt   TEXT NOT NULL DEFAULT '',
    temperature     REAL NOT NULL DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
    top_p           REAL NOT NULL DEFAULT 1.0 CHECK (top_p >= 0 AND top_p <= 1),
    top_k           INTEGER NOT NULL DEFAULT 40 CHECK (top_k >= 1 AND top_k <= 200),
    max_tokens      INTEGER NOT NULL DEFAULT 1024 CHECK (max_tokens >= 64 AND max_tokens <= 32768),
    enable_thinking INTEGER NOT NULL DEFAULT 0 CHECK (enable_thinking IN (0, 1)),
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (prompt_id, name)
  );

  CREATE INDEX idx_test_cases_prompt_id ON test_cases(prompt_id);
`;

export const RESULTS_SCHEMA_SQL = `
  CREATE TABLE evaluation_batches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_id  INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('comparison')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE evaluations (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id                 INTEGER REFERENCES evaluation_batches(id) ON DELETE CASCADE,
    test_case_id             INTEGER REFERENCES test_cases(id) ON DELETE SET NULL,
    prompt_id                INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
    version_id               INTEGER REFERENCES versions(id) ON DELETE SET NULL,
    source                   TEXT NOT NULL CHECK (source IN ('sandbox', 'ab', 'manual')),
    prompt_name_snapshot     TEXT NOT NULL,
    test_name_snapshot       TEXT,
    version_name_snapshot    TEXT NOT NULL,
    prompt_template_snapshot TEXT NOT NULL,
    rendered_prompt_snapshot TEXT NOT NULL,
    variables_json           TEXT NOT NULL CHECK (json_valid(variables_json) AND json_type(variables_json) = 'object'),
    system_prompt            TEXT NOT NULL DEFAULT '',
    temperature              REAL NOT NULL CHECK (temperature >= 0 AND temperature <= 2),
    top_p                    REAL NOT NULL CHECK (top_p >= 0 AND top_p <= 1),
    top_k                    INTEGER NOT NULL CHECK (top_k >= 1 AND top_k <= 200),
    max_tokens               INTEGER NOT NULL CHECK (max_tokens >= 64 AND max_tokens <= 32768),
    enable_thinking          INTEGER NOT NULL CHECK (enable_thinking IN (0, 1)),
    model_id_snapshot        TEXT NOT NULL,
    model_label_snapshot     TEXT NOT NULL,
    upstream_model_snapshot  TEXT NOT NULL,
    response_text            TEXT,
    error_text               TEXT,
    tokens_used              INTEGER,
    latency_ms               INTEGER,
    executed_at              INTEGER NOT NULL,
    created_at               INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE issues (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_id     INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
    evaluation_id INTEGER REFERENCES evaluations(id) ON DELETE SET NULL,
    title         TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'diagnosed', 'closed')),
    note          TEXT,
    resolution_note    TEXT,
    resolved_version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX idx_evaluation_batches_prompt ON evaluation_batches(prompt_id, created_at DESC);
  CREATE INDEX idx_evaluations_prompt ON evaluations(prompt_id, executed_at DESC);
  CREATE INDEX idx_evaluations_batch ON evaluations(batch_id);
  CREATE INDEX idx_issues_prompt ON issues(prompt_id, status, created_at DESC);
  CREATE INDEX idx_issues_evaluation ON issues(evaluation_id);
  CREATE INDEX idx_issues_resolved_version ON issues(resolved_version_id);
`;
