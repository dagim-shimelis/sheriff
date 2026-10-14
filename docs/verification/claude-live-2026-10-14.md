# Claude Code live acceptance attempt — 2026-10-14

Outcome: **blocked by account access before model execution**.

The packed Sheriff package installed successfully into a disposable project. Claude Code detected all eight native Sheriff commands: audit, configure, help, reset, run, status, sync, and update. The fixture's original test also passed independently.

The first live `/sheriff:help` invocation exited 1 after approximately three seconds with:

> Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access

Claude authentication reported a signed-in account, but subscription access was disabled by its organization. No Anthropic API credential or alternate provider was configured in the process environment. Credentials and account settings were not changed.

## Evidence and scope

- Package runtime: commit `9ae0f51`, version `0.1.5`.
- Claude Code: `2.1.263`; initialization reported default model `claude-opus-5[1m]`.
- Fixture baseline: one passing node:test regression.
- Packed install: passed.
- Native command discovery: all eight commands present in Claude's initialization event.
- Live help/run/audit/pause/resume/sync/status: unverified; execution stopped at the first invocation.
- Hook lifecycle events: none observed before the account denial.
- Reported model token usage: zero input and output tokens.

The response stream wrapped the denial in a `result` event labeled `success`, but the process exited 1. The harness correctly stopped. Its result parser now preserves the provider message, classifies this denial as blocked, and has regression tests for this contradictory response shape. The parser was checked against the actual retained stream without making another provider request.

Retained evidence directory:

```text
/var/folders/qd/xrv7nd3j45zg4zhsqhn7xm5h0000gn/T/sheriff-claude-live-H0Zz4R/
```

`report.json` is the original attempt record; `diagnosis.json` records the explicit access denial and native discovery. `01-help.jsonl` contains the host events, and `project/` retains the installed integration and untouched fixture for inspection. The operating system may eventually remove this temporary directory.

## Resume

Enable Claude Code subscription access for the signed-in organization, or configure authorized API access locally. Then run:

```bash
npm run test:live:claude
```

The shared [harness](../../tests/live/run.js) creates a fresh fixture for each run. No Claude workflow pass is claimed from installation or command discovery alone. Interactive statusline/context warnings, delegated workers, Windows, and browser/E2E runners remain outside this acceptance test. No project changes were committed, pushed, or published during this work.
