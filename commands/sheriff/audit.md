---
name: sheriff:audit
description: Audit source code for bugs, security issues, and dead code. Fixes issues found, then updates existing tests to match corrected behavior.
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

<execution_context>
Determine the Sheriff tools path:
- Global install: ~/.claude/sheriff/bin/sheriff-tools.js
- Local install: .claude/sheriff/bin/sheriff-tools.js

Check which exists and use that path as {SHERIFF_TOOLS}.

Flag handling:
- --files <path1,path2,...>: audit specific source files (comma-separated)
- --phase <N>: audit all source files in that phase from PHASES.md
- No flag: audit ALL source files listed in TEST_MAP.md or PHASES.md
</execution_context>

<process>
Execute the audit workflow end-to-end:

@~/.claude/sheriff/workflows/audit.md
</process>
