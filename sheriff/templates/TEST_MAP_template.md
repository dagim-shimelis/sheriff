# Sheriff TEST_MAP
Generated: {{TIMESTAMP}}
Project: {{FRAMEWORK}} / {{TEST_RUNNER}} / {{LANGUAGE}}

## Mock Patterns Detected

{{MOCK_PATTERNS}}

This is a source/test inventory, not measured line or branch coverage. Notes record exact test paths, types, and known missing behaviors.

## Coverage Map

| Area | File | Unit | E2E | Complexity | Notes |
|------|------|------|-----|------------|-------|
| {{AREA}} | {{FILE}} | {{UNIT_STATUS}} | {{E2E_STATUS}} | {{COMPLEXITY}} | {{NOTES}} |

## Summary

- Total source files: {{TOTAL}}
- Already tested (unit): {{UNIT_DONE}}
- Already tested (E2E): {{E2E_DONE}}
- Needs unit tests: {{UNIT_NEEDED}}
- Needs E2E tests: {{E2E_NEEDED}}
- Not applicable: {{NA}}

## Risk Assessment

### Critical (test first)
{{CRITICAL_FILES}}

### High
{{HIGH_FILES}}

### Medium
{{MEDIUM_FILES}}

### Low
{{LOW_FILES}}
