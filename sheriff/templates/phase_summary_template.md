---
phase: {{PHASE_NUM}}
title: {{PHASE_TITLE}}
status: {{STATUS}}
completed_at: {{TIMESTAMP}}
subphases_total: {{TOTAL}}
subphases_passed: {{PASSED}}
subphases_review: {{REVIEW}}
subphases_failed: {{FAILED}}
tests_passing: {{TESTS_PASSING}}
tests_skipped: {{TESTS_SKIPPED}}
tests_failed: {{TESTS_FAILED}}
---

# Phase {{PHASE_NUM}} Summary — {{PHASE_TITLE}}

## Result: {{RESULT_ICON}} {{RESULT_TEXT}}

## What was done
{{DESCRIPTION}}

## Coverage added

| Sub-phase | File | Tests | Status |
|-----------|------|-------|--------|
{{COVERAGE_TABLE}}

## Bugs found
{{BUGS}}

## Needs review
{{REVIEW_ITEMS}}

## Next phase
{{NEXT_PHASE_INFO}}
