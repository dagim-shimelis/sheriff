---
name: sheriff
description: Run or resume Sheriff's test coverage workflow for JavaScript and TypeScript projects, audit source code, or synchronize tests after code changes.
---

Read [runtime.md](runtime.md) first. Resolve all skill resources relative to this SKILL.md, and run commands in the user's project.

Route the user's requested operation to the matching command, preserving any flags:

| Request | Instructions |
| --- | --- |
| Run or resume coverage (`$sheriff run`) | [run](commands/run.md) |
| Sync tests after changes (`$sheriff sync`) | [sync](commands/sync.md) |
| Audit source (`$sheriff audit`) | [audit](commands/audit.md) |
| Configure Sheriff | [configure](commands/configure.md) |
| Show progress | [status](commands/status.md) |
| Reset Sheriff state | [reset](commands/reset.md) |
| Update this installation | [update](commands/update.md) |
| Help or no operation specified | [help](commands/help.md) |

Read the selected command, its referenced workflow, and role files when each stage needs them. Execute roles sequentially with the current model as described in runtime.md. State checks and result files determine progress; do not claim that generated tests passed without running them.
