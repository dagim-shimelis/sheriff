---
name: sheriff:audit
description: Review source for concrete defects and synchronize tests for authorized fixes.
argument-hint: "[--files <path1,path2>] [--phase <N>]"
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

Read and follow `{SHERIFF_ROOT}/workflows/audit.md`, preserving the user’s arguments. Report findings and apply only fixes within the user’s scope and configured source-change policy.
