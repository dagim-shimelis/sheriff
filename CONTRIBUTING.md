# Contributing to Sheriff

Small, focused contributions are welcome. Read the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Before starting

- Search existing [issues](https://github.com/dagim-shimelis/sheriff/issues) and [pull requests](https://github.com/dagim-shimelis/sheriff/pulls) before opening a duplicate.
- Discuss substantial features or changes to installation, integrations, or saved state in an issue before implementing them. An issue is optional for small fixes and documentation changes.
- Use the bug-report template for reproducible defects. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

Issues track proposed and accepted work; an open issue alone does not mean a feature has been accepted. Look for `good first issue` or `help wanted`, and confirm the scope before starting a large change. Maintenance happens as time allows, with no guaranteed response or release schedule.

## Local setup

Fork the repository if you do not have write access, then clone your fork. Use Node.js 22 or 24 for development and npm. The package supports Node.js 18 and newer; CI checks Node.js 18, 22, and 24 on Linux and macOS.

From the repository root:

```bash
npm ci --ignore-scripts
npm test
npm pack --dry-run
```

`npm test` and `npm pack` rebuild the standalone hooks and per-tool runtime bundles automatically. Edit shared instructions in `commands/sheriff/`, `workflows/`, `agents/`, and `sheriff/`; the build copies them into `dist/claude/` and `dist/codex/`. Do not edit generated bundles directly.

Tests use temporary homes and projects. Local setup can invoke a package manager and modify the target project’s dependency declaration and lockfile; use disposable fixtures for installer checks. Package-manager selection and command tests are separate from live npm, pnpm, Yarn, and Bun compatibility checks. Do not test installation or uninstall against a real home directory or a project containing work you need to keep.

Run `npm run test:package-managers` with npm, pnpm, Yarn, and Bun on `PATH` for real installation tests. Set `SHERIFF_TEST_MANAGER` to `npm`, `pnpm`, `yarn`, or `bun` to test just one installed manager. Missing executables fail the suite. Yarn Classic and modern Yarn must be run separately with the desired version on `PATH`.

The suite serves the packed checkout from a temporary local registry, then verifies automatic dependency installation, installed CLI execution, Claude/Codex resources, hooks, and restoration after deleting `node_modules`. It covers standalone projects, workspace roots, and workspace children, and verifies modern Yarn Plug’n’Play rejection. CI runs pinned npm, pnpm, Yarn Classic, Yarn modern, and Bun versions on Linux, macOS, and Windows. These tests do not invoke AI hosts or the public Sheriff release.

## Branches and pull requests

Use one short-lived branch and one PR per logical change, including documentation changes. Related implementation, regression tests, and documentation can share a PR with several commits.

Start from the latest upstream `main`. For example, after updating your local `main`:

```bash
git switch -c fix/uninstall-preservation
```

Use names such as `feat/package-backed-install`, `fix/uninstall-preservation`, or `docs/contributing-guide`. There is no permanent `develop` branch. Maintenance branches are only needed when multiple released versions are actively supported.

Before opening a PR:

1. Keep the diff focused and preserve unrelated files, settings, tests, and `.sheriff/` state.
2. Add a regression test for a behavior fix and update documentation affected by the change.
3. Run `npm test`, `npm pack --dry-run`, and `git diff --check`. If a check cannot run, explain why.
4. Read the complete diff, including generated files, and remove accidental changes.
5. Use a descriptive title such as `fix: preserve unrelated files during uninstall`. Explain the problem, the solution, and how you tested it using the PR template.

`main` requires a PR, an up-to-date branch, all six package test jobs, and resolved review conversations. These rules also apply to administrators. No approving review is required while the project has one maintainer; the maintainer still reads the full diff before merging their own PR.

Squash merge after the checks pass, then delete the working branch. GitHub automatically deletes merged branches in this repository. Keep the PR title suitable for the resulting commit on `main`.

## Additional verification

Run `npm run benchmark` when changing runtime performance. The benchmark workflow reports measurements separately from the required package tests; compare like-for-like runs and do not present runtime measurements as AI workflow speed.

For changes to host integrations, use disposable projects and the appropriate installed, authenticated CLI:

```bash
npm run test:live:codex
npm run test:live:claude
```

These opt-in checks consume model usage and are separate from `npm test` and CI. Report blocked host access or checks you did not run. Automated package tests alone do not establish live host, Windows, browser, or external-service compatibility.

## Compatibility and releases

Sheriff is currently in `0.x` development. Until `1.0`, minor releases may include breaking changes; patch releases are intended for compatible fixes. Describe breaking changes and migration steps explicitly. Only the latest released version receives fixes; older release lines are not maintained.

Merging a PR does not publish a package. A release may contain several merged PRs:

1. Prepare a release PR that updates `package.json` and `package-lock.json` together and describes user-visible changes and migrations.
2. Complete the checks and relevant live host verification, then merge the PR.
3. Tag the intended commit on `main` with the matching version, preferably `vX.Y.Z`, and publish GitHub release notes for that tag.
4. The [release workflow](.github/workflows/npm-publish.yml) verifies the tag against `package.json` and stages the npm package. The maintainer must inspect and approve the staged package separately.
5. Verify the published package version and installation before announcing availability.

Maintainers can ask an agent to carry out the repeatable steps using the [agent-assisted release runbook](docs/agent-release.md). PR gates and staged npm approval still require their normal checks and maintainer action.

Never include tokens, credentials, private project content, or sensitive host transcripts in issues, PRs, or release notes.
