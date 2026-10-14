# Configure

Read `{SHERIFF_ROOT}/runtime.md`, current configuration when present, and `agents/sheriff-interrogator.md`. Run that role in reconfiguration mode, preserving existing preferences except requested changes or explicit user answers. Revalidate affected runner setup.

After successful write/readback, summarize changed fields. If source scope, test types, or phase strategy changed, explain that the existing plan is unchanged and recommend a discovery-only reset followed by run. Do not erase progress as an implicit part of configuration.
