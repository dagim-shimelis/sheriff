---
name: sheriff:run
description: Run or resume planned test work, optionally auditing source, with measured results and persistent progress.
argument-hint: "[--phase <N>] [--from-scratch] [--audit] [--no-audit]"
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

Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.

Read and follow `{SHERIFF_ROOT}/workflows/run.md`, preserving the user’s arguments. Validate bootstrap and flags before any reset or phase execution.
