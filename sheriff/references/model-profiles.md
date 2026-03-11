# Sheriff — Model Profiles

Sheriff uses three model tiers that the user can configure in `.sheriff.json` under the `models` key.

## Tiers

| Tier | Default | Used by | Reasoning |
|------|---------|---------|-----------|
| **light** | haiku | discovery, reporter | File scanning, report assembly — high volume, no deep reasoning needed |
| **medium** | sonnet | interrogator, planner | Needs reasoning to infer project setup and plan phases correctly |
| **heavy** | opus | executor | Core work — write, run, fix tests. Most important agent. |

## Configuration

Users can set each tier to `haiku`, `sonnet`, or `opus` in `.sheriff.json`:

```json
{
  "models": {
    "light": "haiku",
    "medium": "sonnet",
    "heavy": "opus"
  }
}
```

This is configured during onboarding (`/sheriff:run` or `/sheriff:configure`).

## Agent → Tier Mapping

| Agent | Tier |
|-------|------|
| sheriff-interrogator | medium |
| sheriff-discovery | light |
| sheriff-planner | medium |
| sheriff-executor | heavy |
| sheriff-reporter | light |

## Valid model values

- `haiku` — fastest, cheapest. Good for scanning and assembly tasks.
- `sonnet` — balanced. Good for planning and reasoning.
- `opus` — most capable. Best for writing and fixing code.
