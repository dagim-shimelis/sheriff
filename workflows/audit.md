# Audit source

Read `{SHERIFF_ROOT}/runtime.md`. Review concrete defects; apply only authorized fixes. Keep reporting and test evidence distinct.

Accept either `--files <path1,path2,...>` or `--phase <positive integer>`, not both. With no selector use source paths from the current TEST_MAP or PHASES plan; if neither exists, configure and discover scoped sources first. Reject paths outside the project and unsupported flags. If the scope is empty, report it and stop.

Create a unique operation ID and collision-free report paths for each source. Run `agents/sheriff-auditor.md`, passing current config, relevant source/callers/tests, explicit writable scope, and report path. Use sequential execution or authorized disjoint delegation per runtime policy. Shared dependencies or test files require serialization.

Collect only this operation's reports. Distinguish clean, fixed-and-verified, unresolved, and failed audits. Never interpret "no files modified" as "all files clean". Report findings even when no source fixes are permitted.

For exact source paths changed by an auditor, run the sync workflow with `--files <changed paths> --no-audit`, preserving the user's enabled test types. Pass audit findings and before/after evidence to syncers. This prevents recursive audit loops and ensures tests exercise the authorized corrections. If an assigned fix changes additional callers, include those actual modified paths in the sync scope.

Report source findings, fixes applied, test commands/results, unresolved files, and report paths. Do not claim a clean or fully verified audit when reports are missing, tests were not executed, or findings remain.
