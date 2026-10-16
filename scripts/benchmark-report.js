#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { summarize } = require('./benchmark');

const environmentKeys = ['node', 'platform', 'arch', 'cpu', 'osRelease', 'runnerImage', 'runnerImageVersion'];
const key = row => `${row.operation}/${row.subphases}`;
const cell = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('|', '\\|').replaceAll('`', "'").replace(/[\r\n]/g, ' ');

function validate(report) {
  assert.equal(report.schemaVersion, 1, 'Unsupported benchmark schema');
  assert.ok(Number.isFinite(Date.parse(report.startedAt)) && Number.isFinite(Date.parse(report.finishedAt)), 'Invalid timestamps');
  assert.match(report.source.runtimeSha256, /^[a-f0-9]{64}$/);
  assert.ok(report.source.commit === null || /^[a-f0-9]{40,64}$/.test(report.source.commit), 'Invalid commit');
  assert.ok(report.source.dirty === null || typeof report.source.dirty === 'boolean', 'Invalid dirty state');
  assert.equal(typeof report.source.packageVersion, 'string');
  assert.match(report.benchmark.sha256, /^[a-f0-9]{64}$/);
  for (const field of ['version', 'samples']) assert.ok(Number.isSafeInteger(report.benchmark[field]) && report.benchmark[field] > 0, `Invalid ${field}`);
  assert.ok(Number.isSafeInteger(report.benchmark.warmups) && report.benchmark.warmups >= 0, 'Invalid warmups');
  for (const field of environmentKeys) {
    assert.ok(typeof report.environment[field] === 'string' || (field.startsWith('runner') && report.environment[field] === null), `Invalid environment.${field}`);
  }
  assert.ok(Array.isArray(report.results) && report.results.length > 0, 'Missing benchmark results');
  const seen = new Set();
  for (const row of report.results) {
    assert.ok(typeof row.operation === 'string' && row.operation.trim(), 'Invalid operation');
    assert.ok(Number.isSafeInteger(row.subphases) && row.subphases > 0, 'Invalid subphase count');
    assert.equal(row.unit, 'ms', 'Unsupported timing unit');
    assert.ok(!seen.has(key(row)), 'Duplicate benchmark scenario');
    seen.add(key(row));
    assert.ok(Array.isArray(row.samplesMs) && row.samplesMs.length === report.benchmark.samples, 'Incorrect sample count');
    const stats = summarize(row.samplesMs);
    assert.equal(row.medianMs, stats.medianMs, 'Median does not match raw samples');
    assert.equal(row.p95Ms, stats.p95Ms, 'p95 does not match raw samples');
  }
}

function renderReport(current, baseline = null) {
  validate(current);
  if (baseline) validate(baseline);
  const differences = [];
  if (baseline) {
    for (const field of ['version', 'sha256', 'samples', 'warmups']) {
      if (current.benchmark[field] !== baseline.benchmark[field]) differences.push(`benchmark.${field}`);
    }
    for (const field of environmentKeys) {
      if (current.environment[field] !== baseline.environment[field]) differences.push(`environment.${field}`);
    }
    if (JSON.stringify(current.results.map(key).sort()) !== JSON.stringify(baseline.results.map(key).sort())) differences.push('scenarios');
  }
  const comparable = baseline && differences.length === 0;
  const rows = ['# Runtime benchmark', '', 'Median milliseconds; lower is better. Performance changes are informational.', ''];
  for (const [label, report] of [['Current', current], ...(baseline ? [['Baseline', baseline]] : [])]) {
    const { source, environment, benchmark } = report;
    rows.push(`- ${label}: ${cell(source.commit || 'unversioned')} (${source.dirty === null ? 'Git state unavailable' : source.dirty ? 'uncommitted changes' : 'clean'}), package ${cell(source.packageVersion)}; ${cell(report.startedAt)}.`);
    rows.push(`- ${label} environment: ${cell(environment.node)}, ${cell(environment.platform)}/${cell(environment.arch)}, ${cell(environment.cpu)}, OS ${cell(environment.osRelease)}; runner ${cell(environment.runnerImage || 'local')}/${cell(environment.runnerImageVersion || 'unspecified')}.`);
    rows.push(`- ${label} runtime SHA-256: \`${source.runtimeSha256}\`; harness SHA-256: \`${benchmark.sha256}\`.`);
  }
  rows.push('', `${current.benchmark.samples} samples after ${current.benchmark.warmups} warmups per scenario.`, '');
  if (differences.length) rows.push(`Comparison unavailable: ${differences.join(', ')} differ. Rerun both revisions with the same harness and environment.`, '');
  rows.push('| Operation | Sub-phases | Current median | Baseline median | Change |', '| --- | ---: | ---: | ---: | ---: |');
  const previous = new Map(baseline?.results.map(row => [key(row), row]) || []);
  for (const row of current.results) {
    const before = previous.get(key(row));
    const delta = comparable ? `${((row.medianMs / before.medianMs - 1) * 100).toFixed(1)}%` : '—';
    rows.push(`| ${cell(row.operation)} | ${row.subphases} | ${row.medianMs.toFixed(3)} ms | ${before ? `${before.medianMs.toFixed(3)} ms` : '—'} | ${delta} |`);
  }
  rows.push('', 'Synthetic canonical plans without result summaries. CLI timings include Node startup. Negative change means faster. This does not measure AI workflow speed; hosted and local results need separate baselines.', '');
  return rows.join('\n');
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    assert.ok(args.length >= 1 && args.length <= 2 && args.every(arg => !arg.startsWith('--')), 'Usage: node scripts/benchmark-report.js <current.json> [baseline.json]');
    const reports = args.map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
    process.stdout.write(renderReport(...reports));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { renderReport, validate };
