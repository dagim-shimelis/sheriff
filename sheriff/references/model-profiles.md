# Model preferences

Claude Code may use the configured `models.light`, `models.medium`, and `models.heavy` values when the available delegation tool supports them. These are preferences, not a requirement to invoke unavailable models.

| Tier | Roles |
| --- | --- |
| light | Discovery, reporter |
| medium | Interrogator, planner |
| heavy | Auditor, executor, syncer |

The existing Claude defaults are haiku/sonnet/opus. Preserve user choices; inherit if unavailable. Codex runs sequentially with the current model and uses `inherit` for new configuration. Switching hosts must not overwrite shared model preferences. No tier guarantees quality, cost, or speed for a particular project.
