# Sync changed source and tests

Read `{SHERIFF_ROOT}/runtime.md`. Audit is enabled by default; `--no-audit` skips source review. Source changes remain subject to configuration and user scope.

## Select the actual changes

Accept at most one selector: `--files`, `--staged`, `--since-commit`, or `--since-branch`. Reject unknown/conflicting flags. Validate supplied revisions using Git's revision verification and resolve them to commit hashes before forming diff commands; quote arguments and use `--` before paths.

- No selector: combine tracked changes against HEAD (`git diff HEAD --name-only -z`) and untracked, nonignored files (`git ls-files --others --exclude-standard -z`). In a repository without an initial commit, combine staged and untracked files. A clean worktree means no work; do not fall back to the previous commit.
- `--staged`: select `git diff --cached --name-only -z`. Tests execute against the actual working tree, so warn if these paths have additional unstaged edits; do not claim to have tested the index snapshot.
- `--since-commit <revision>`: compare the verified commit to the current working tree, including staged/unstaged changes. Add untracked files explicitly.
- `--since-branch <branch>`: resolve the branch, find its merge base with HEAD, then compare that base to the current working tree and add untracked files. Report an invalid/unrelated branch rather than guessing.
- `--files <path1,path2,...>`: use exactly those project-relative paths. Reject paths outside the project. This syntax cannot represent a literal comma in a filename; ask for an explicit path list in the conversation in that case.

Parse NUL-delimited Git output to preserve filenames with spaces. Filter by configured sourceDirs, exclusions, and enabled types, covering relevant JS/TS module extensions and Vue files. Keep deleted/renamed paths for affected-test review. Exclude generated, dependency, and test files from source selection, but do not ignore a renamed source's old imports.

If config is missing, run the interrogator. Discover source-to-test mappings from existing map/plan and actual imports. Record baseline and current diff per selected source; do not mutate the selection halfway through because an auditor made edits.

## Audit and synchronize

Create a unique operation ID and assign collision-free audit/sync report paths per source (include relative directory identity, not just basename). Read only reports produced in this operation.

For each selected source, run the auditor if enabled. Wait for its completion before testing that source. Record failed audits; no fixes does not necessarily mean no findings. Collect its exact modified paths.

Run `agents/sheriff-syncer.md` for each affected test group, passing current diff, source(s), test paths, enabled types, verified runner command, audit report, and ownership. Group sources sharing tests into one sequential task. Review missing assertions even if old tests pass. Do not dispatch duplicate writers to a shared test/helper/config file.

After workers settle, inspect evidence and serialize updates to TEST_MAP when present. Map tested only to actual successful selections; keep failed, skipped, and unverified cases distinct. Any authorized Git operations happen serially in the orchestrator, using reviewed paths. Return modified paths, actual test results, source findings, and remaining checks. Continue independent files when one fails, but the final outcome must expose those failures.
