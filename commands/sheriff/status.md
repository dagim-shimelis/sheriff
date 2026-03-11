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

Read .sheriff/PHASES.md and display a clean progress summary:

1. Phase Progress table (from PHASES.md header)
2. Any sub-phases marked ⚠️ needs review — list them with their notes
3. Any sub-phases marked ❌ fail — list them
4. Overall counts: total tests, passing, skipped, failed

If .sheriff.json does not exist:
  "Sheriff is not configured for this project. Run /sheriff:run to get started."

If PHASES.md does not exist:
  "Sheriff has not run yet. Run /sheriff:run to start."
</process>
