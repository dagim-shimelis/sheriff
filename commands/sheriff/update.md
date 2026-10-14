---
name: sheriff:update
description: Update Sheriff to the latest version from npm.
allowed-tools:
  - Read
  - Bash
---

Read `{SHERIFF_RUNTIME}` relative to this command file before proceeding.
Use its runtime paths, tool integration, and install scope.

Run `check-update --raw` and parse its JSON, including exit 1 for an available update. If the registry check reports an error, say the latest version could not be verified; do not report "already up to date". If no newer version is available, report the current version and stop.

When an update is available, use the tool and scope recorded in runtime.md:

```bash
npx @dagim_s/sheriff@latest --tool {INSTALL_TOOL} --{INSTALL_SCOPE} --silent
```

For local installations, execute in the project directory containing this installation, not a nested working directory. Preserve user overrides for installation paths. Check installer exit status before reading `current-version --raw` again; verify it matches the expected published version. Report failures instead of claiming success. Project `.sheriff/` state and tests are separate from the installed runtime.
