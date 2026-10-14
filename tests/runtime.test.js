'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const state = require('../sheriff/bin/lib/state');
const phases = require('../sheriff/bin/lib/phases');
const config = require('../sheriff/bin/lib/config');
const results = require('../sheriff/bin/lib/results');
const git = require('../sheriff/bin/lib/git');
const testmap = require('../sheriff/bin/lib/testmap');
const { withLock } = require('../sheriff/bin/lib/lock');
const cli = path.resolve(__dirname, '../sheriff/bin/sheriff-tools.js');

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-runtime-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  state.ensureSheriffDir(cwd);
  return cwd;
}
function plan(ids = ['1.1', '1.2']) {
  return '# Plan\n| Phase | Title | Status | Sub-phases |\n|---|---|---|---|\n| 1 | Coverage | [ ] | 0 / 2 |\n\n## Phase 1 — Coverage\n\n' + ids.map(id => `### ${id} — Test ${id}\n\`\`\`\nwave: 1\nlock: —\nlock_time: —\n\`\`\`\n\n- [ ] test\n`).join('\n');
}
function run(cwd, args, input) { return spawnSync(process.execPath, [cli, ...args], { cwd, input, encoding: 'utf8' }); }
function concurrent(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('canonical plan claims exact IDs, tracks failures and only completes fully finished phases', t => {
  const cwd = fixture(t);
  state.writeFile(state.PHASES_FILE, plan(['1.1', '1.10']), cwd);
  assert.equal(phases.getNextAvailableSubphase(1, cwd), '1.1');
  assert.equal(phases.claimSubphase('1.1', 'agent-a', cwd).success, true);
  assert.equal(phases.claimSubphase('1.1', 'agent-b', cwd).success, false);
  assert.equal(phases.claimSubphase('1.10', 'agent-b', cwd).success, true);
  phases.markComplete('1.1', 'pass', cwd);
  assert.match(state.readFile(state.PHASES_FILE, cwd), /\| 1 \| Coverage \| 🔒 \| 1 \/ 2 \|/);
  phases.markComplete('1.10', 'fail', cwd);
  assert.match(state.readFile(state.PHASES_FILE, cwd), /\| 1 \| Coverage \| ❌ \| 2 \/ 2 \|/);
  assert.deepEqual(state.getStatus(cwd), {initialized:true,total:2,done:1,inProgress:0,review:0,failed:1,pending:0,testsWritten:0,testsPassing:0,testsFailed:0});
  assert.equal(phases.markComplete('2.1', 'pass', cwd).success, false);
  assert.throws(() => phases.markComplete('1.1', 'unknown', cwd));
  assert.match(JSON.parse(run(cwd, ['init', 'executor', '1.1', '--raw']).stdout).subphaseBlock, /^### 1\.1 —/);
});

test('only one of concurrent processes can claim a phase and unrelated updates survive', async t => {
  const cwd = fixture(t);
  state.writeFile(state.PHASES_FILE, plan(), cwd);
  const attempts = await Promise.all(Array.from({length:8}, (_, index) => concurrent(cwd, ['claim-subphase', '1.1', `agent-${index}`, '--raw'])));
  assert.equal(attempts.filter(item => item.code === 0).length, 1);
  assert.equal(attempts.filter(item => item.code === 1).length, 7);
  const updates = await Promise.all(['1.1', '1.2'].map(id => concurrent(cwd, ['mark-complete', id, 'pass', '--raw'])));
  assert.ok(updates.every(item => item.code === 0));
  assert.equal(state.getStatus(cwd).done, 2);
  assert.equal(fs.existsSync(path.join(cwd, '.sheriff/.phases.lock')), false);
});

test('live/empty lock is never stolen and lock is removed after thrown callback', t => {
  const cwd = fixture(t);
  state.writeFile('.sheriff/.phases.lock', '', cwd);
  assert.throws(() => withLock('.sheriff/.phases.lock', cwd, () => {}, 30), /Timed out/);
  fs.unlinkSync(path.join(cwd, '.sheriff/.phases.lock'));
  assert.throws(() => withLock('.sheriff/.phases.lock', cwd, () => { throw Error('failure'); }), /failure/);
  assert.equal(fs.existsSync(path.join(cwd, '.sheriff/.phases.lock')), false);
});

test('migration inspects stored fields; invalid config leaves prior contents intact', t => {
  const cwd = fixture(t);
  config.writeConfig({ language: 'ts', models: { light: 'inherit' } }, cwd);
  assert.equal(config.readConfig(cwd).models.medium, 'sonnet');
  assert.ok(config.checkConfigVersion(cwd).missingFields.includes('models.medium'));
  assert.equal(config.checkConfigVersion(cwd).storedVersion, 0);
  const before = state.readFile('.sheriff/.sheriff.json', cwd);
  for (const value of [null, [], { maxParallelAgents: 0 }, { testTypes: {unit: 'yes'} }, { models: null }, {configVersion: 999}]) assert.throws(() => config.writeConfig(value, cwd));
  assert.equal(state.readFile('.sheriff/.sheriff.json', cwd), before);
  config.writeConfig(config.getDefault(), cwd);
  assert.equal(config.checkConfigVersion(cwd).needsMigration, false);
  config.writeConfig({ testRunner: 'jest' }, cwd);
  assert.equal(config.readConfig(cwd).testRunners.unit, 'jest');
});

test('state APIs reject traversal and symlinks without touching external files', t => {
  const cwd = fixture(t), outside = fixture(t);
  fs.writeFileSync(path.join(outside, 'important'), 'untouched');
  assert.throws(() => state.writeFile('../escape', 'bad', cwd));
  assert.throws(() => state.writeHandoff('../../escape', 'bad', cwd));
  assert.throws(() => results.writeResult('../escape', 'bad', cwd));
  fs.symlinkSync(path.join(outside, 'important'), path.join(cwd, '.sheriff/results/1-1.md'));
  assert.throws(() => results.writeResult('1.1', 'bad', cwd), /symlink/);
  assert.throws(() => results.readResult('1.1', cwd), /symlink/);
  fs.symlinkSync(outside, path.join(cwd, '.sheriff/linked'));
  assert.throws(() => state.writeFile('.sheriff/linked/important', 'bad', cwd), /symlink/);
  assert.equal(fs.readFileSync(path.join(outside, 'important'), 'utf8'), 'untouched');
});

test('assembly follows plan, reports every missing result, and sorts numerically', t => {
  const cwd = fixture(t);
  state.writeFile(state.PHASES_FILE, plan(['1.1', '1.2', '1.10']), cwd);
  assert.deepEqual(results.assembleResults('1', cwd).missing, ['1.1', '1.2', '1.10']);
  results.writeResult('1.10', 'TEN', cwd);
  results.writeResult('1.2', 'TWO', cwd);
  results.writeResult('1.99', 'OBSOLETE', cwd);
  const assembled = results.assembleResults('1', cwd);
  assert.equal(assembled.total, 3);
  assert.equal(assembled.found, 2);
  assert.deepEqual(assembled.missing, ['1.1']);
  assert.ok(assembled.content.indexOf('TWO') < assembled.content.indexOf('TEN'));
  assert.ok(!assembled.content.includes('OBSOLETE'));
});

test('handoff safety matches IDs exactly and terminal retry archives prior results', t => {
  const cwd = fixture(t);
  state.writeFile(state.PHASES_FILE, plan(), cwd);
  state.writeHandoff('1.10', 'Subphase 1.10', cwd);
  assert.equal(phases.getSafeToRelease('1.1', cwd).safe, true);
  state.writeHandoff('1.1', 'resume here', cwd);
  phases.claimSubphase('1.1', 'worker', cwd);
  assert.equal(phases.releaseSubphase('1.1', cwd).success, false);
  assert.equal(phases.releaseSubphase('1.1', cwd, true).success, true);
  assert.equal(state.readHandoff('1.1', cwd), 'resume here');
  phases.markComplete('1.1', 'fail', cwd);
  results.writeResult('1.1', 'failed work', cwd);
  results.writePhaseSummary('1', 'failed summary', cwd);
  phases.releaseSubphase('1.1', cwd, true);
  assert.equal(results.readResult('1.1', cwd), null);
  assert.equal(results.readPhaseSummary('1', cwd), null);
  assert.equal(fs.readdirSync(path.join(cwd, '.sheriff/archive')).length, 2);
});

test('coverage preserves empty columns, supports regressions and prefers exact paths', t => {
  const cwd = fixture(t);
  state.writeFile(state.TEST_MAP_FILE, '| Area | File | Unit | E2E | Complexity | Notes |\n|---|---|---|---|---|---|\n| | lib/a.js | ✅ | [ ] | low | |\n| X | a.js | [ ] | [ ] | low | |\n\n- Already tested (unit): 1\n- Needs unit tests: 1\n', cwd);
  assert.equal(testmap.updateCoverage('lib/a.js', 'unit', 'failed', cwd).success, true);
  const content = state.readFile(state.TEST_MAP_FILE, cwd);
  assert.match(content, /\|  \| lib\/a.js \| ❌ \| \[ \] \| low \|  \|/);
  assert.match(content, /Already tested \(unit\): 0/);
  assert.match(content, /Needs unit tests: 2/);
});

test('CLI rejects extra arguments, invalid IDs, and logical failures with nonzero status', t => {
  const cwd = fixture(t);
  state.writeFile(state.PHASES_FILE, plan(), cwd);
  for (const args of [['write-result','../bad'], ['mark-complete','1.1','pass','extra'], ['get-status','--oops'], ['claim-subphase','2.1','worker']]) {
    assert.equal(run(cwd, args, 'content').status, 1);
  }
  assert.equal(run(cwd, ['write-config'], '{bad').status, 1);
  assert.equal(run(cwd, ['write-result', '1.1'], '').status, 1);
});

test('git checkpoint/rollback preserve dirty work; commit uses explicit files and literal messages', t => {
  const cwd = fixture(t);
  const command = args => execFileSync('git', args, {cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  command(['init']); command(['config','user.name','Test']); command(['config','user.email','test@example.com']);
  fs.writeFileSync(path.join(cwd,'base'), 'base'); command(['add','base']); command(['commit','-m','base']);
  fs.writeFileSync(path.join(cwd,'base'), 'user edit');
  fs.writeFileSync(path.join(cwd,'new.test.js'), 'test');
  const hash = git.getCurrentHash(cwd);
  assert.equal(git.checkpoint('1.1',cwd).hash, hash);
  assert.equal(git.rollback(cwd).success, false);
  assert.equal(git.commitSuccess('1.1','no files',cwd).success, false);
  assert.equal(git.commitSuccess('1.1','unsafe directory',cwd,['.sheriff']).success, false);
  const msg = 'literal $(touch PWNED) `touch PWNED2` "quoted"';
  assert.equal(git.commitSuccess('1.1',msg,cwd,['new.test.js']).success, true);
  assert.equal(fs.existsSync(path.join(cwd,'PWNED')),false);
  assert.equal(fs.existsSync(path.join(cwd,'PWNED2')),false);
  assert.equal(command(['show','--pretty=','--name-only','HEAD']),'new.test.js');
  assert.equal(fs.readFileSync(path.join(cwd,'base'),'utf8'),'user edit');
  command(['add','base']);
  fs.writeFileSync(path.join(cwd,'next.test.js'),'next');
  assert.equal(git.commitSuccess('1.2','next',cwd,['next.test.js']).success,false);
  assert.equal(command(['diff','--cached','--name-only']),'base');
});

test('failed retry state write restores archived result and summary', t => {
  const cwd = fixture(t);
  state.writeFile(state.PHASES_FILE, plan(), cwd);
  phases.markComplete('1.1', 'fail', cwd);
  results.writeResult('1.1', 'failed evidence', cwd);
  results.writePhaseSummary('1', 'previous summary', cwd);
  const before = state.readFile(state.PHASES_FILE, cwd);
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === path.join(cwd, state.PHASES_FILE)) throw new Error('disk failure');
    return rename(from, to);
  });
  assert.throws(() => phases.releaseSubphase('1.1', cwd, true), /disk failure/);
  assert.equal(state.readFile(state.PHASES_FILE, cwd), before);
  assert.equal(results.readResult('1.1', cwd), 'failed evidence');
  assert.equal(results.readPhaseSummary('1', cwd), 'previous summary');
  assert.equal(fs.readdirSync(path.join(cwd, '.sheriff/archive')).length, 0);
});
