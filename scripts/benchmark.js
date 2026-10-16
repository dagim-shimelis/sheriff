#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { spawnSync } = require('node:child_process');

const samples = 15;
const warmups = 3;

function summarize(timings) {
  assert.ok(timings.length > 0 && timings.every(value => Number.isFinite(value) && value > 0), 'Invalid timing samples');
  const sorted = [...timings].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}

function measure(operation, validate) {
  for (let i = 0; i < warmups; i++) validate(operation());
  const timings = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    const result = operation();
    timings.push(performance.now() - start);
    validate(result);
  }
  return { samplesMs: timings, ...summarize(timings) };
}

function runtimeHash(root) {
  const hash = createHash('sha256');
  function add(relative) {
    const file = path.join(root, relative);
    if (fs.statSync(file).isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) add(`${relative}/${name}`);
    } else {
      hash.update(relative).update('\0').update(fs.readFileSync(file)).update('\0');
    }
  }
  add('package.json');
  add('sheriff/bin');
  return hash.digest('hex');
}

function sourceMetadata(root) {
  const git = args => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000 });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const top = git(['rev-parse', '--show-toplevel']);
  const ownRepo = top && fs.realpathSync(top) === fs.realpathSync(root);
  const status = ownRepo ? git(['status', '--porcelain', '--untracked-files=normal']) : null;
  return {
    commit: ownRepo ? git(['rev-parse', 'HEAD']) : null,
    dirty: status === null ? null : status.length > 0,
    packageVersion: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
    runtimeSha256: runtimeHash(root),
  };
}

function runBenchmark(root) {
  const { parseSubphases } = require(path.join(root, 'sheriff/bin/lib/phases'));
  const state = require(path.join(root, 'sheriff/bin/lib/state'));
  const cli = path.join(root, 'sheriff/bin/sheriff-tools.js');
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    source: sourceMetadata(root),
    benchmark: { version: 1, sha256: createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'), samples, warmups },
    environment: {
      node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || 'unknown', osRelease: os.release(),
      runnerImage: process.env.ImageOS || null, runnerImageVersion: process.env.ImageVersion || null,
    },
    results: [],
  };
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-benchmark-'));
  try {
    state.ensureSheriffDir(cwd);
    for (const count of [3, 100, 1000]) {
      const plan = '# Plan\n\n## Phase 1 — Coverage\n\n' + Array.from({ length: count }, (_, i) =>
        `### 1.${i + 1} — Test module ${i + 1}\n\`\`\`\nstatus: pending\nwave: 1\ndepends_on: []\nfile: tests/module-${i + 1}.test.js\nsource: src/module-${i + 1}.js\ntype: new\ntest_type: unit\nlock: —\nlock_time: —\n\`\`\`\n\n- [ ] tests behavior\n`
      ).join('\n');
      state.writeFile(state.PHASES_FILE, plan, cwd);
      report.results.push({ operation: 'parse plan', subphases: count, unit: 'ms', ...measure(() => parseSubphases(plan), parsed => {
        assert.equal(parsed.length, count);
        assert.equal(parsed.at(-1).id, `1.${count}`);
        assert.ok(parsed.every(phase => phase.status === 'pending'));
      }) });
      report.results.push({ operation: 'get-status CLI', subphases: count, unit: 'ms', ...measure(() =>
        spawnSync(process.execPath, [cli, 'get-status', '--raw'], { cwd, encoding: 'utf8', timeout: 10000 }), result => {
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr);
        const status = JSON.parse(result.stdout);
        assert.equal(status.total, count);
        assert.equal(status.pending, count);
      }) });
    }
    assert.equal(runtimeHash(root), report.source.runtimeSha256, 'Runtime changed during benchmark');
    return { ...report, finishedAt: new Date().toISOString() };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    let root = path.resolve(__dirname, '..');
    let json = false;
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--json' && !json) json = true;
      else if (args[i] === '--root' && args[i + 1] && !args[i + 1].startsWith('--')) root = path.resolve(args[++i]);
      else throw new Error('Usage: node scripts/benchmark.js [--json] [--root <checkout>]');
    }
    const report = runBenchmark(root);
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Local state benchmark: ${report.environment.node}, ${report.environment.platform}/${report.environment.arch}, ${report.environment.cpu}`);
      console.log(`${samples} samples after ${warmups} warmups per case; no AI sessions or network calls.`);
      console.table(report.results.map(({ samplesMs, ...row }) => ({ ...row, medianMs: Number(row.medianMs.toFixed(3)), p95Ms: Number(row.p95Ms.toFixed(3)) })));
      console.log('Synthetic canonical plans without result summaries; CLI timings include Node startup. With 15 samples p95 is the maximum. These are not end-to-end AI workflow timings.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { summarize, runBenchmark };
