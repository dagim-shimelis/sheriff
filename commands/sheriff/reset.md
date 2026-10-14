---
name: sheriff:reset
description: Reset Sheriff project state; discovery-only archives the old plan and evidence while preserving configuration and tests.
argument-hint: "[--discovery-only] [--full]"
allowed-tools:
  - Bash
  - Read
---

Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.

Validate `--discovery-only` or `--full` (default); reject conflicts/unknown flags. First verify the current project root and that `.sheriff` is a real directory inside it, not a symlink. Confirm no Sheriff workers are active. Explain the exact paths affected and honor authorization already provided; ask only if the requested deletion scope remains ambiguous.

For `--discovery-only`, preserve config and archive the current TEST_MAP.md, PHASES.md, results/, handoffs/, audits/, sync/, summaries/, and results-assembled.md together under a unique `.sheriff/archive/<timestamp>/` directory. Move only existing entries, never overwrite an archive. These artifacts belong to one plan; retaining old result IDs in active directories would contaminate the new plan. The next run rebuilds discovery and planning. Existing source and test files remain in place.

For a full reset, remove only the verified `.sheriff/` directory, including configuration, reports, handoffs, and archives. Never follow symlinks or remove test/source directories. Report what was removed. Test files outside `.sheriff/` are preserved; custom files stored inside it are part of the requested deletion.
