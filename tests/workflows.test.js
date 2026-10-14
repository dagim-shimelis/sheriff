'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'sheriff/bin/sheriff-tools.js');

// Exercise the shipped authoring template, rather than a separate hand-maintained phase fixture.
test('published phase/map templates support claiming, reporting, completion and explicit retry', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-workflow-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  function run(args, input) {
    const r = spawnSync(process.execPath, [cli, ...args, '--raw'], { cwd, input, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    return JSON.parse(r.stdout);
  }
  function template(name, values) {
    return fs.readFileSync(path.join(root, 'sheriff/templates', name), 'utf8')
      .replace(/\{\{([A-Z_0-9]+)\}\}/g, (_, key) => {
        assert.ok(Object.hasOwn(values, key), `Missing template value: ${key}`);
        return values[key];
      });
  }
  run(['init-project']);
  fs.writeFileSync(path.join(cwd, '.sheriff/PHASES.md'), template('PHASES_template.md', {
    TIMESTAMP: new Date().toISOString(), STRATEGY: 'risk', PHASE_1_TITLE: 'Arithmetic',
    PHASE_1_COUNT: '1', SUBPHASE_TITLE: 'Adds inputs', TEST_FILE_PATH: 'tests/add.test.js',
    SOURCE_FILE_PATH: 'src/add.js', TEST_CASE_1: 'adds positive inputs', TEST_CASE_2: 'handles zero',
  }));
  fs.writeFileSync(path.join(cwd, '.sheriff/TEST_MAP.md'), template('TEST_MAP_template.md', {
    TIMESTAMP: new Date().toISOString(), FRAMEWORK: 'none', TEST_RUNNER: 'node', LANGUAGE: 'js',
    MOCK_PATTERNS: 'None', AREA: 'Utility', FILE: 'src/add.js', UNIT_STATUS: '[ ] missing',
    E2E_STATUS: '— not applicable', COMPLEXITY: 'simple', NOTES: 'unit: tests/add.test.js',
    TOTAL: '1', UNIT_DONE: '0', E2E_DONE: '0', UNIT_NEEDED: '1', E2E_NEEDED: '0', NA: '1',
    CRITICAL_FILES: 'None', HIGH_FILES: 'None', MEDIUM_FILES: 'None', LOW_FILES: 'src/add.js',
  }));
  assert.equal(run(['get-status']).total, 1);
  assert.match(run(['init', 'executor', '1.1']).subphaseBlock, /test_type: unit/);
  assert.equal(run(['claim-subphase', '1.1', 'executor-1']).success, true);
  assert.equal(run(['get-status']).inProgress, 1);
  const resultFile = run(['write-result', '1.1'], '## Sub-phase 1.1 — Adds inputs\n\n**Status**: pass\n**Tests**: 2 passing, 0 skipped, 0 failed\n**Command**: node --test tests/add.test.js\n**Exit code**: 0\n').file;
  assert.equal(fs.existsSync(path.join(cwd, resultFile)), true);
  assert.equal(run(['update-testmap', 'src/add.js', 'unit', 'tested']).success, true);
  assert.equal(run(['mark-complete', '1.1', 'pass']).success, true);
  const done = run(['get-status']);
  assert.equal(done.done, 1);
  assert.equal(done.pending, 0);
  assert.equal(run(['assemble-results', '1']).found, 1);
  run(['release-subphase', '1.1', '--force']);
  assert.equal(run(['get-status']).pending, 1);
  assert.equal(fs.existsSync(path.join(cwd, resultFile)), false);
});
