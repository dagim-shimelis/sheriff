# Sheriff runtime

Tool: {INSTALL_TOOL}
Install scope: {INSTALL_SCOPE}

Set `{SHERIFF_ROOT}` to the directory containing this file, resolved from the file you actually loaded. Set `{SHERIFF_TOOLS}` to its `bin/sheriff-tools.js`, quoted for the active shell. Run all project commands with the user's project as the working directory; `.sheriff/` always belongs to that project.

Read only the command, workflow, and role files needed for the requested operation. Stage blocks in workflows are instructions, not literal tool calls. For each stage, read `agents/<stage-role>.md` under this runtime root and apply its instructions with the stage inputs.

## Execution policy

- **Claude Code:** use the installed Sheriff subagents through the available delegation tool. Pass the runtime root, quoted tools path, project directory, and stage inputs. Use configured models when supported. Without delegation, execute each role sequentially in the current session.
- **Codex:** execute each role sequentially in the current session using the current model. Do not call Claude's `Task` tool or request Claude model IDs. Skip model and parallelism questions during onboarding; use `inherit` for new model settings. Preserve existing shared config values, but ignore their model/parallelism preferences for this runtime. No Claude hooks or statusline are installed. Write a handoff when stopping with unfinished work; resume using existing state and handoffs.

In both tools, retain wave ordering, audit-before-test ordering, lock handling, retries, and result checks even when stages run sequentially. A role's frontmatter describes its purpose; it does not declare tools available in the current host.

## Workspace safety

Follow the user's repository instructions and authorization for edits, package installation, commits, and deletion. Skill invocation does not itself authorize commits or destructive resets. The existing git helpers stage all changes or reset/clean the repository: do not use them in a dirty or shared worktree. Preserve unrelated edits and use explicitly scoped git operations when authorized. If commits are not authorized, retain passing work and report that checkpointing was skipped instead of treating missing commits as test failures.

Do not run two Sheriff sessions against the same project's state simultaneously. Both integrations share `.sheriff/`; finish or stop one session before continuing in the other.
