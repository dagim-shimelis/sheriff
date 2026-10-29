---
description: Release Sheriff through its PR, GitHub Release, npm staging, and verification gates
argument-hint: "[patch|minor|X.Y.Z|continue]"
---
Release Sheriff: ${@:-choose the next appropriate version, or continue an in-progress release}.

This is an explicit maintainer release request. Follow `docs/agent-release.md` and the release policy in `CONTRIBUTING.md` from start to finish. First inspect the current Git worktree, remote main, open release PRs, tags, GitHub Releases, staging runs, and npm registry state. Resume an in-progress release rather than starting a second one; if the requested version conflicts with existing state, stop and explain. For an ambiguous version or breaking change, explain the choice and ask before changing the version.

Handle the repeatable steps yourself: prepare the version PR, run checks, watch CI, merge only when repository rules allow, tag the merged main commit, publish release notes, watch npm staging, and verify the exact published package in a disposable install. Do not bypass branch protection or failed checks, force tags, run direct `npm publish`, or approve the staged package on the maintainer's behalf. Pause with a clear next action when human approval is needed, and resume when asked. Never call a staged package published.
