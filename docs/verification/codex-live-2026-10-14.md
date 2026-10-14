# Codex live acceptance test — 2026-10-14

Seven real Codex CLI sessions completed successfully against a disposable JavaScript project using the packed Sheriff npm package. Fourteen checks were verified across the automated run and follow-up evidence review. No Sheriff product defect was exposed by this fixture.

## Environment

- Sheriff runtime: commit `9ae0f51`, package version `0.1.5`; no product-code changes during this test.
- Host: Codex CLI `0.162.1`, authenticated through ChatGPT; default model selection, user configuration disabled, workspace-write sandbox, fresh ephemeral sessions.
- Runner: Node `22.18.0`, `node:test`, no third-party dependencies.
- Fixture: three source modules, one original test, a deliberately incorrect percentage divisor, and an unrelated uncommitted personal note.
- Seven model sessions took 644 seconds in total, excluding setup and independent checks.
- Harness: [tests/live/run.js](../../tests/live/run.js), invoked with `npm run test:live:codex`. This consumes normal model usage and is excluded from the ordinary unit suite and CI. The harness was subsequently shared with the Claude acceptance test.

## Results

| Scenario | Observed result |
| --- | --- |
| Package installation | Packed the checkout and installed its executable offline with npm into a temporary project; Codex skill present. |
| Discovery/help | `$sheriff help` resolved the local skill, read installed runtime/help instructions, and executed the installed version helper. |
| Onboarding/run | Created valid configuration, source/test map, phases, results, and summaries. Generated 12 new tests while preserving the original test. |
| Seeded failure | Full suite: 13 tests, 10 pass, 3 fail. All three failures exposed the deliberately incorrect percentage divisor. Source files remained unchanged under `flag` policy. |
| Independent failure oracle | Temporarily correcting only the divisor made all 13 tests pass; the harness then restored the seeded bug. |
| Audit | Reported the same percentage bug without source changes. |
| Intentional pause | Claimed a reopened sub-phase, saved a handoff keyed by sub-phase ID, released it to pending, and stopped without manufacturing a terminal result. |
| Fresh-session resume | Read the handoff, added a Unicode-whitespace regression, ran the selection successfully, and preserved other terminal result files rather than retrying the recorded failure. |
| Sync | After the harness simulated a developer fix and an optional separator feature, Codex identified missing assertions despite existing tests passing. Final full suite: 19 pass, 0 fail, 0 skip. |
| Independent mutation oracle | Temporarily removing separator support produced 3 failures (16 pass); restoring the implementation restored the verified source state. |
| Status | Distinguished historical phase failure from the latest passing sync evidence. Sheriff state hashes were unchanged. |
| Preservation/uninstall | Unrelated note and original test survived; no model commits or staging. Installed skill matched an independent installation from the same tarball before status. Uninstall preserved generated tests and Sheriff state. |

The 19 passing tests are fixture tests, not measured coverage or evidence for arbitrary frameworks. The ordinary Sheriff suite also passed all 35 tests.

## Harness corrections

The raw automated run exited 1 with 11 checks passing and two false negatives:

1. It expected a shell read of `SKILL.md`. Codex injects explicitly invoked skill contents; reading the installed runtime/help and executing its helper demonstrated discovery. The assertion now checks that behavior.
2. It required the original test file's entire hash to remain unchanged. That rejected valid appended tests. The assertion now requires the original test content to survive while permitting additions.

Both corrected assertions were rechecked against retained transcripts and files. A separate status-state check also passed. The seven paid model sessions were not repeated. The raw report remains unchanged; the reviewed report explicitly records the corrections and its 14 verified checks. The updated harness additionally checks that audit preserves tests, records baseline hashes, and terminates the Codex process group on timeout on POSIX systems; timeout behavior was not exercised in these successful sessions.

An earlier setup attempt used an invalid Node directory-selection argument. The harness baseline caught it, the initial help process was stopped, and the runner was corrected before this complete run. Baseline failure now prevents starting model sessions.

## Retained local evidence

Evidence directory on the test machine:

```text
/var/folders/qd/xrv7nd3j45zg4zhsqhn7xm5h0000gn/T/sheriff-codex-live-pjotrF/
```

- `reviewed-report.json`: reviewed checks, original exit status, corrections, session timings, package integrity, and usage.
- `report.json`: original unmodified automated results, including the two false negatives.
- `01-help` through `07-status`: prompts, JSONL events, stderr, and final responses.
- `baseline.tap`, `after-run.tap`, `discount-fixed-oracle.tap`, `after-sync.tap`, `separator-mutation.tap`: independent test-runner evidence.
- `project/`: final source, generated tests, reports, and preserved personal note; integration uninstalled by the final check.

This is a temporary evidence directory and may eventually be removed by the operating system. Rerunning the harness creates and prints a new retained directory.

## Limits

This verifies one JavaScript/node:test fixture through non-interactive Codex sessions. It does not verify interactive Codex UI, Claude Code, Windows, browser/E2E runners, other frameworks, model variants, hard-kill/crash recovery, or repeated-run reliability. Pause/resume was a controlled handoff drill. Audit and sync were exercised separately; the combined `run --audit` path was not exercised. Nothing was published, pushed, or committed as part of this test work.
