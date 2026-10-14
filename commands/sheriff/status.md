---
name: sheriff:status
description: Show current Sheriff progress — phases complete, tests passing, items needing review.
allowed-tools:
  - Read
  - Bash
---

Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.

If `.sheriff/` or configuration is missing, report not configured. If PHASES.md is missing, report no plan. Otherwise run `get-status --raw` and read the current phase metadata/results/summaries.

Show phase/sub-phase pass, review, fail, in-progress, pending counts and dependency blockers. Surface pending handoffs. Use actual result evidence for test passing/skipped/failed counts; do not confuse completed sub-phases with passing tests. Summaries may be stale after a retry: prefer current state and disclose missing evidence. Do not sum overlapping suite runs as distinct tests, infer coverage percentages, or mutate state while showing status.
