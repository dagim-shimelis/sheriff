# Sheriff — Sync Workflow

Detects source code changes, audits them for quality issues, fixes problems, then updates tests to match. Audit is on by default — use `--no-audit` to skip.

## Variables

Replace at runtime:
- `{SHERIFF_TOOLS}` = `~/.claude/sheriff/bin/sheriff-tools.js` (global) or `.claude/sheriff/bin/sheriff-tools.js` (local)
- `{AUDIT_MODE}` = `true` (default) or `false` (if `--no-audit` flag)

---

## Phase 0 — Determine changed files

### Detect change scope

Based on flags passed:
- `--since-commit <sha>` → `git diff <sha>..HEAD --name-only`
- `--since-branch <branch>` → `git diff <branch>...HEAD --name-only`
- `--staged` → `git diff --cached --name-only`
- `--files <path1,path2,...>` → use provided file list directly
- No flag → `git diff HEAD~1 --name-only` (last commit)

```bash
git diff {baseline} --name-only -- '*.js' '*.ts' '*.vue' '*.jsx' '*.tsx'
```

Filter results:
- Only include files in sourceDirs from .sheriff.json
- Exclude files matching excludeDirs / excludePatterns
- Exclude test files themselves (anything in tests/ or matching *.test.* / *.spec.*)

If no changed source files found, print:
```
No source file changes detected. Nothing to sync.
```
And stop.

### Print change summary

```
Sheriff Sync — {N} source files changed:

{list of changed files, one per line}

Mode: audit + sync (default)  |  Mode: sync only (--no-audit)
```

---

## Phase 1 — Map changes to tests

For each changed source file, find the corresponding test file:

### Strategy 1: TEST_MAP.md lookup (if exists)
Read .sheriff/TEST_MAP.md. Cross-reference the Coverage Map table to find which test files cover which source files.

### Strategy 2: PHASES.md lookup (if exists)
Read .sheriff/PHASES.md. Each sub-phase has `source:` and `file:` fields mapping source → test.

### Strategy 3: Convention-based discovery
For each changed file, glob for matching test files:
```
tests/**/*{basename}*.test.{js,ts}
tests/**/*{basename}*.spec.{js,ts}
```

Where `{basename}` is the source filename without extension.

### Strategy 4: Import-based discovery
If strategies 1-3 find nothing, grep test files for imports of the changed source:
```bash
grep -rl "{sourceFile}" tests/
```

### Build the mapping

Create a list of entries:
```
{ sourceFile, testFile (or null), changeType: "modified" | "added" | "deleted" }
```

Print the mapping:
```
Test mapping:
  stores/inbox.js → tests/unit/stores/inbox.test.js (update)
  composables/useNewFeature.js → (no test found — will create)
  utils/removed.js → tests/unit/utils/removed.test.js (source deleted)
```

---

## Phase 2 — Handle deleted source files

For entries where `changeType` is "deleted" and a test file exists:
- Print a warning: `Source file deleted: {sourceFile}. Test file exists: {testFile}. Skipping — review manually.`
- Do NOT auto-delete test files. That's a human decision.

Remove these from the active list.

---

## Phase 3 — Audit changed files (default — skip if --no-audit)

If `{AUDIT_MODE}` is `false`, skip to Phase 4.

Create `.sheriff/audits/` directory if it doesn't exist:
```bash
mkdir -p .sheriff/audits
```

For each changed source file (up to maxParallelAgents), spawn an auditor:

```
Task(
  subagent_type="sheriff-auditor",
  model="{config.models.heavy}",
  prompt="
    Audit the changed source file for quality issues.

    <files_to_read>
    - .sheriff/.sheriff.json (if exists)
    - .sheriff/TEST_MAP.md (if exists)
    - {sourceFile}
    </files_to_read>

    Sub-phase: sync-audit-{index}
    Source file: {sourceFile}
    Sheriff tools: {SHERIFF_TOOLS}

    Git diff for this file:
    ```
    {output of git diff {baseline} -- {sourceFile}}
    ```

    Focus your audit on the CHANGED portions of the file. Review the full file
    for context, but prioritize auditing the new/modified code shown in the diff.
  "
)
```

Run all auditor tasks in parallel. Wait for ALL to complete before proceeding.

### Print audit summary

```
Audit results:
  ✅ {N} files clean
  🔧 {N} files fixed ({total issues} issues resolved)
  ⚠️  {N} files need manual review
```

If any files were fixed, their source code has now changed — the test sync in Phase 4 will catch this.

---

## Phase 4 — Run affected tests (quick check)

Before spawning any sync agents, run ALL affected test files at once to see what's actually broken:

```bash
{testRunCommand} {testFile1} {testFile2} {testFile3} ...
```

Parse results:
- Tests that pass → no action needed. Remove from active list.
- Tests that fail → need sync agent.
- Source files with no test → need sync agent in create mode.

Print status:
```
Quick check results:
  ✅ stores/inbox.test.js — all passing (no sync needed)
  ❌ composables/useAPI.test.js — 3 failures
  🆕 composables/useNewFeature.js — no test file (will create)
```

If everything passes and no new tests needed:
```
All tests pass. Nothing to sync!
```
And stop.

---

## Phase 5 — Spawn sync agents

For each file needing sync (up to maxParallelAgents from .sheriff.json):

```
Task(
  subagent_type="sheriff-syncer",
  model="{config.models.heavy}",
  prompt="
    Sync tests for changed source file.

    <files_to_read>
    - .sheriff/.sheriff.json
    - .sheriff/TEST_MAP.md
    - {sourceFile}
    - {testFile} (if exists)
    - .sheriff/audits/sync-audit-{index}.md (if audit was run — read for context)
    </files_to_read>

    Source file: {sourceFile}
    Test file: {testFile or 'NONE — create new'}
    Mode: {update or create}
    Test run command: {testRunCommand}
    Sheriff tools: {SHERIFF_TOOLS}
    Audited: {AUDIT_MODE}

    Git diff for this file:
    ```
    {output of git diff {baseline} -- {sourceFile}}
    ```

    {If audit was run and produced a report:}
    Audit context: The auditor reviewed this file and may have applied fixes.
    Read the audit report for details on what was changed and why.
    Ensure your tests validate the corrected behavior.
  "
)
```

Run sync agents in parallel waves (same wave logic as executor).

---

## Phase 6 — Report

Create `.sheriff/sync/` directory if it doesn't exist.

Print final summary:
```
Sheriff Sync complete!

{N} source files changed
{If audit mode:}
  {N} files audited clean
  {N} files had issues fixed
  {N} audit issues resolved
{End if}
{N} tests already passing (no update needed)
{N} tests updated to match new behavior
{N} new test files created
{N} tests skipped (needs manual review)

{If audit mode:} Audit reports: .sheriff/audits/
Sync reports: .sheriff/sync/
```

---

## Error handling

- Git not available → stop, tell user
- No .sheriff.json → warn, use defaults (vitest for unit runner, conventional test paths)
- Auditor fails on a file → skip audit for that file, still sync its tests
- Sync agent fails entirely → mark file for manual review, continue with others
- All tests still fail after sync → report which files need manual attention
