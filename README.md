```
  ███████╗██╗  ██╗███████╗██████╗ ██╗███████╗███████╗
  ██╔════╝██║  ██║██╔════╝██╔══██╗██║██╔════╝██╔════╝
  ███████╗███████║█████╗  ██████╔╝██║█████╗  █████╗
  ╚════██║██╔══██║██╔══╝  ██╔══██╗██║██╔══╝  ██╔══╝
  ███████║██║  ██║███████╗██║  ██║██║██║     ██║
  ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝     ╚═╝
```

<div align="center">

**Automated test coverage for any JS/TS project. Fire and forget.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![npm version](https://img.shields.io/npm/v/@dagim_s/sheriff)](https://www.npmjs.com/package/@dagim_s/sheriff)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-plugin-blueviolet)](https://docs.anthropic.com/claude-code)

</div>

---

## What is Sheriff?

Sheriff is a Claude Code plugin that **automatically discovers, plans, writes, fixes, and commits tests** for any JavaScript or TypeScript project — with zero configuration required.

Point it at your codebase, run one command, and walk away. Sheriff interrogates your project structure, finds every untested file and function, groups work into risk-ordered phases, dispatches parallel executor agents to write real tests against your actual framework, auto-fixes failures (up to 3 attempts per suite), and commits everything with a structured summary. No test templates, no manual configuration, no babysitting — just coverage where there was none.

Sheriff is built on Claude Code's multi-agent plugin system. It installs as a first-class plugin with slash commands, sub-agents, and lifecycle hooks. It works with whatever test runner and framework your project already uses — or sets one up for you if you don't have one yet.

---

## Quick Start

**Step 1 — Install Sheriff**

```bash
npx @dagim_s/sheriff
```

Run the interactive installer. It will register Sheriff as a Claude Code plugin, installing its commands, agents, and hooks into your Claude Code environment. You can also install non-interactively:

```bash
npx @dagim_s/sheriff --global   # install globally (all projects)
npx @dagim_s/sheriff --local    # install locally (current project only)
```

To uninstall:

```bash
npx @dagim_s/sheriff --uninstall
```

**Step 2 — Run Sheriff inside Claude Code**

Open Claude Code in your project, then run:

```
/sheriff:run
```

**Step 3 — That's it.**

Sheriff handles everything from here. It onboards itself to your project, sets up test runners if needed, scans your source tree, plans a phased test strategy, writes and runs the tests, fixes failures, and commits results — all autonomously.

> Sheriff installs as a Claude Code plugin, giving it access to slash commands (`/sheriff:run`, `/sheriff:status`, `/sheriff:configure`, `/sheriff:reset`, `/sheriff:update`), dedicated sub-agents for each stage of the pipeline, and lifecycle hooks that coordinate the multi-agent workflow.

---

## How It Works

Sheriff runs a seven-stage pipeline. Each stage is handled by a dedicated agent. Stages run sequentially at the top level; within Stage C, executor agents run in parallel across sub-phases.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        /sheriff:run                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
          ┌────────────────────────────────────────┐
          │  STAGE 0 · Bootstrap                   │
          │  sheriff-interrogator                  │
          │                                        │
          │  • Detects framework, language,         │
          │    package manager, tsconfig           │
          │  • Asks: unit tests? E2E tests?        │
          │  • Recommends & configures runners     │
          │  • Validates setup with dummy test     │
          │  • Writes .sheriff.json config         │
          └──────────────────┬─────────────────────┘
                             │
                             ▼
          ┌────────────────────────────────────────┐
          │  STAGE A · Discovery                   │
          │  sheriff-discovery                     │
          │                                        │
          │  • Scans every source file             │
          │  • Identifies existing test coverage   │
          │  • Flags untested files & functions    │
          │  • Respects testTypes config           │
          │  • Writes TEST_MAP.md                  │
          └──────────────────┬─────────────────────┘
                             │
                             ▼
          ┌────────────────────────────────────────┐
          │  STAGE B · Planning                    │
          │  sheriff-planner                       │
          │                                        │
          │  • Groups by risk, domain, complexity  │
          │  • Plans only enabled test types       │
          │  • Assigns files to ordered waves      │
          │  • Writes PHASES.md                    │
          └──────────────────┬─────────────────────┘
                             │
                             ▼
          ┌────────────────────────────────────────┐
          │  STAGE C · Execution                   │
          │  sheriff-executor  (parallel)          │
          │                                        │
          │  For each sub-phase:                   │
          │  • Claims sub-phase (lock file)        │
          │  • Writes tests using correct runner   │
          │  • Runs test suite                     │
          │  • Fixes failures (up to 3 attempts)   │
          │  • Commits passing tests               │
          └──────────────────┬─────────────────────┘
                             │
                             ▼
          ┌────────────────────────────────────────┐
          │  STAGE D · Reporting                   │
          │  sheriff-reporter                      │
          │                                        │
          │  • Collects results from all phases    │
          │  • Writes phase summary reports        │
          │  • Calculates coverage delta           │
          └──────────────────┬─────────────────────┘
                             │
                             ▼
          ┌────────────────────────────────────────┐
          │  STAGE E · Loop or Complete            │
          │                                        │
          │  Coverage target met? → Done           │
          │  Gaps remain?        → Back to Stage A │
          └────────────────────────────────────────┘
```

---

## Test Runner Setup

Sheriff can work with **any test runner** — and will set one up for you if your project doesn't have one yet.

### How detection works

During onboarding, Sheriff scans your `package.json` and config files to detect installed runners:

- **Unit runners**: Vitest, Jest, Mocha, Jasmine
- **E2E runners**: Playwright, Cypress, Nightwatch, Puppeteer

If a runner is found in `devDependencies` with a matching config file (e.g., `vitest.config.js`), it's used automatically.

### If no runner is detected

Sheriff asks you to choose one, with framework-aware recommendations:

```
Which unit test runner would you like to use?

  a) Vitest  ← recommended for your stack
  b) Jest
  c) Mocha
  d) Other (specify)
```

| Your framework | Unit recommendation | E2E recommendation |
|---------------|--------------------|--------------------|
| Vue / Nuxt | Vitest | Playwright |
| React / Next | Vitest | Playwright |
| Svelte / SvelteKit | Vitest | Playwright |
| Express / Fastify / NestJS | Vitest | Playwright |
| Unknown | Vitest | Playwright |

The "Other" option lets you type any npm package name. Sheriff validates it exists on npm before proceeding.

### Automatic setup

Once you pick a runner, Sheriff handles the rest:

1. **Git checkpoint** — creates a commit so you can roll back if needed
2. **Install** — installs the runner and companion packages via your project's package manager (pnpm, yarn, npm, or bun — auto-detected from lockfile)
3. **Configure** — generates a minimal, functional config file tailored to your framework
4. **Validate** — writes a dummy test and runs it to confirm the setup works (up to 3 retry attempts with different strategies)
5. **Commit** — commits the setup changes

If validation fails after 3 attempts, Sheriff stops and asks you to configure the runner manually before continuing.

### Companion packages

Sheriff installs the right companion packages for your stack:

| Runner + Framework | Packages installed |
|---|---|
| Vitest + Vue | `vitest`, `@vue/test-utils`, `jsdom` |
| Vitest + React | `vitest`, `@testing-library/react`, `jsdom` |
| Vitest + Node | `vitest` |
| Jest + TypeScript | `jest`, `ts-jest` or `@swc/jest` |
| Playwright | `@playwright/test` + Chromium browser |
| Cypress | `cypress` |

---

## The Agent Architecture

Sheriff is composed of five specialized agents. Each agent has a defined role, a color-coded identity in logs, and a model profile matched to its computational demands.

| Agent | Role | Produces | Model Tier |
|---|---|---|---|
| `sheriff-interrogator` | Onboards to the project — detects framework, recommends and configures test runners, validates setup, confirms scope with the user | `.sheriff.json` | Medium (default: Sonnet) |
| `sheriff-discovery` | Scans all source files against existing tests, flags every untested file and function, respects test type settings, builds the full coverage gap map | `TEST_MAP.md` | Light (default: Haiku) |
| `sheriff-planner` | Reads the gap map, groups work by risk/domain/complexity, plans only enabled test types, assigns files to ordered waves, produces the phased execution plan | `PHASES.md` | Medium (default: Sonnet) |
| `sheriff-executor` | Claims a sub-phase, writes tests using the correct runner (unit or E2E), runs the suite, auto-fixes failures (up to 3 rounds), commits passing tests — the primary workhorse | per-phase commit | Heavy (default: Opus) |
| `sheriff-reporter` | Collects results from all executor runs, assembles structured phase summaries, calculates coverage delta | phase summary reports | Light (default: Haiku) |

### Model Profiles

Sheriff uses three configurable **model tiers** to balance cost and capability. You can assign `haiku`, `sonnet`, or `opus` to each tier during onboarding or via `/sheriff:configure`.

| Tier | Default | Agents | Purpose |
|------|---------|--------|---------|
| **Light** | Haiku | discovery, reporter | File scanning, report assembly — high volume, no deep reasoning needed |
| **Medium** | Sonnet | interrogator, planner | Reasoning about project structure, risk assessment, phase ordering |
| **Heavy** | Opus | executor | Core work — writing, running, and fixing tests. Most important agent |

Configure in `.sheriff.json`:

```json
{
  "models": {
    "light": "haiku",
    "medium": "sonnet",
    "heavy": "opus"
  }
}
```

Want to run everything on Opus for maximum quality? Set all three tiers to `"opus"`. Want to minimize cost? Set everything to `"haiku"`. Mix and match to suit your needs.

---

## Commands

Sheriff exposes five slash commands inside Claude Code. All commands are available globally after a global install, or project-scoped after a local install.

---

### `/sheriff:run`

Run or resume the full Sheriff pipeline. If Sheriff has not been configured yet, it will run onboarding first (including test runner setup). If a prior run was interrupted, it resumes from the last incomplete phase.

On every run, Sheriff checks for available updates and shows a non-blocking notice if a newer version exists.

```
/sheriff:run
/sheriff:run --phase 3
/sheriff:run --from-scratch
```

| Flag | Description |
|------|-------------|
| `--phase <N>` | Skip discovery and planning; jump directly to executing phase N. Useful for re-running a specific phase after a manual fix. |
| `--from-scratch` | Delete `TEST_MAP.md` and `PHASES.md` before starting, forcing a full re-discovery and re-plan. Written test files are never touched. |

**Examples:**

```
# First run — onboard, discover, plan, and execute everything
/sheriff:run

# Re-run only phase 2 (e.g., after manually editing a source file)
/sheriff:run --phase 2

# Re-discover the whole codebase (e.g., after adding many new files)
/sheriff:run --from-scratch
```

---

### `/sheriff:status`

Show a summary of the current run: phases complete, tests passing, items flagged for review, and any failures.

```
/sheriff:status
```

**Output includes:**

- Phase progress table with test counts per phase
- Sub-phases marked `⚠️ needs review` — listed with their notes
- Sub-phases marked `❌ fail` — listed for follow-up
- Overall counts: total tests written, passing, skipped, failed

If Sheriff has not been configured: `Sheriff is not configured for this project. Run /sheriff:run to get started.`

If Sheriff has been configured but has not run: `Sheriff has not run yet. Run /sheriff:run to start.`

---

### `/sheriff:configure`

Re-run the onboarding wizard to update project settings — test types, test runners, phase strategy, parallel agent count, excluded directories, or any other config field.

```
/sheriff:configure
```

After changing configuration, re-run discovery so the plan reflects your updated settings:

```
/sheriff:reset --discovery-only
/sheriff:run
```

> Settings you can change: test types (unit/E2E), test runners, framework, language, source directories, excluded directories, phase strategy (`risk` / `domain` / `complexity`), `onTestFailure` behavior, `maxParallelAgents`, and model assignments per tier.

---

### `/sheriff:reset`

Reset Sheriff state. Never deletes test files written to your `tests/` directory — only Sheriff's own internal state files.

```
/sheriff:reset
/sheriff:reset --discovery-only
/sheriff:reset --full
```

| Flag | Description |
|------|-------------|
| `--discovery-only` | Clears `TEST_MAP.md`, `PHASES.md`, and the `results/` directory. Keeps written tests and phase summaries. Use this when you want to re-discover and re-plan without losing existing tests. |
| `--full` *(default)* | Deletes the entire `.sheriff/` directory, including config, maps, plans, results, and summaries. Your tests in `tests/` are untouched. |

> Sheriff will ask for confirmation before deleting anything.

---

### `/sheriff:update`

Check for and install the latest version of Sheriff from npm.

```
/sheriff:update
```

Sheriff compares your installed version against the latest published version. If an update is available, it re-runs the installer to upgrade in place. Your `.sheriff/` project data and test files are never affected by updates.

> Sheriff also checks for updates automatically at the start of every `/sheriff:run` and shows a non-blocking notice if a newer version is available.

---

## Configuration

After running `/sheriff:run` for the first time, Sheriff writes a `.sheriff/.sheriff.json` config file. You can edit this file directly or re-run `/sheriff:configure` to update it interactively.

**Example config:**

```json
{
  "testTypes": {
    "unit": true,
    "e2e": true
  },
  "testRunners": {
    "unit": "vitest",
    "e2e": "playwright"
  },
  "testRunnerSetup": {
    "unit": "detected",
    "e2e": "installed"
  },
  "framework": "nuxt",
  "language": "typescript",
  "sourceDirs": ["src/", "components/", "composables/", "stores/", "utils/"],
  "excludeDirs": ["node_modules", "dist", ".nuxt"],
  "phaseStrategy": "risk",
  "onTestFailure": "flag",
  "maxParallelAgents": 3,
  "models": {
    "light": "haiku",
    "medium": "sonnet",
    "heavy": "opus"
  }
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `testTypes` | `object` | Which test types are enabled. `{ unit: boolean, e2e: boolean }`. At least one must be `true`. |
| `testRunners` | `object` | The test runner for each type. `{ unit: "vitest"\|"jest"\|etc, e2e: "playwright"\|"cypress"\|etc }`. `null` if that type is disabled. |
| `testRunnerSetup` | `object` | How each runner was configured. `"detected"` if already in the project, `"installed"` if Sheriff set it up, `null` if disabled. |
| `framework` | `string` | Your project's framework — `nuxt`, `vue`, `react`, `next`, `express`, `none`, etc. Informs how executor agents write tests and set up mocks. |
| `language` | `string` | `javascript` or `typescript`. |
| `sourceDirs` | `string[]` | Directories Sheriff should scan for source files. Relative to project root. |
| `excludeDirs` | `string[]` | Directories to skip during discovery. Always include `node_modules`, `dist`, and any build output directories. |
| `phaseStrategy` | `string` | How Sheriff groups and orders work. One of `risk`, `domain`, or `complexity`. See [Phase Strategies](#phase-strategies). |
| `onTestFailure` | `string` | What executor agents do when a test fails after all retry attempts. One of `flag`, `fix`, or `fix-and-notify`. |
| `maxParallelAgents` | `number` | Maximum number of executor agents that can run simultaneously within a wave. Default: `3`. Increase for large codebases; reduce if you hit rate limits. |
| `models` | `object` | Model assignments per tier. Keys: `light`, `medium`, `heavy`. Values: `"haiku"`, `"sonnet"`, or `"opus"`. See [Model Profiles](#model-profiles). |

### `testTypes` Options

| Setting | Effect |
|---------|--------|
| `unit: true` | Sheriff discovers unit test gaps and generates unit tests using the configured unit runner. |
| `unit: false` | Unit test gaps are marked as `⊘ disabled` in TEST_MAP.md. No unit test sub-phases are planned. |
| `e2e: true` | Sheriff discovers E2E test gaps and generates E2E tests using the configured E2E runner. |
| `e2e: false` | E2E test gaps are marked as `⊘ disabled` in TEST_MAP.md. No E2E test sub-phases are planned. |

### `onTestFailure` Options

| Value | Behavior |
|-------|----------|
| `flag` | Mark the sub-phase as `⚠️ needs review` and continue. Leave a comment in the test file explaining what failed. |
| `fix` | Attempt to fix the source file directly if the test failure indicates a real bug. Continue if successful; flag if not. |
| `fix-and-notify` | Same as `fix`, but also surface a summary of source changes to the user at the end of the phase. |

---

## Phase Strategies

The `phaseStrategy` setting controls how Sheriff groups your source files into phases and in what order phases execute. Choose the strategy that best matches your project's priorities.

| Strategy | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Best for |
|----------|---------|---------|---------|---------|---------|----------|
| `risk` | Auth, billing, payments, security-critical code | Data mutations, writes, destructive operations | Core business logic and state management | UI components, presentational layers | Utilities, helpers, constants | Production apps where critical path coverage is the priority |
| `domain` | Stores / data layer | Composables / hooks / services | Components / views | API routes / controllers | Utilities and shared modules | Structured apps where you want coverage to mirror the data flow |
| `complexity` | Simple pure functions and utilities (easy wins) | Mid-complexity modules with some dependencies | Complex components with many interactions | High-dependency modules requiring deep mocks | Integration boundaries | Teams ramping up coverage who want early wins before tackling hard files |

> You can change strategy at any time by running `/sheriff:configure`, then `/sheriff:reset --discovery-only`, then `/sheriff:run` to re-plan with the new ordering.

---

## Generated Files

Sheriff stores all of its state in a `.sheriff/` directory at your project root. This directory is created on the first run and is safe to commit or gitignore — your choice.

```
.sheriff/
├── .sheriff.json          # Project configuration
├── TEST_MAP.md            # Complete source → test coverage map
├── PHASES.md              # Execution plan with phase and wave assignments
├── results-assembled.md   # Pre-aggregated results (scratch file for reporter)
├── results/               # Individual sub-phase result reports
│   ├── 1.1.md
│   ├── 1.2.md
│   └── ...
├── summaries/             # Phase summary reports
│   ├── phase-1.md
│   ├── phase-2.md
│   └── ...
└── handoffs/              # Context handoff notes for long-running phases
    ├── executor-1.1-handoff.md
    └── ...
```

### File Descriptions

**`.sheriff.json`** — The project configuration file. Written by the interrogator agent during onboarding. Edit directly or via `/sheriff:configure`.

**`TEST_MAP.md`** — The complete coverage map for your project. Lists every source file with its unit and E2E test status (respecting test type settings), complexity rating, risk level, and notes on existing coverage. Generated by the discovery agent. This is the source of truth for what needs to be tested.

**`PHASES.md`** — The execution plan. Divides work from `TEST_MAP.md` into numbered phases and waves. Each sub-phase entry records its status (`[ ]` pending, `🔒` locked, `✅` pass, `⚠️` needs review, `❌` fail), its wave assignment, dependencies, and the target test file path. Only enabled test types appear as sub-phases.

**`results/`** — One report file per sub-phase, written by executor agents after each sub-phase completes. Contains test counts, pass/fail breakdown, retry history, and any notes for flagged items.

**`summaries/`** — One summary file per phase, written by the reporter agent. Aggregates all sub-phase results for the phase into a structured report with coverage delta, pass rate, and a list of items needing review.

**`handoffs/`** — Context handoff notes written by executor agents when approaching context window limits. Allow long-running phases to be resumed cleanly by a fresh agent instance without losing progress.

---

## Smart Features

### Wave-Based Parallelism

Sheriff groups sub-phases within each phase into **waves** based on file dependencies. Sub-phases with no shared dependencies run simultaneously in the same wave; sub-phases that depend on files being tested by a peer executor wait for the prior wave to complete. This maximizes throughput while avoiding test conflicts.

### Context Monitoring

A `PostToolUse` hook tracks context window usage after every tool call inside executor agents. When remaining context drops to **35%**, agents receive a soft warning and are prompted to wrap up their current sub-phase. At **25%** remaining, agents are instructed to write a handoff note before yielding — ensuring no work is lost when context exhausts.

### Statusline

A real-time progress bar appears in the Claude Code statusline while Sheriff is running:

```
🔫 Sheriff  Phase 2/5  ████████░░  3 running  12✅ 2⚠️
```

The statusline updates after every tool use via the `Statusline` hook, showing the current phase, a visual progress bar, the number of active executor agents, and a running tally of passed and flagged sub-phases.

### Auto-Retry with Escalation

When a test fails, executor agents apply a three-stage escalation strategy before giving up:

1. **Attempt 1** — Fix the test itself (wrong assertions, missing imports, bad mock setup)
2. **Attempt 2** — Fix harder (revisit test structure, re-examine the source API)
3. **Attempt 3** — Fix the source file (if `onTestFailure: fix` is set) or skip with an explanatory comment

If all three attempts fail, the sub-phase is marked `⚠️ needs review` and execution continues with the next sub-phase.

### Git Safety

Sheriff makes atomic git commits per sub-phase, so every passing test batch is safely checkpointed before the next batch begins. If a catastrophic failure occurs mid-phase, Sheriff rolls back to the last clean commit and marks the failed sub-phases for re-queuing.

When installing new test runners, Sheriff creates a pre-setup checkpoint commit so the entire setup can be rolled back cleanly if anything goes wrong.

### Stale Lock Detection

When Sheriff spawns executor agents in parallel, each agent claims its sub-phase by writing a lock entry in `PHASES.md`. Before each wave, the orchestrator runs a watchdog check: any sub-phase that has been locked for longer than expected but has no result file is treated as abandoned. Stale locks are released and the sub-phase is re-queued for the next available executor.

### Mock Pattern Detection

The discovery agent reads a sample of your existing test files before writing `TEST_MAP.md`. It identifies your project's mocking conventions — `vi.mock`, `jest.mock`, manual factories, MSW handlers, etc. — and records them as annotations. Executor agents read these annotations so their generated tests match your codebase's patterns from the start.

### Automatic Version Checks

Every time `/sheriff:run` executes, it checks npm for a newer version and displays a non-blocking notice if an update is available. You can update at any time with `/sheriff:update`.

---

## Installation Details

Running `npx @dagim_s/sheriff` copies Sheriff's components into your Claude Code environment.

### What Gets Installed

| Component | Source | Destination (global) | Destination (local) |
|-----------|--------|----------------------|---------------------|
| Slash commands | `commands/sheriff/` | `~/.claude/commands/sheriff/` | `.claude/commands/sheriff/` |
| Sub-agents | `agents/sheriff-*.md` | `~/.claude/agents/` | `.claude/agents/` |
| Hooks | `hooks/dist/sheriff-*.js` | `~/.claude/hooks/` | `.claude/hooks/` |
| Tools & workflows | `sheriff/` | `~/.claude/sheriff/` | `.claude/sheriff/` |
| Hook config | auto-injected | `~/.claude/settings.json` | `.claude/settings.json` |

### Global vs Local Install

**Global install** (`--global` or press `g` at the prompt):

- Commands and agents are available in **every project** you open in Claude Code
- Installed to `~/.claude/`
- Recommended for most users

**Local install** (`--local` or press `l` at the prompt):

- Commands and agents are scoped to the **current project only**
- Installed to `.claude/` at your project root
- Useful for teams that want Sheriff committed to the repo

### Uninstalling

```bash
npx @dagim_s/sheriff --uninstall
```

Removes all Sheriff files (commands, agents, hooks, tools) and cleans Sheriff's entries from `settings.json`. Your `.sheriff/` project directory and any test files are never touched.

---

## Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | >= 18.0.0 |
| Claude Code CLI | Latest |
| Project type | JavaScript or TypeScript |

**Test runner**: Sheriff works with Vitest, Jest, Mocha, or any runner with a CLI. If your project doesn't have a test runner, Sheriff will recommend one and set it up for you.

**E2E runner** *(optional)*: Playwright, Cypress, Nightwatch, Puppeteer, or any E2E tool with a CLI.

Sheriff works with any JS/TS project — React, Vue, Nuxt, Next.js, Svelte, Express, Fastify, NestJS, plain Node, Bun, monorepos. If your project has a `package.json`, Sheriff can cover it.

---

## License

MIT © [dagim_s](https://github.com/dagim-mante)

---

## Contributing

Sheriff is at **v0.1.0** — early, functional, and improving fast.

Contributions are very welcome. Whether it's a bug report, a new phase strategy, support for an additional test runner, better mock pattern detection, or improvements to the agent prompts — open an issue or pull request on GitHub.

A few areas where help would be especially valuable:

- **Test runner adapters** — improving setup recipes for Mocha, Bun test, Jasmine, and others
- **Framework-specific mock patterns** — better out-of-the-box detection for Angular, Svelte, SolidJS
- **E2E patterns** — deeper Playwright and Cypress test generation strategies
- **Monorepo handling** — smarter scoping for pnpm/yarn/Nx workspaces
- **Runner config templates** — more framework-specific minimal configs

If you're building on top of Sheriff or integrating it into a larger workflow, feel free to open a discussion — feedback on the agent API shapes the roadmap.
