// Defines and applies the full SQLite schema on first run (or no-op if already applied).
// Using INTEGER PRIMARY KEY gives SQLite's implicit rowid alias — faster than named id columns.
// All timestamps are Unix epoch integers (seconds) — avoids timezone ambiguity vs TEXT dates.

export const SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS folders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    parent_id  INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT,
    folder_id   INTEGER REFERENCES folders(id) ON DELETE SET NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  -- Junction table: many prompts <-> many tags
  CREATE TABLE IF NOT EXISTS prompt_tags (
    prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
    PRIMARY KEY (prompt_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS branches (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    name      TEXT    NOT NULL,
    UNIQUE (prompt_id, name)
  );

  -- major.minor semantic versioning stored as two integers to allow correct numeric ordering.
  -- is_current is a boolean flag (0/1); only one version per branch should be 1 at a time.
  -- Enforcing the single-current constraint is done at the application layer, not via DB trigger,
  -- to keep the schema simple and avoid SQLite trigger edge cases.
  CREATE TABLE IF NOT EXISTS versions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id  INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    major      INTEGER NOT NULL DEFAULT 1,
    minor      INTEGER NOT NULL DEFAULT 0,
    text       TEXT    NOT NULL,
    note       TEXT,
    is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`;
