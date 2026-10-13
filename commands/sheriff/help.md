---
name: sheriff:help
description: Show Sheriff usage guide — commands, agents, configuration, tips, and troubleshooting for new and returning users.
allowed-tools:
  - Read
  - Bash
---

<execution_context>
Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.
</execution_context>

<process>

## Step 1 — Get version info

Run:
```bash
node {SHERIFF_TOOLS} check-update --raw 2>/dev/null || echo '{}'
```

Parse the output to get `currentVersion` and whether `updateAvailable` is true.

## Step 2 — Display the help guide

Print the following guide, filling in version info where indicated:

---

```
  ███████╗██╗  ██╗███████╗██████╗ ██╗███████╗███████╗
  ██╔════╝██║  ██║██╔════╝██╔══██╗██║██╔════╝██╔════╝
  ███████╗███████║█████╗  ██████╔╝██║█████╗  █████╗
  ╚════██║██╔══██║██╔══╝  ██╔══██╗██║██╔══╝  ██╔══╝
  ███████║██║  ██║███████╗██║  ██║██║██║     ██║
  ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝     ╚═╝
```

**Automated test coverage for any JS/TS project. Fire and forget.**

Version: v{currentVersion}
{If updateAvailable is true, show: "Update available: v{latestVersion} — run /sheriff:update to upgrade"}

---

### Getting Started

If this is your first time using Sheriff:

```
/sheriff:run
```

That's all you need. Sheriff will:
1. Onboard to your project (detect framework, language, test runners)
2. Ask what test types you want (unit tests, E2E tests, or both)
3. Set up a test runner if you don't have one
4. Scan your codebase for untested files
5. Plan a phased test strategy based on risk
6. Write, run, and fix tests — committing each batch
7. Report results when done

Just run the command and walk away.

---

### Commands

| Command | What it does |
|---------|-------------|
| `/sheriff:run` | Run or resume the full pipeline. Start here. |
| `/sheriff:run --audit` | Audit source code for bugs/security issues before writing tests. |
| `/sheriff:run --no-audit` | Skip audit, write tests directly (faster). |
| `/sheriff:run --phase 3` | Re-execute only phase 3 (skip discovery and planning). |
| `/sheriff:run --from-scratch` | Re-discover and re-plan from zero. Keeps existing test files. |
| `/sheriff:status` | Show progress — phases complete, tests passing, items needing review. |
| `/sheriff:configure` | Re-run onboarding to change settings (runners, test types, strategy, etc). |
| `/sheriff:audit` | Audit source code for bugs/security, fix issues, then update affected tests. |
| `/sheriff:audit --files stores/inbox.js` | Audit specific files only. |
| `/sheriff:audit --phase 3` | Audit all source files in a specific phase. |
| `/sheriff:sync` | Audit changed code + update tests (default: audits first). |
| `/sheriff:sync --no-audit` | Skip audit, just sync tests to match changed source. |
| `/sheriff:sync --since-branch main` | Audit + sync all changes since diverging from main. |
| `/sheriff:sync --staged` | Audit + sync staged changes only. |
| `/sheriff:sync --since-commit abc123` | Audit + sync changes since a specific commit. |
| `/sheriff:reset` | Delete Sheriff state (`.sheriff/` dir). Never deletes your test files. |
| `/sheriff:reset --discovery-only` | Clear only TEST_MAP.md and PHASES.md — keeps tests and summaries. |
| `/sheriff:update` | Check for and install the latest version from npm. |
| `/sheriff:help` | Show this guide. |

---

### How the Pipeline Works

Sheriff runs a multi-stage pipeline. Claude Code can delegate stages; Codex runs each role sequentially:

```
/sheriff:run
    |
    v
[Stage 0] Interrogator  — Onboards to your project, writes .sheriff.json
    |
    v
[Stage A] Discovery      — Scans every source file, maps test gaps → TEST_MAP.md
    |
    v
[Stage B] Planner        — Groups files into risk-ordered phases → PHASES.md
    |
    v
[Stage C] Auditors       — (audit mode) Review source code, fix bugs before testing
    |
    v
[Stage C] Executors      — Write tests in parallel waves, auto-fix failures, commit
    |
    v
[Stage D] Reporter       — Collect results, write phase summaries
    |
    v
[Stage E] Loop/Complete  — Coverage target met? Done. Gaps remain? Back to Stage A.
```

---

### Agents

Sheriff uses specialized roles; Codex executes them sequentially. Each has a dedicated role:

| Agent | Role | What it produces |
|-------|------|-----------------|
| **Interrogator** | Detects framework, sets up test runners, writes config | `.sheriff.json` |
| **Discovery** | Scans source files, identifies test gaps | `TEST_MAP.md` |
| **Planner** | Groups work into risk/domain/complexity phases | `PHASES.md` |
| **Auditor** | Reviews source code for bugs, security issues, dead code (audit mode only) | Audit reports + source fixes |
| **Executor** | Writes tests, runs them, fixes failures, commits | Test files + commits |
| **Reporter** | Aggregates results, calculates coverage delta | Phase summary reports |

---

### Configuration

After first run, config lives at `.sheriff/.sheriff.json`. Edit directly or use `/sheriff:configure`.

**Key settings:**

| Setting | Options | What it controls |
|---------|---------|-----------------|
| `testTypes` | `{ unit: true, e2e: true }` | Which test types to generate |
| `testRunners` | `vitest`, `jest`, `mocha`, `playwright`, `cypress`, etc | Which runners to use |
| `phaseStrategy` | `risk`, `domain`, `complexity` | How files are grouped into phases |
| `onTestFailure` | `flag`, `fix`, `fix-and-notify` | What happens when a test can't be fixed |
| `maxParallelAgents` | Number (default: 3) | How many executor agents run simultaneously |
| `models` | `{ light, medium, heavy }` | Model assignment per agent tier (`haiku`/`sonnet`/`opus`) |

**Phase strategies:**
- **risk** — Critical code first (auth, payments, security), utilities last. Best for production apps.
- **domain** — Follows data flow (stores → composables → components → routes). Best for structured apps.
- **complexity** — Easy wins first (pure functions), hard files last. Best for ramping up coverage.

**Model tiers (Claude Code only; Codex inherits the current model):**
- **light** (discovery, reporter) — High volume scanning, no deep reasoning needed. Default: `haiku`
- **medium** (interrogator, planner) — Reasoning about structure and risk. Default: `sonnet`
- **heavy** (executor) — Writing and fixing tests. Most important. Default: `opus`

---

### Common Workflows

**First time setup:**
```
/sheriff:run
```

**Check progress mid-run:**
```
/sheriff:status
```

**Re-run after adding new source files:**
```
/sheriff:run --from-scratch
```

**Re-run a single phase that had failures:**
```
/sheriff:run --phase 2
```

**Change test types or strategy:**
```
/sheriff:configure
/sheriff:reset --discovery-only
/sheriff:run
```

**After modifying source code — audit + sync tests:**
```
/sheriff:sync
```

**Quick sync without audit:**
```
/sheriff:sync --no-audit
```

**Before a PR — audit + sync all changes against main:**
```
/sheriff:sync --since-branch main
```

**Audit entire codebase (not just changed files):**
```
/sheriff:audit
```

**Audit specific files:**
```
/sheriff:audit --files stores/inbox.js,composables/useAPI.js
```

**Start completely fresh:**
```
/sheriff:reset
/sheriff:run
```

**Update to latest version:**
```
/sheriff:update
```

---

### Generated Files

All Sheriff state lives in `.sheriff/` at your project root:

```
.sheriff/
├── .sheriff.json      — Project configuration
├── TEST_MAP.md        — Source-to-test coverage map
├── PHASES.md          — Execution plan with phase/wave assignments
├── results/           — Per-sub-phase result reports
├── audits/            — Per-sub-phase source code audit reports (audit mode only)
├── summaries/         — Per-phase summary reports
└── handoffs/          — Context handoff notes for long phases
```

Your actual test files are written to your project's test directories (never inside `.sheriff/`). Resetting Sheriff never deletes your test files.

---

### Tips

- **Let it run.** Sheriff is designed to be autonomous. Start `/sheriff:run` and come back later.
- **Check status anytime.** Use `/sheriff:status` to see where things stand without interrupting.
- **Review flagged items.** Sub-phases marked `needs review` have comments in the test files explaining what failed.
- **Iterate.** After Sheriff finishes, you can re-run `/sheriff:run` and it picks up where it left off — only covering remaining gaps.
- **Tune parallelism.** If you hit API rate limits, lower `maxParallelAgents`. For large codebases, increase it.
- **Claude model costs.** Set all model tiers to `haiku` for budget runs, or `opus` for maximum quality.
- **Safe to stop.** Each passing test batch is committed atomically. Stopping mid-run loses no work.

---

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Sheriff says "not configured" | Run `/sheriff:run` — it auto-configures on first run |
| Tests fail repeatedly | Check `onTestFailure` setting. Try `fix` mode, or review flagged tests manually |
| Wrong test runner detected | Run `/sheriff:configure` to pick the correct runner |
| Want to change strategy mid-run | `/sheriff:configure` → `/sheriff:reset --discovery-only` → `/sheriff:run` |
| Stale progress / corrupt state | `/sheriff:reset` clears everything. Your tests are safe. |
| Need to update | `/sheriff:update` or `npx @dagim_s/sheriff@latest` |

---

### Requirements

- **Node.js** >= 18
- **Claude Code or Codex** with local file and shell access
- **Project type**: JavaScript or TypeScript with a `package.json`
- **Test runner**: Any (Vitest, Jest, Mocha, etc) — Sheriff sets one up if missing

---

### Links

- **npm**: `npx @dagim_s/sheriff`
- **Install globally**: `npx @dagim_s/sheriff --tool {INSTALL_TOOL} --global`
- **Install locally**: `npx @dagim_s/sheriff --tool {INSTALL_TOOL} --local`
- **Uninstall**: `npx @dagim_s/sheriff --tool {INSTALL_TOOL} --uninstall`

---

## Step 3 — Check for update notice

If `updateAvailable` was true, add a final reminder:

```
💡 A newer version of Sheriff is available (v{latestVersion}). Run /sheriff:update to upgrade.
```

</process>
