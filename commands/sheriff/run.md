---
name: sheriff:run
description: Run or resume the full Sheriff pipeline — discover untested code, plan phases, write tests, fix failures, and report results. Fire and forget.
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

<execution_context>
Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.

If --from-scratch flag is set, delete .sheriff/TEST_MAP.md and .sheriff/PHASES.md before starting.
If --phase N is set, skip to Phase C targeting that specific phase.
If --audit flag is set, enable audit mode (skip the audit prompt, go straight to audit+test).
If --no-audit flag is set, disable audit mode (skip the audit prompt, go straight to test-only).
</execution_context>

<process>
Execute the run workflow end-to-end:

Read and follow `{SHERIFF_ROOT}/workflows/run.md`.
</process>
