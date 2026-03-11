---
name: sheriff:configure
description: Update Sheriff's project configuration — re-run onboarding to change test runner, phase strategy, parallel agents, or excluded directories.
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
---

<execution_context>
Determine the Sheriff tools path:
- Global install: ~/.claude/sheriff/bin/sheriff-tools.js
- Local install: .claude/sheriff/bin/sheriff-tools.js

Read current config if it exists:
```bash
node {SHERIFF_TOOLS} read-config --raw
```
</execution_context>

<process>
Execute the configure workflow:

@~/.claude/sheriff/workflows/configure.md
</process>
