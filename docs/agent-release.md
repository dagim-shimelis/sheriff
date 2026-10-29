# Agent-assisted releases (maintainers)

Ask a coding agent in this repository: **“Release a patch version”**, **“Release 0.3.0”**, or **“Continue the release PR”**. The agent follows this runbook and [the release policy](../CONTRIBUTING.md#compatibility-and-releases). This is a maintainer workflow, not a Sheriff command installed into user projects. It uses the existing GitHub Actions staging workflow; it does not add another publisher.

A release request authorizes the agent to prepare and push a release branch, open its PR, and, **after that PR is merged**, tag the merged commit and publish a GitHub Release. It does **not** authorize bypassing branch protection, merging without the required checks/review, approving the staged npm package on the maintainer's behalf, or publishing directly with `npm publish`. If any gate requires human action, report the exact action and resume from the recorded state afterward. Never claim completion before the registry version and installation are verified.

## 1. Establish state and version

- Check `git status --short --branch`, `git fetch origin --tags`, the latest published npm version (`npm view @dagim_codes/sheriff version`), tags, open release PRs, and the version in both manifests. Preserve unrelated work. If the checkout is dirty, stale, or a release is already in flight, don't overwrite it; resume the existing release or ask how to proceed.
- Base a new release branch on current `origin/main`, not a previous release branch. Compare commits since the last published release tag and inspect user-visible changes. Suggest a patch for compatible fixes, a minor for new features or breaking `0.x` changes, and explain migrations. Confirm an ambiguous or explicitly breaking version choice with the maintainer. Do not reuse an existing tag or npm version.
- Keep the release PR limited to the version bump and release-specific documentation, if needed. Merged feature PRs provide the implementation and tests. Do not add the version bump to an unrelated PR.

## 2. Prepare and verify the release PR

1. Create `chore/release-X.Y.Z` from current `origin/main`. Run `npm version X.Y.Z --no-git-tag-version` to update `package.json` and `package-lock.json` together. Do not create a tag yet.
2. Prepare user-facing release notes from the actual changes since the last release: fixes/features, migration instructions (or “None”), and any verification limits. Do not include secrets, private transcripts, or claims about checks not run.
3. Run `npm ci --ignore-scripts`, `npm test`, `npm pack --dry-run`, and `git diff --check`. Run `npm run test:package-managers` where the managers are available; CI covers its pinned cross-platform matrix. For integration changes, request authorization before opt-in live host checks, which consume model usage; report any checks not run. Stop on failed checks.
4. Review the complete diff, commit only release files, push the branch, and open a PR with notes and verification using the repository PR template. Link it to the maintainer. Wait for required checks to finish; report failures and fix them rather than bypassing protection. A passing local run does not replace CI.
5. Merge only once all repository requirements and any requested review are satisfied. If the platform or policy requires the maintainer to merge, pause with the PR link. After a squash merge, fetch `origin/main` again: the PR branch commit is **not** the release commit.

## 3. Tag and stage npm

- Verify the merged `origin/main` manifest and lockfile both contain `X.Y.Z`, that the release PR actually merged, the working tree has no unrelated changes, and `vX.Y.Z` does not already point elsewhere. Tag the **merged main commit** (`git tag vX.Y.Z <merged-main-sha>` and `git push origin vX.Y.Z`). Do not move or force-push an existing tag.
- Publish GitHub Release notes for that exact tag (for example, `gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --notes-file <reviewed-notes-file>`). Publishing the GitHub Release—not pushing the tag alone—triggers `.github/workflows/npm-publish.yml`.
- Watch the “Stage npm release” workflow. It checks the tag against `package.json` and runs `npm stage publish` using `NPM_TOKEN`. If it fails, diagnose and report; do not switch to direct `npm publish` or silently create a second tag/release.
- The maintainer must inspect and approve the staged package in npm separately. Pause and ask for that approval. Never present a staged package as published.

## 4. Verify and hand off

After approval, check `npm view @dagim_codes/sheriff@X.Y.Z version` and install that exact version in a disposable temporary directory. Confirm its installed `package.json` version and `bin/install.js` exist; do not run the interactive installer against a real project or home. If the registry hasn't propagated, retry briefly and report the pending state instead of claiming success. Summarize the PR, merged commit/tag, GitHub Release, staging run, npm version, verification results, and any remaining action.

At any interruption, first inspect GitHub and npm state before repeating a step. A PR, tag, GitHub Release, staged package, and published npm version are distinct states; never recreate an existing resource blindly. Do not store release tokens in the repository or print their values.
