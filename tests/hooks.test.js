'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-hooks-test-'));
  const project = path.join(dir, 'project');
  fs.mkdirSync(path.join(project, '.sheriff'), { recursive: true });
  fs.writeFileSync(path.join(project, '.sheriff/.sheriff.json'), '{}');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const data = { session_id: 'session', cwd: project, context_window: { remaining_percentage: 20 } };
  const owner = process.getuid?.() ?? crypto.createHash('sha256').update(os.homedir()).digest('hex').slice(0, 16);
  const cacheDir = path.join(dir, `sheriff-hooks-${owner}`);
  const key = crypto.createHash('sha256').update(`session\0${project}`).digest('hex');
  const bridge = path.join(cacheDir, `${key}.json`);
  const run = (name, input = data) => {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, `../hooks/dist/sheriff-${name}.js`)], { cwd: project, env: { ...process.env, TMPDIR: dir, TMP: dir, TEMP: dir, HOOK_DATA: '' }, input: JSON.stringify(input), encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  return { dir, project, data, cacheDir, bridge, run };
}

test('monitor ignores stale, cross-project and invalid metrics', (t) => {
  const f = fixture(t);
  f.run('statusline');
  const good = JSON.parse(fs.readFileSync(f.bridge));
  for (const bad of [{ ...good, timestamp: Date.now() - 360000 }, { ...good, cwd: '/different-project' }, { ...good, remainingPercent: -10 }, { ...good, remainingPercent: '10' }, { ...good, sessionId: 'other-session' }]) {
    fs.writeFileSync(f.bridge, JSON.stringify(bad));
    for (let i = 0; i < 5; i++) assert.equal(f.run('context-monitor'), '');
  }
  fs.writeFileSync(f.bridge, JSON.stringify(good));
  for (let i = 0; i < 4; i++) assert.equal(f.run('context-monitor'), '');
  assert.match(f.run('context-monitor'), /CONTEXT CRITICAL/);
  for (let i = 0; i < 5; i++) assert.equal(f.run('context-monitor', { ...f.data, agent_id: 'child-1' }), '');
  assert.equal(f.run('context-monitor', { ...f.data, cwd: 42 }), '');
});

test('hooks do not follow cache-directory symlinks', (t) => {
  const f = fixture(t);
  const other = path.join(f.dir, 'unrelated');
  fs.mkdirSync(other);
  fs.symlinkSync(other, f.cacheDir, 'dir');
  assert.equal(f.run('statusline'), '');
  assert.deepEqual(fs.readdirSync(other), []);
});

test('statusline counts status cells and never displays a phase past the final phase', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.project, '.sheriff/PHASES.md'), '## Phase Progress\n| 1 | unit | ✅ | 1 / 1 |\n## Phase 1 — unit\n| 1.1 | case | ✅ | 1 |\nProse ✅ and ⚠️ are not statuses.\n');
  const output = f.run('statusline');
  assert.match(output, /Phases 1\/1 complete/);
  assert.match(output, /1✅/);
  assert.doesNotMatch(output, /2\/1|⚠️|2✅/);
  assert.match(f.run('statusline', { ...f.data, context_window: null }), /Sheriff/);
  assert.doesNotMatch(f.run('statusline', { ...f.data, context_window: null }), /ctx/);
});


test('statusline reads canonical fenced subphase metadata without legacy rows', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.project, '.sheriff/PHASES.md'), [
    '## Phase 1 — unit',
    '### 1.1 — first', '```', 'status: pass', 'lock: —', '```',
    '### 1.2 — second', '```', 'status: in_progress', 'lock: executor-1', '```',
    '## Phase 2 — integration',
    '### 2.1 — third', '```', 'status: review', 'lock: —', '```',
  ].join('\n'));
  const output = f.run('statusline');
  assert.match(output, /Phase 1\/2/);
  assert.match(output, /1 running/);
  assert.match(output, /1✅/);
  assert.match(output, /1⚠️/);
});
