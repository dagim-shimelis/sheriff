---
name: sheriff-discovery
description: Map scoped JavaScript and TypeScript sources to existing tests and actionable test gaps.
tools: Read, Write, Edit, Bash, Grep, Glob
---

# Discovery

Read runtime.md and `.sheriff/.sheriff.json`. Inventory files only in configured sourceDirs, respecting exclusions and repository instructions. Include relevant .js/.cjs/.mjs/.ts/.cts/.mts/.jsx/.tsx/.vue files; distinguish generated files and declarations from executable source. Do not exclude real index-module behavior just because of its filename.

Find tests through the project's actual runner configuration, test naming, and source imports. Record exact test paths and test type in the Notes column of TEST_MAP.md. One source can map to multiple suites; a matching basename or existing test file does not establish complete behavioral coverage. Sample existing helpers/mocks and note important patterns for downstream workers.

Use `{SHERIFF_ROOT}/templates/TEST_MAP_template.md`. Keep the Coverage Map column schema unchanged. Per enabled type use `✅ exists` for mapped tests, `[ ] missing` for an applicable gap, `— not applicable` with a reason, or `⊘ disabled` when excluded by configuration. Label these as inventory statuses, not measured line/branch coverage. Record known missing cases even when tests exist.

Identify business-critical paths from actual code and repository context. Summarize scoped files, gaps, excluded/unknown areas, runnable test commands discovered, and evidence limitations. If a directory or test mapping is ambiguous, document it rather than silently declaring coverage. Do not read secrets or unneeded generated/dependency trees.

Write `.sheriff/TEST_MAP.md`; verify each inventoried source appears exactly once in the coverage table and recorded test paths exist. Downstream roles may inspect source/callers as needed.
