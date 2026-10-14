---
name: sheriff:configure
description: Update Sheriff's project configuration — re-run onboarding to change test runner, phase strategy, parallel agents, excluded directories, or model assignments.
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
---

Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.

Read and follow `{SHERIFF_ROOT}/workflows/configure.md`. Preserve existing answers and project scope.
