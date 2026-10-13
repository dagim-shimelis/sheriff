---
name: sheriff:sync
description: Audit changed source code and sync tests to match. Audits by default — use --no-audit to skip.
argument-hint: "[--no-audit] [--since-commit <sha>] [--since-branch <branch>] [--staged] [--files <path1,path2>]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - TodoWrite
---

<execution_context>
Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.

Flag handling:
- --no-audit: skip the audit step, just sync tests directly (faster)
- --since-commit <sha>: diff against a specific commit
- --since-branch <branch>: diff against a branch (e.g., main)
- --staged: only look at staged changes
- --files <path1,path2,...>: specific files to sync (comma-separated)
- No flag: auto-detect via git diff HEAD~1 (changes in last commit)

Audit mode:
- By default, sync audits changed source files BEFORE syncing tests (audit + sync)
- If --no-audit is passed, set {AUDIT_MODE} to false and skip Phase 3 in the workflow
</execution_context>

<process>
Execute the sync workflow end-to-end:

Read and follow `{SHERIFF_ROOT}/workflows/sync.md`.
</process>
