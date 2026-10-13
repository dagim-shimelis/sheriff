# Sheriff — Configure Workflow

Read `{SHERIFF_ROOT}/runtime.md` for how to execute stage roles. Parallelism and model preferences below apply only when supported by that runtime.

Re-runs the interrogator regardless of whether .sheriff.json already exists.
Used when the user wants to update their project config.

## Steps

1. Print the Sheriff banner:

```bash
node {SHERIFF_TOOLS} print-banner
```

2. Read current .sheriff.json if it exists — show the user what's currently set.

3. Spawn the interrogator agent with a `reconfigure: true` flag so it knows
   to ask about all settings, not just missing ones:

```
Stage role: sheriff-interrogator
Model preference: inherit
Instructions:
Re-run onboarding for an existing Sheriff project.
    The user wants to update their configuration.

    Current config:
    {currentConfigJSON}

    Show the user what is currently set, then ask if they want to change each setting.
    Write the updated config to .sheriff/.sheriff.json when done.
    Make sure to set configVersion to the current version (get from check-config-version --raw → currentVersion).

    Sheriff tools: {SHERIFF_TOOLS}
```

4. After interrogator completes, print:

```
✅ Configuration updated.

Note: if you change phaseStrategy or sourceDirs, you should reset and re-run
discovery to regenerate TEST_MAP.md:

  /sheriff:reset --discovery-only
  /sheriff:run
```
