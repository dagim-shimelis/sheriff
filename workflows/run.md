# Sheriff — Run Workflow

This is the main orchestration workflow. It runs or resumes the full Sheriff pipeline.

## Variables

Replace these at runtime:
- `{SHERIFF_TOOLS}` = `~/.claude/sheriff/bin/sheriff-tools.js` (global) or `.claude/sheriff/bin/sheriff-tools.js` (local)
- `{PHASE_NUM}` = current phase number being executed

---

## Phase 0 — Bootstrap

```bash
node {SHERIFF_TOOLS} config-exists
```

If exit code 1 (.sheriff.json missing):
- Spawn the interrogator agent first:

```
Task(
  subagent_type="sheriff-interrogator",
  model="inherit",
  prompt="
    Run onboarding for a new Sheriff project.
    Sheriff tools: {SHERIFF_TOOLS}
  "
)
```

- Wait for completion before continuing

```bash
node {SHERIFF_TOOLS} get-status --raw
```

Print a brief status to orient the user.

---

## Phase A — Discovery (if TEST_MAP.md missing)

Check if .sheriff/TEST_MAP.md exists. If not:

Read the model tier from `.sheriff.json` → `config.models.light` and resolve to a model ID:
- `"haiku"` → `"haiku"`
- `"sonnet"` → `"sonnet"`
- `"opus"` → `"opus"`

Spawn discovery agent:
```
Task(
  subagent_type="sheriff-discovery",
  model="{config.models.light}",
  prompt="Run the sheriff-discovery workflow. Project root: {cwd}. Sheriff tools path: {SHERIFF_TOOLS}."
)
```

Wait for completion. Validate that .sheriff/TEST_MAP.md now exists.
If it does not exist, stop with an error.

---

## Phase B — Planning (if PHASES.md missing)

Check if .sheriff/PHASES.md exists. If not:

Spawn planner agent using `config.models.medium`:
```
Task(
  subagent_type="sheriff-planner",
  model="{config.models.medium}",
  prompt="Run the sheriff-planner workflow. Project root: {cwd}. Sheriff tools path: {SHERIFF_TOOLS}."
)
```

Wait for completion. Validate .sheriff/PHASES.md now exists.

---

## Phase C — Execution (main loop)

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

### Spawn executors in parallel

For each sub-phase in the current wave (up to maxParallelAgents), using `config.models.heavy`:

```
Task(
  subagent_type="sheriff-executor",
  model="{config.models.heavy}",
  prompt="
    Run the sheriff-executor workflow for sub-phase {subphaseId}.

    <files_to_read>
    - .sheriff/PHASES.md
    - .sheriff/.sheriff.json
    - .sheriff/TEST_MAP.md
    - {sourceFile}
    </files_to_read>

    Sub-phase: {subphaseId}
    Agent ID: executor-{subphaseId}-{timestamp}
    Sheriff tools: {SHERIFF_TOOLS}
    Test run command: {testRunCommand}
  "
)
```

Run all wave-1 sub-phase tasks in parallel via a single message with multiple Task() calls.

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
Task(
  subagent_type="sheriff-reporter",
  model="{config.models.light}",
  prompt="
    Run the sheriff-reporter workflow for phase {PHASE_NUM}.
    Sheriff tools: {SHERIFF_TOOLS}.

    <files_to_read>
    - .sheriff/results-assembled.md
    - .sheriff/PHASES.md
    - .sheriff/.sheriff.json
    </files_to_read>
  "
)
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
