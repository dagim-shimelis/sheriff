---
name: sheriff:configure
description: Update Sheriff's project configuration — re-run onboarding to change test runner, phase strategy, parallel agents, excluded directories, or model assignments.
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
---

<execution_context>
Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.
</execution_context>

<process>
Execute the configure workflow:

Read and follow `{SHERIFF_ROOT}/workflows/configure.md`.
</process>
