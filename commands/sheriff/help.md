---
name: sheriff:help
description: Show Sheriff usage guide — commands, agents, configuration, tips, and troubleshooting for new and returning users.
allowed-tools:
  - Read
  - Bash
---

Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.

Read `current-version --raw` and show a concise guide using this host's invocation syntax (`/sheriff:<operation>` in Claude Code; `$sheriff <operation>` in Codex).

| Operation | Purpose |
| --- | --- |
| run [--audit\|--no-audit] | Discover, plan, execute, and report; resume pending work |
| run --phase N | Run pending work and explicitly retry review/fail items in one existing phase |
| run --from-scratch | Archive old discovery/plan/evidence and build a new plan; keep tests/config |
| sync [--no-audit] | Inspect current worktree changes and update affected tests |
| sync --files paths | Explicit comma-separated source paths |
| sync --staged | Select staged paths; test their working-tree content |
| sync --since-commit ref | Compare a commit to the working tree |
| sync --since-branch branch | Compare merge base to the working tree |
| audit [--files paths\|--phase N] | Review source and synchronize tests for authorized fixes |
| configure | Change requested project settings |
| status | Read current progress and reported execution evidence |
| reset [--discovery-only\|--full] | Archive/rebuild discovery or remove all Sheriff state |
| update | Update this tool installation in its existing scope |

Explain that `.sheriff/` is shared project state, test files live in the project's normal test locations, Codex executes roles sequentially, and Claude delegation depends on host permissions. Commits and source fixes respect user authorization/configuration. Failing regressions remain visible; skipped or unexecuted tests do not count as a successful run. Test inventory is not measured line/branch coverage.

Installation: `npx @dagim_s/sheriff --tool {INSTALL_TOOL} --{INSTALL_SCOPE}`.
Uninstall this integration: `npx @dagim_s/sheriff --tool {INSTALL_TOOL} --{INSTALL_SCOPE} --uninstall`.

Do not promise autonomous perfect coverage, universal framework support, or recovery of unsaved work.
