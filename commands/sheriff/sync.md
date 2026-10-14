---
name: sheriff:sync
description: Audit changed source code and sync tests to match. Audits by default — use --no-audit to skip.
argument-hint: "[--no-audit] [--since-commit <sha>] [--since-branch <branch>] [--staged] [--files <path1,path2>]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - TodoWrite
---

Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.

Read and follow `{SHERIFF_ROOT}/workflows/sync.md`, preserving the user’s arguments. With no selector, synchronize current tracked and untracked worktree changes; a clean worktree has no work.
