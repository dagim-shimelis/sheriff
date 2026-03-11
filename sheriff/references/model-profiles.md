# Sheriff — Model Profiles

These are the default model assignments for each Sheriff agent.

"inherit" means: use whatever model the user has configured for the current tier.
This avoids hardcoded model IDs that may be blocked by org policies.

## Agent → Model Mapping

| Agent | Model | Reasoning |
|-------|-------|-----------|
| sheriff-interrogator | inherit (Sonnet) | Needs reasoning to infer project setup from partial signals |
| sheriff-discovery | claude-haiku-4-5-20251001 | File scanning — high volume, cheap, no deep reasoning needed |
| sheriff-planner | inherit (Sonnet) | Needs reasoning to phase and prioritize correctly |
| sheriff-executor | inherit (Sonnet) | Core work — write, run, fix tests. Most important agent. |
| sheriff-reporter | claude-haiku-4-5-20251001 | Assembling results, not reasoning. Cheap. |

## "inherit" resolution

When an agent model is "inherit", Claude Code uses the user's configured default model.
For most users this will be Sonnet. For users on Opus plans it may be Opus.

This is intentional — executor quality scales with whatever the user has available.
