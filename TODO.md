# Prompt Studio roadmap

This file is the durable implementation record for Prompt Studio. Completed
items are checked off, not removed, so architectural decisions and their history
remain visible.

## Saved test cases

- [x] Add ordered, transactional SQLite migrations tracked by `schema_migrations`.
- [x] Preserve existing v1 prompts and versions when establishing the migration baseline.
- [x] Enforce at most one current version per prompt with a partial unique index.
- [x] Add prompt-owned `test_cases` with case-insensitive names unique per prompt.
- [x] Store arbitrary variable values as a validated JSON object and known run settings as typed columns.
- [x] Add test-case repository, validation, and CRUD API.
- [x] Use one shared test draft in Sandbox and A/B Tester.
- [x] Require explicit Save/Save as new; never autosave reusable tests.
- [x] Preserve variables unused by the selected version and block runs with missing values.
- [ ] Add optional test descriptions and renaming to the frontend controls (the API already supports both).
- [ ] Replace the temporary browser `prompt()` used by “Save as new” with an application modal.
- [x] Add isolated API regression tests and frontend utility/store tests.
- [ ] Add the unified test suite to hosted CI.
- [ ] Revisit browser E2E tests when the execution environment can support them reliably.

### Implemented tables

```sql
schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
)

test_cases (
  id INTEGER PRIMARY KEY,
  prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  description TEXT,
  variables_json TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  temperature REAL NOT NULL,
  top_p REAL NOT NULL,
  top_k INTEGER NOT NULL,
  max_tokens INTEGER NOT NULL,
  enable_thinking INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (prompt_id, name)
)
```

## Evaluation architecture

Committed decisions:

- A **test case** belongs to one prompt and defines reusable inputs plus default run settings.
- A test case does not bind a prompt version or model.
- An **evaluation** is one immutable execution of a test against an explicit version and model.
- An **issue** is a minimal open/closed work item with a title, note, and optional linked evaluation.
- An **evaluation batch** groups the two sides of a saved A/B comparison.
- Evaluations retain full execution snapshots. Source IDs provide lineage, not historical truth.
- Deleting source prompts/tests preserves evaluation history by default. A separate explicit destructive action may remove both.

Implemented structures:

```sql
evaluation_batches (
  id INTEGER PRIMARY KEY,
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,              -- comparison
  created_at INTEGER NOT NULL
)

evaluations (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER REFERENCES evaluation_batches(id) ON DELETE CASCADE,
  test_case_id INTEGER REFERENCES test_cases(id) ON DELETE SET NULL,
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
  version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
  source TEXT NOT NULL,            -- sandbox | ab | manual
  prompt_name_snapshot TEXT NOT NULL,
  test_name_snapshot TEXT,
  version_name_snapshot TEXT NOT NULL,
  prompt_template_snapshot TEXT NOT NULL,
  rendered_prompt_snapshot TEXT NOT NULL,
  variables_json TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  temperature REAL NOT NULL,
  top_p REAL NOT NULL,
  top_k INTEGER NOT NULL,
  max_tokens INTEGER NOT NULL,
  enable_thinking INTEGER NOT NULL,
  model_id_snapshot TEXT NOT NULL,
  model_label_snapshot TEXT NOT NULL,
  upstream_model_snapshot TEXT NOT NULL,
  response_text TEXT,
  error_text TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  executed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)

issues (
  id INTEGER PRIMARY KEY,
  prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
  evaluation_id INTEGER REFERENCES evaluations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,            -- open | closed
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

### Evaluation features

- [ ] Give configured models explicit stable IDs; retain label fallback during config migration.
- [x] Persist selected Sandbox and A/B-side results as immutable evaluations.
- [x] Capture execution context when the run starts, before settings can change.
- [x] Persist A/B runs as two evaluations in one comparison batch without duplicating saved sides.
- [x] Add prompt-level Results and Issues tabs.
- [x] Add one-click “Flag as issue,” manual issues, and open/closed lifecycle.
- [x] Protect evaluation evidence from deletion while linked to an issue.
- [ ] Run selected test cases as a batch against one or more version/model targets.
- [ ] Add deterministic assertions and automatic checks.
- [ ] Add configurable LLM-as-judge assessments.
- [ ] Add score aggregation and version/model comparisons.
- [ ] Add default history-preserving deletion plus an explicit cascade-history deletion flow.

## Open questions

- Should issues eventually support multiple linked evaluations as accumulated evidence?
- How should automated evaluation criteria and assessments be structured?
- Should test cases later be groupable into reusable named suites, or are batches selected ad hoc?
- Which score scales and aggregation rules should be first-class?
- What retention/export policy should apply to potentially sensitive prompts and responses?
