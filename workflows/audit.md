# Sheriff — Audit Workflow

Standalone source code audit. Reviews code for bugs, security issues, and dead code. Fixes issues found, then updates existing tests to match corrected behavior.

## Variables

Replace at runtime:
- `{SHERIFF_TOOLS}` = `~/.claude/sheriff/bin/sheriff-tools.js` (global) or `.claude/sheriff/bin/sheriff-tools.js` (local)

---

## Phase 0 — Determine scope

Based on flags:
- `--files <path1,path2,...>` → audit specific files
- `--phase <N>` → audit all source files in that phase from PHASES.md
- No flag → audit ALL source files listed in TEST_MAP.md (or PHASES.md)

Load config from .sheriff/.sheriff.json.

If no config exists, detect source dirs from project structure (look for src/, components/, stores/, composables/, utils/, pages/, etc.).

Print scope:
```
Sheriff Audit — {N} source files to review:

{list of files}
```

---

## Phase 1 — Spawn auditor agents

For each source file (up to maxParallelAgents):

```
Task(
  subagent_type="sheriff-auditor",
  model="{config.models.heavy}",
  prompt="
    Audit the source file for quality issues.

    <files_to_read>
    - .sheriff/.sheriff.json (if exists)
    - .sheriff/TEST_MAP.md (if exists)
    - {sourceFile}
    </files_to_read>

    Sub-phase: audit-{index}
    Source file: {sourceFile}
    Sheriff tools: {SHERIFF_TOOLS}
  "
)
```

Run in parallel waves. Wait for all auditors to complete.

---

## Phase 2 — Collect audit results

Read all audit reports from `.sheriff/audits/`.

Categorize:
- **Clean files** — no issues found
- **Fixed files** — source code was modified
- **Has-issues files** — issues found but not all fixed (need human review)

Print summary:
```
Audit results:
  ✅ {N} files clean
  🔧 {N} files fixed ({total issues} issues resolved)
  ⚠️  {N} files need manual review

Fixed files:
  - stores/inbox.js (2 critical, 1 warning)
  - composables/useAPI.js (1 warning)
```

If no files were fixed, print "All source files clean. No test updates needed." and stop.

---

## Phase 3 — Sync tests for fixed files

For each file that was modified by the auditor, find its test file and sync:

This reuses the sync workflow's Phase 1-4 logic, but scoped only to auditor-fixed files.

For each fixed source file (up to maxParallelAgents):

```
Task(
  subagent_type="sheriff-syncer",
  model="{config.models.heavy}",
  prompt="
    Sync tests after audit fixes were applied to source file.

    <files_to_read>
    - .sheriff/.sheriff.json
    - .sheriff/TEST_MAP.md (if exists)
    - .sheriff/audits/{auditReportFile}
    - {sourceFile}
    - {testFile} (if exists)
    </files_to_read>

    Source file: {sourceFile}
    Test file: {testFile or 'NONE — create new'}
    Mode: {update or create}
    Test run command: {testRunCommand}
    Sheriff tools: {SHERIFF_TOOLS}
    Audit report: .sheriff/audits/{auditReportFile}

    Context: The auditor fixed issues in this source file. Review the audit report
    to understand what changed, then update the test to validate the corrected behavior.
  "
)
```

---

## Phase 4 — Final report

```
Sheriff Audit + Sync complete!

Source audit:
  {N} files reviewed
  {N} files clean
  {N} files fixed
  {N} issues resolved (critical: {N}, warning: {N})
  {N} items need manual review

Test sync:
  {N} tests already passing
  {N} tests updated
  {N} new tests created
  {N} tests skipped (needs review)

Reports: .sheriff/audits/
Sync reports: .sheriff/sync/
```

---

## Error handling

- No source files found → stop with message
- Auditor fails → skip that file, continue with others
- Syncer fails → mark test for manual review, continue
- No test file exists and no TEST_MAP → create test using convention-based path
