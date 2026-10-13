# Sheriff — Run Workflow

Read `{SHERIFF_ROOT}/runtime.md` for how to execute stage roles. Parallelism and model preferences below apply only when supported by that runtime.

This is the main orchestration workflow. It runs or resumes the full Sheriff pipeline.

## Variables

Replace these at runtime:
- `{SHERIFF_TOOLS}` = the shell-quoted CLI path from the installation’s `runtime.md`
- `{PHASE_NUM}` = current phase number being executed

---

## Phase 0 — Bootstrap

### Version check

```bash
node {SHERIFF_TOOLS} check-update --raw
```

If `updateAvailable` is `true`, print a notice before continuing (do NOT block the run):
```
💡 Sheriff v{latestVersion} is available (you have v{currentVersion}).
   Run /sheriff:update to upgrade.
```

If the command errors or returns `updateAvailable: false`, continue silently.

### Config check

```bash
node {SHERIFF_TOOLS} config-exists
```

If exit code 1 (.sheriff.json missing):
- Spawn the interrogator agent first:

```
Stage role: sheriff-interrogator
Model preference: inherit
Instructions:
Run onboarding for a new Sheriff project.
    Sheriff tools: {SHERIFF_TOOLS}
```

- Wait for completion before continuing

### Config version check

If .sheriff.json exists, check whether it needs migration:

```bash
node {SHERIFF_TOOLS} check-config-version --raw
```

If exit code 1 (`needsMigration: true`), the stored config is outdated or has missing fields.
Read the JSON output — it contains `missingFields` (array of dot-notation field paths) and
`storedVersion` / `currentVersion` numbers.

Spawn the interrogator in **migration mode** to ask only about new/missing settings:

```
Stage role: sheriff-interrogator
Model preference: inherit
Instructions:
Run config MIGRATION (not full onboarding).
    The user's config is from version {storedVersion}, current is {currentVersion}.

    Missing fields that need answers:
    {missingFields as JSON array}

    IMPORTANT: Do NOT re-ask questions the user has already answered.
    Only ask about the missing fields listed above.
    After answering, update .sheriff.json with the new values and set configVersion to {currentVersion}.

    Sheriff tools: {SHERIFF_TOOLS}
```

Wait for completion before continuing.

### Status

```bash
node {SHERIFF_TOOLS} get-status --raw
```

Print a brief status to orient the user.

---

## Phase A — Discovery (if TEST_MAP.md missing)

Check if .sheriff/TEST_MAP.md exists. If not:

Use `config.models.light` only when the runtime supports that model; otherwise inherit the current model.

Spawn discovery agent:
```
Stage role: sheriff-discovery
Model preference: {config.models.light}
Instructions:
Run the sheriff-discovery workflow. Project root: {cwd}. Sheriff tools path: {SHERIFF_TOOLS}.
```

Wait for completion. Validate that .sheriff/TEST_MAP.md now exists.
If it does not exist, stop with an error.

---

## Phase B — Planning (if PHASES.md missing)

Check if .sheriff/PHASES.md exists. If not:

Spawn planner agent using `config.models.medium`:
```
Stage role: sheriff-planner
Model preference: {config.models.medium}
Instructions:
Run the sheriff-planner workflow. Project root: {cwd}. Sheriff tools path: {SHERIFF_TOOLS}.
```

Wait for completion. Validate .sheriff/PHASES.md now exists.

---

## Phase C — Execution (main loop)

### Audit mode prompt

Before starting execution, ask the user:

```
Sheriff can run in two modes:

1. **Audit + Test** — Review source code for bugs, security issues, and dead code BEFORE writing tests. Fixes issues first so tests validate correct behavior.
2. **Test only** — Write tests directly against existing source code (faster, but tests may codify existing bugs).

Which mode? (1 or 2)
```

Wait for the user's response. Set `{AUDIT_MODE}` to `true` if they choose 1, `false` if they choose 2.

If the `--audit` flag was passed to the run command, skip the prompt and set `{AUDIT_MODE}` to `true`.
If the `--no-audit` flag was passed, skip the prompt and set `{AUDIT_MODE}` to `false`.

Determine the current phase number from PHASES.md (first phase with [ ] status).

### Watchdog setup

Before spawning executors, check for stale locks:
```bash
node {SHERIFF_TOOLS} check-stale-locks --raw
```

For each stale lock returned:
```bash
node {SHERIFF_TOOLS} release-subphase {subphaseId} --raw
```

### Read current wave

Parse PHASES.md for the current phase. Group sub-phases by wave number.
Start with wave 1.

### Spawn auditors (if audit mode)

If `{AUDIT_MODE}` is `true`, spawn auditor agents for each sub-phase in the current wave BEFORE spawning executors.

For each sub-phase in the current wave (up to maxParallelAgents), using `config.models.heavy`:

```
Stage role: sheriff-auditor
Model preference: {config.models.heavy}
Instructions:
Audit the source file for sub-phase {subphaseId}.

    <files_to_read>
    - .sheriff/PHASES.md
    - .sheriff/.sheriff.json
    - .sheriff/TEST_MAP.md
    - {sourceFile}
    </files_to_read>

    Sub-phase: {subphaseId}
    Source file: {sourceFile}
    Sheriff tools: {SHERIFF_TOOLS}
```

Run all auditor tasks in parallel. Wait for ALL auditors in the wave to complete before spawning executors. This ensures executors test the corrected source code.

Create the `.sheriff/audits/` directory if it doesn't exist:
```bash
mkdir -p .sheriff/audits
```

### Pre-check: detect existing test files (CRITICAL — prevents duplicates)

Before spawning executors, check for existing test files for each sub-phase in the wave.

For each sub-phase, get the `file:` field from PHASES.md (the target test file path) and the `source:` field.

**Check if a test file already exists** for this source file:

1. Check the exact `file:` path from PHASES.md
2. Glob for `tests/**/*{sourceBasename}*.test.{js,ts}` and `tests/**/*{sourceBasename}*.spec.{js,ts}`
3. Check TEST_MAP.md for any existing test mapping

If an existing test file is found:
- Set `{existingTestFile}` to that path
- Set `{executorMode}` to `"update"` — the executor must UPDATE the existing file, not create a new one
- The PHASES.md `file:` path should be overridden with the existing test file path

If no existing test file is found:
- Set `{existingTestFile}` to `"NONE"`
- Set `{executorMode}` to `"create"`

### Spawn executors in parallel

For each sub-phase in the current wave (up to maxParallelAgents), using `config.models.heavy`:

```
Stage role: sheriff-executor
Model preference: {config.models.heavy}
Instructions:
Run the sheriff-executor workflow for sub-phase {subphaseId}.

    <files_to_read>
    - .sheriff/PHASES.md
    - .sheriff/.sheriff.json
    - .sheriff/TEST_MAP.md
    - {sourceFile}
    - {existingTestFile} (if mode is update — READ THIS FIRST before writing)
    - .sheriff/audits/{subphaseId}.md (if audit mode — read for context on fixes applied)
    </files_to_read>

    Sub-phase: {subphaseId}
    Agent ID: executor-{subphaseId}-{timestamp}
    Sheriff tools: {SHERIFF_TOOLS}
    Test runners: {config.testRunners}
    Test run command: {testRunCommand}
    Audit mode: {AUDIT_MODE}
    Executor mode: {executorMode}
    Existing test file: {existingTestFile}

    CRITICAL: If executor mode is 'update', you MUST edit the existing test file
    at {existingTestFile}. Do NOT create a new test file. Add new test cases to
    the existing file's structure. If the existing file already covers some test
    cases from the sub-phase checklist, skip those — do not duplicate them.
```

Run all wave-1 sub-phase tasks in parallel using the runtime’s execution policy.

### Spot-check after each wave

After all wave tasks settle (pass or fail):
1. Check that each claimed sub-phase has a result file in .sheriff/results/
2. Check that each has a git commit
3. Any sub-phase still showing 🔒 after all tasks settled → release lock + re-queue

If re-queued sub-phases exist, run them as a new wave before advancing.

### Advance to next wave

Repeat for wave 2, wave 3, etc. until all sub-phases in the phase are complete.

---

## Phase D — Reporting

Pre-assemble results:
```bash
node {SHERIFF_TOOLS} assemble-results {PHASE_NUM} --raw
```

Spawn reporter agent using `config.models.light`:
```
Stage role: sheriff-reporter
Model preference: {config.models.light}
Instructions:
Run the sheriff-reporter workflow for phase {PHASE_NUM}.
    Sheriff tools: {SHERIFF_TOOLS}.

    <files_to_read>
    - .sheriff/results-assembled.md
    - .sheriff/PHASES.md
    - .sheriff/.sheriff.json
    </files_to_read>
```

---

## Phase E — Continue or Complete

Check PHASES.md for remaining phases with [ ] status.

If more phases remain:
- Print: "Phase {N} complete. Starting Phase {N+1}..."
- Loop back to Phase C with the next phase number

If all phases complete:
- Print final summary:

```
🎉 Sheriff complete!

{N} sub-phases executed
{N} tests passing
{N} tests skipped (needs review)
{N} bugs found

Phase summaries:
- .sheriff/summaries/phase-1.md
- .sheriff/summaries/phase-2.md
...

Review items: run /sheriff:status for details.
```

---

## Error handling

- Discovery agent fails → stop, tell user what went wrong
- Planner agent fails → stop, tell user
- Executor fails to write test file at all → mark sub-phase as ❌ fail, continue with others
- Reporter fails → print raw status from assembled results, still update PHASES.md manually
- Git not available → skip git steps silently, continue
