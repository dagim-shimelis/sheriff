# Run or resume

Read `{SHERIFF_ROOT}/runtime.md`. All paths below belong to the chosen project. Read each stage role only when needed; pass concrete inputs and file ownership. A stage is an instruction, not a literal host API call.

## 1. Bootstrap

Run `init-project`, then `config-exists`. If configuration is missing, run the interrogator. Otherwise run `check-config-version --raw`; exit 1 with `needsMigration: true` means migrate only missing settings. Other errors need diagnosis. Read and validate configuration before any discovery or execution, including a targeted `--phase` run.

`check-update --raw` is optional and non-blocking. Parse its JSON even when it exits 1 for an available update. A registry error is not proof the installation is current. Do not install updates as part of a test run.

Validate flags: `--phase` is a positive integer; `--audit` and `--no-audit` conflict; `--phase` and `--from-scratch` conflict. Reject unsupported flags. `--audit` enables source review, `--no-audit` skips it. Otherwise reuse user intent or ask once before execution. Source edits still follow runtime authorization/config policy.

For `--from-scratch`, follow the discovery-only reset procedure before discovery, preserving existing tests and configuration. Refuse to reset while another Sheriff worker is active. Old results/handoffs must be archived with the old plan so reused numeric IDs cannot pick up unrelated work.

## 2. Discover and plan

If TEST_MAP.md is missing, execute `agents/sheriff-discovery.md`. If PHASES.md is missing, execute `agents/sheriff-planner.md`. Verify both outputs and runtime `get-status --raw`; mere file existence is insufficient. A targeted phase requires an existing plan and an actual phase with that ID. Do not silently create a different plan for a missing requested phase.

Read canonical sub-phase metadata, not only the aggregate Phase Progress row. On ordinary resume, select pending sub-phases, prioritizing their handoffs within dependency order. Keep pass/review/fail terminal; summarize them without repeatedly executing them. An explicit `--phase N` retry reopens only that phase's review/fail items after confirming no owner is running; preserve passing items and existing test files. Use `release-subphase <id> --force` only after confirming the previous worker stopped; the runtime archives its prior result and phase summary before resetting status. Archive any obsolete handoff separately, preserving partial test work and relevant notes. Do not report stale evidence as new work.

## 3. Execute pending work

For each phase, process ascending waves; dispatch only when all `depends_on` IDs have passed. A failed/review dependency blocks its dependents: report them as pending with the reason. Do not force them through or loop waiting for an unchanged dependency. Serialize sub-phases sharing writable files or external fixtures. In Codex, run sequentially; in Claude Code, use authorized delegation and at most configured parallelism.

For each eligible sub-phase:

1. Inspect `check-stale-locks --raw` and `check-release <id>` if already claimed. Confirm any previous owner has stopped; do not reclaim by age alone.
2. Claim with `claim-subphase <id> <agentId> --raw`; a failed claim means do not edit its files. Use safe unique agent IDs and the same sub-phase ID for handoffs.
3. Resolve the canonical source/test paths from plan, actual imports, existing suites, and handoff. Read existing tests before editing. If multiple sub-phases resolve to one test file, serialize them and update the plan's mapping before dispatch.
4. If auditing, run `agents/sheriff-auditor.md` for this source and wait for its report. Pass findings and authorized modified paths to the executor. An audit failure is recorded as review; do not silently describe that source as audited.
5. Run `agents/sheriff-executor.md` with ID, runtime root, project root, source, test type, test paths, verified test command, audit report, handoff, and explicit ownership. Worker writes result/handoff; orchestrator handles shared mutations.
6. Verify the result belongs to this ID/source/current attempt and contains execution evidence. If it is missing, retry a crashed worker once only after it stops; then write a review report with the error. A pause is different: retain a handoff, release the stopped worker's claim with `--force`, leave pending, and end this invocation rather than immediately redispatching it.
7. Update TEST_MAP with `update-testmap <source> <unit|e2e> <tested|review|failed> --raw`, based on the entire assigned selection. Only a real pass maps to tested. If the mapping is missing or state writes fail, stop dependent state updates and explain the mismatch.
8. Mark terminal state with `mark-complete <id> <pass|review|fail> --raw`. Passing requires validated result evidence; a failed test suite remains fail even if a file exists. Do not infer success from commits.

After each wave, wait for every dispatched worker to settle and reconcile claims/results. Perform any explicitly authorized commits serially with reviewed file scope. Never commit while workers are editing or roll back their work on a commit error.

## 4. Report and continue

For each attempted phase, run `assemble-results <phaseNum> --raw`, inspect missing IDs, then execute `agents/sheriff-reporter.md`. Missing/failed evidence must remain visible. Do not manually force a phase to pass if report generation fails.

Continue to later independent pending phases unless `--phase N` scoped this invocation. Stop when no eligible pending work remains, the user pauses, or a prerequisite needs input. Report passes, failures, review items, pending/blocked IDs, paths, and remaining live checks. "All planned sub-phases passed" does not mean complete measured coverage. Do not rediscover/replan automatically to chase a numerical coverage claim.
