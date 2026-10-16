'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { summarize } = require('../scripts/benchmark');
const { renderReport, validate } = require('../scripts/benchmark-report');
const root = path.resolve(__dirname, '..');

function report(values = [1, 2, 3]) {
  return {
    schemaVersion: 1, startedAt: '2026-10-16T00:00:00Z', finishedAt: '2026-10-16T00:00:01Z',
    source: { commit: 'a'.repeat(40), dirty: false, packageVersion: '0.1.5', runtimeSha256: 'b'.repeat(64) },
    benchmark: { version: 1, sha256: 'c'.repeat(64), samples: values.length, warmups: 3 },
    environment: { node: 'v22.18.0', platform: 'linux', arch: 'x64', cpu: 'test', osRelease: 'test', runnerImage: null, runnerImageVersion: null },
    results: [{ operation: 'parse plan', subphases: 1000, unit: 'ms', samplesMs: values, ...summarize(values) }],
  };
}

test('benchmark statistics retain sample order and calculate median and nearest-rank p95', () => {
  const samples = [3, 1, 2];
  assert.deepEqual(summarize(samples), { medianMs: 2, p95Ms: 3 });
  assert.deepEqual(samples, [3, 1, 2]);
  assert.deepEqual(summarize([4, 2]), { medianMs: 3, p95Ms: 4 });
  for (const values of [[], [0], [-1], [NaN], [Infinity]]) assert.throws(() => summarize(values));
});

test('reports show improvements and regressions without enforcing a speed threshold', () => {
  assert.match(renderReport(report([1, 2, 3]), report([2, 4, 6])), /-50\.0%/);
  assert.match(renderReport(report([2, 4, 6]), report([1, 2, 3])), /100\.0%/);
  const current = report();
  current.source.commit = null;
  current.source.dirty = true;
  assert.match(renderReport(current), /unversioned \(uncommitted changes\)/);
  assert.match(renderReport(current), /\| 2\.000 ms \| — \| — \|/);
});

test('incompatible environments, harnesses and scenarios never produce a percentage comparison', () => {
  for (const change of [
    r => { r.environment.cpu = 'different CPU'; },
    r => { r.environment.node = 'v24.0.0'; },
    r => { r.benchmark.sha256 = 'd'.repeat(64); },
    r => { r.benchmark.version = 2; },
    r => { r.benchmark.warmups = 4; },
    r => { r.results[0].subphases = 100; },
  ]) {
    const baseline = report();
    change(baseline);
    const markdown = renderReport(report(), baseline);
    assert.match(markdown, /Comparison unavailable/);
    assert.doesNotMatch(markdown, /\d\.\d%/);
  }
});

test('reports reject corrupt samples, misleading summaries, duplicate scenarios and unknown schemas', () => {
  for (const change of [
    r => { r.schemaVersion = 2; },
    r => { r.results[0].medianMs = 10; },
    r => { r.results[0].p95Ms = 10; },
    r => { r.results[0].samplesMs = [1, -2, 3]; },
    r => { r.results[0].samplesMs.pop(); },
    r => { r.results[0].unit = 'seconds'; },
    r => { r.results.push(r.results[0]); },
  ]) {
    const invalid = report();
    change(invalid);
    assert.throws(() => renderReport(invalid));
    assert.throws(() => renderReport(report(), invalid));
  }
  const escaped = report();
  escaped.environment.cpu = '<details>|fake\nrow';
  assert.match(renderReport(escaped), /&lt;details&gt;\\\|fake row/);
});

test('JSON CLI benchmarks another checkout without its own harness and cleans up on success and failure', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-benchmark-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const target = path.join(dir, 'checkout with spaces');
  const scratch = path.join(dir, 'scratch');
  fs.mkdirSync(target);
  fs.mkdirSync(scratch);
  fs.copyFileSync(path.join(root, 'package.json'), path.join(target, 'package.json'));
  fs.cpSync(path.join(root, 'sheriff'), path.join(target, 'sheriff'), { recursive: true });
  const run = args => spawnSync(process.execPath, [path.join(root, 'scripts/benchmark.js'), ...args], {
    cwd: dir, encoding: 'utf8', timeout: 30000, env: { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch },
  });
  const success = run(['--root', target, '--json']);
  assert.equal(success.status, 0, success.stderr);
  const measured = JSON.parse(success.stdout);
  validate(measured);
  assert.equal(measured.source.commit, null);
  assert.equal(measured.source.dirty, null);
  assert.equal(measured.results.length, 6);
  assert.deepEqual(measured.results.map(row => row.subphases), [3, 3, 100, 100, 1000, 1000]);
  assert.ok(measured.results.every(row => row.samplesMs.length === 15));
  assert.deepEqual(fs.readdirSync(scratch), []);
  assert.equal(fs.existsSync(path.join(target, '.sheriff')), false);

  const saved = path.join(dir, 'result.json');
  fs.writeFileSync(saved, JSON.stringify(measured));
  const markdown = spawnSync(process.execPath, [path.join(root, 'scripts/benchmark-report.js'), saved], { encoding: 'utf8' });
  assert.equal(markdown.status, 0, markdown.stderr);
  assert.match(markdown.stdout, /get-status CLI/);

  const parser = path.join(target, 'sheriff/bin/lib/phases.js');
  fs.writeFileSync(parser, fs.readFileSync(parser, 'utf8').replace('function parseSubphases(content) {', "function parseSubphases(content) { throw new Error('seeded benchmark failure');"));
  const failure = run(['--root', target, '--json']);
  assert.equal(failure.status, 1);
  assert.equal(failure.stdout, '');
  assert.match(failure.stderr, /seeded benchmark failure/);
  assert.deepEqual(fs.readdirSync(scratch), []);
  assert.equal(run(['--unknown']).status, 1);
  assert.equal(run(['--root']).status, 1);
});
