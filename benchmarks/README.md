# Sheriff benchmarks

These benchmarks measure the local state runtime. AI test generation, audits, and sync operations have a separate workload and cost; they must not share a performance baseline with these timings.

## Run and inspect

```bash
npm run benchmark
npm run --silent benchmark -- --json > /tmp/sheriff-current.json
npm run --silent benchmark:report -- /tmp/sheriff-current.json
```

JSON contains the source commit and dirty state, package version, runtime and harness SHA-256 hashes, Node/OS/CPU and runner image, timestamps, fixture sizes, warmup/sample counts, raw samples in execution order, median, and nearest-rank p95. A commit with `dirty: true` identifies the starting revision, not the exact measured source; use the runtime hash as well. An exported source directory without its own Git repository records null commit/dirty values.

For two existing checkouts, run **the same harness** against both, sequentially on the same idle machine:

```bash
node scripts/benchmark.js --root /path/to/base --json > /tmp/sheriff-base.json
node scripts/benchmark.js --root /path/to/candidate --json > /tmp/sheriff-current.json
node scripts/benchmark-report.js /tmp/sheriff-current.json /tmp/sheriff-base.json
```

The target checkout does not need to contain the benchmark script. Its runtime must support the phase parser and status CLI used by the harness. Use a fresh process per revision. The report validates raw samples against summary statistics and omits percentage comparisons when the harness, environment, sampling settings, or scenario set differs. A negative percentage means faster. It never fails solely because performance is slower; invalid results and correctness assertions do fail.

## Method

- Synthetic canonical plans with 3, 100, and 1,000 pending sub-phases; one parent phase, no result summaries or legacy status tables.
- Three warmups followed by 15 measured samples per scenario. Assertions run outside the measured interval.
- `parse plan` measures the in-process parser after module loading. `get-status CLI` includes a fresh Node process, module loading, file reads, parsing, and output.
- Fixture creation and metadata collection are outside the measured interval. Every run uses disposable state and removes it on success or an ordinary exception; it never writes the target project's `.sheriff/`.
- Median is the headline metric. With 15 samples, nearest-rank p95 is the maximum observation and is not a stable tail-latency estimate.
- Runtime hashing covers `package.json` and `sheriff/bin/`; harness hashing covers the benchmark script. Increment `benchmark.version` when the workload or measurement method changes. Any script edit also changes the harness hash.

Measurements can vary with machine load, CPU scheduling, and runner image updates. Repeat a suspected regression, alternate revision order, and retain the raw samples before setting a regression threshold. Local results are not a hosted CI baseline.

## CI and history

[Runtime benchmarks](../.github/workflows/benchmark.yml) runs on PRs, pushes to `main`, and manual dispatch. It pins Node 22.18.0 and Ubuntu 24.04. On PRs, it measures base then head on the same runner using the head's harness; no test jobs run concurrently within that benchmark job. Main/manual runs produce a current snapshot. Runtime-image metadata is retained because a pinned OS label does not freeze the hosted image or hardware.

Each run adds a Markdown table to the Actions job summary and uploads JSON plus the summary as a 30-day artifact. Fork PRs use the ordinary `pull_request` event, read-only repository permissions, and no project secrets. There are no automatic PR comments, commits, or performance failure thresholds.

Artifacts are temporary. Keep selected snapshots in Git for durable history:

- `snapshots/`: explicitly labeled local/development measurements. The initial snapshot is an uncommitted development measurement, not a published-release benchmark.
- `releases/`: clean, verified release-source measurements. Follow the [release snapshot procedure](releases/README.md).

Refresh the short table in the root README when accepting a new release snapshot, including its environment, date, source identity, and JSON link. Do not update it automatically on every CI run. For release-to-release comparisons, rerun both revisions with the same current harness and environment rather than comparing incompatible old JSON files.

## AI workflow measurements

The opt-in `npm run test:live:codex` and `npm run test:live:claude` harnesses consume model usage and remain outside this workflow. Keep their timings in separately labeled reports with the fixture/revision, host and model versions, token usage, successful outcomes, and number of repeated runs. Preserve model/settings information explicitly when the host does not emit it. A single acceptance session demonstrates behavior, not a repeatable speed benchmark.
