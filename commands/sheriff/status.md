---
name: sheriff:status
description: Show current Sheriff progress — phases complete, tests passing, items needing review.
allowed-tools:
  - Read
  - Bash
---

<process>
Determine the Sheriff tools path (global or local).

Run:
```bash
node {SHERIFF_TOOLS} get-status --raw
```

Read .sheriff/PHASES.md and all files in .sheriff/summaries/ (phase-*.md).

Display a clean progress summary:

1. **Phase Progress table** — render a table with these columns:

   | Phase | Title | Status | Sub-phases | Tests |
   |-------|-------|--------|-----------|-------|

   - Phase, Title, Status, Sub-phases: taken from the PHASES.md Phase Progress table
   - **Tests**: for each phase, read its summary file (.sheriff/summaries/phase-{N}.md) and extract `tests_passing`, `tests_skipped`, and `tests_failed` from the frontmatter. Display as: `{written}✍ {passing}✅ {failed}❌` where written = passing + skipped + failed. Omit the failed part if 0. If no summary exists for a phase, show `—`.

2. Any sub-phases marked ⚠️ needs review — list them with their notes
3. Any sub-phases marked ❌ fail — list them
4. **Overall test totals** from the get-status output: tests written, tests passing, tests failed

If .sheriff.json does not exist:
  "Sheriff is not configured for this project. Run /sheriff:run to get started."

If PHASES.md does not exist:
  "Sheriff has not run yet. Run /sheriff:run to start."
</process>
