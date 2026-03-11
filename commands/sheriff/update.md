---
name: sheriff:update
description: Update Sheriff to the latest version from npm.
allowed-tools:
  - Read
  - Bash
---

<execution_context>
Determine the Sheriff tools path:
- Global install: ~/.claude/sheriff/bin/sheriff-tools.js
- Local install: .claude/sheriff/bin/sheriff-tools.js

Check which exists and use that path as {SHERIFF_TOOLS}.

Determine the install mode:
- If {SHERIFF_TOOLS} starts with ~/.claude → global install
- If {SHERIFF_TOOLS} starts with .claude → local install
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

For global install:
```bash
npx @dagim_s/sheriff@latest --global --silent
```

For local install:
```bash
npx @dagim_s/sheriff@latest --local --silent
```

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
   npx @dagim_s/sheriff@latest --global
```

</process>
