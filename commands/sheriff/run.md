---
name: sheriff:run
description: Run or resume the full Sheriff pipeline — discover untested code, plan phases, write tests, fix failures, and report results. Fire and forget.
argument-hint: "[--phase <N>] [--from-scratch]"
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
Determine the Sheriff tools path:
- Global install: ~/.claude/sheriff/bin/sheriff-tools.js
- Local install: .claude/sheriff/bin/sheriff-tools.js

Check which exists and use that path as {SHERIFF_TOOLS}.

If --from-scratch flag is set, delete .sheriff/TEST_MAP.md and .sheriff/PHASES.md before starting.
If --phase N is set, skip to Phase C targeting that specific phase.
</execution_context>

<process>
Execute the run workflow end-to-end:

@~/.claude/sheriff/workflows/run.md
</process>
