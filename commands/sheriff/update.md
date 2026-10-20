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

When an update is available, use the tool and scope recorded in runtime.md. Rerunning the installer alone reuses an existing local dependency; update the dependency explicitly first. For a **local** installation, run these steps from the project directory containing its package.json, checking each exit status before continuing:

```bash
npm install --save-dev @dagim_codes/sheriff@latest
node node_modules/@dagim_codes/sheriff/bin/install.js --tool {INSTALL_TOOL} --local --silent
```

Keep an existing production dependency in `dependencies` by using `--save-prod` instead of `--save-dev`. The package manager updates package.json and its lockfile; the installer refreshes integration files. Both hosts share the project dependency, so this updates both hosts' runtime version. Refresh the other host's integration too if Sheriff is already installed for it. If the project uses a different package manager, use its equivalent dependency-update command and preserve its lockfile.

For a **global** installation, run:

```bash
npx @dagim_codes/sheriff@latest --tool {INSTALL_TOOL} --global --silent
```

Preserve user overrides for installation paths. Check installer exit status before reading `current-version --raw` again; verify it matches the expected published version. Report failures instead of claiming success. Project `.sheriff/` state and tests are separate from the installed runtime.
