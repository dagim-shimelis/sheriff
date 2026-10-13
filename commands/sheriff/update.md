---
name: sheriff:update
description: Update Sheriff to the latest version from npm.
allowed-tools:
  - Read
  - Bash
---

<execution_context>
Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.

</execution_context>

<process>

## Step 1 — Check current version and available update

```bash
node {SHERIFF_TOOLS} check-update --raw
```

Parse the JSON output. If `updateAvailable` is `false`:
```
✅ Sheriff is already up to date (v{currentVersion}).
```
Stop here.

If `updateAvailable` is `true`, continue:
```
🔄 Update available: v{currentVersion} → v{latestVersion}
   Updating...
```

## Step 2 — Run the installer

Use the tool and scope recorded in runtime.md:
```bash
npx @dagim_s/sheriff@latest --tool {INSTALL_TOOL} --{INSTALL_SCOPE} --silent
```

For a local install, run from the project directory containing this installation, not a nested working directory.

## Step 3 — Verify the update

```bash
node {SHERIFF_TOOLS} current-version --raw
```

Confirm the version matches `latestVersion`:

```
✅ Sheriff updated to v{latestVersion}.
```

If the version did not change, warn:
```
⚠️ Update may not have applied correctly. Try running manually:
   npx @dagim_s/sheriff@latest --tool {INSTALL_TOOL} --{INSTALL_SCOPE}
```

</process>
