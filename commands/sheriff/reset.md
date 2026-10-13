---
name: sheriff:reset
description: Reset Sheriff state. Clears generated files so the next /sheriff:run starts fresh. Use --discovery-only to only regenerate TEST_MAP.md and PHASES.md without touching written tests.
argument-hint: "[--discovery-only] [--full]"
allowed-tools:
  - Bash
  - Read
---

<execution_context>
Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.
</execution_context>

<process>
Determine flags:
- --discovery-only: delete only TEST_MAP.md and PHASES.md (keeps written tests and summaries)
- --full (default): delete entire .sheriff/ directory

Warn the user what will be deleted and ask for confirmation before proceeding.

If --discovery-only:
```bash
rm .sheriff/TEST_MAP.md
rm .sheriff/PHASES.md
rm -rf .sheriff/results/
rm .sheriff/results-assembled.md
```
Print: "Discovery state cleared. Run /sheriff:run to re-scan and re-plan."

If --full:
```bash
rm -rf .sheriff/
```
Print: "Sheriff state fully reset. Run /sheriff:run to start from scratch."

Note: written test files are never deleted by sheriff:reset — they live in your tests/ directory.
</process>
