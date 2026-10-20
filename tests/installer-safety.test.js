'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { installPackage } = require('./fixtures/install-package');
const ROOT = path.resolve(__dirname, '..');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-safety-'));
  const project = path.join(dir, 'project');
  const home = path.join(dir, 'home');
  fs.mkdirSync(project); fs.mkdirSync(home);
  installPackage(project);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: dir, NODE_OPTIONS: '' };
  return { dir, project, home, env, setup: (args, extraEnv = {}) => spawnSync(process.execPath, [path.join(ROOT, 'bin/install.js'), ...args, '--silent'], { cwd: project, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 10000 }) };
}
function put(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
function ok(result) { assert.equal(result.status, 0, result.stderr); }
const local = ['--tool', 'both', '--local'];

test('foreign command, agent and hook collisions abort both installs without changing files', (t) => {
  const f = fixture(t);
  for (const relative of ['.claude/commands/sheriff/run.md', '.claude/agents/sheriff-executor.md', '.claude/hooks/sheriff-context-monitor.js']) {
    const file = path.join(f.project, relative);
    put(file, 'personal content');
    const result = f.setup(local);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unowned file/);
    assert.equal(read(file), 'personal content');
    assert.equal(fs.existsSync(path.join(f.project, '.agents')), false);
    assert.equal(fs.existsSync(path.join(f.project, '.claude/sheriff')), false);
    fs.unlinkSync(file);
  }
});

test('uninstall without an installation preserves matching filenames and hook settings', (t) => {
  const f = fixture(t);
  const file = path.join(f.project, '.claude/hooks/sheriff-context-monitor.js');
  const settings = path.join(f.project, '.claude/settings.json');
  put(file, 'foreign hook');
  put(settings, JSON.stringify({ hooks: { PostToolUse: [{ command: `node ${file}` }] } }));
  const before = read(settings);
  ok(f.setup([...local, '--uninstall']));
  assert.equal(read(file), 'foreign hook');
  assert.equal(read(settings), before);
});

test('update removes obsolete inventoried files and uninstall retains personal installation files', (t) => {
  const f = fixture(t);
  ok(f.setup(local));
  const root = path.join(f.project, '.agents/skills/sheriff');
  const manifest = path.join(root, '.install-manifest.json');
  const inventory = { files: ['.agents/skills/sheriff/SKILL.md', '.agents/skills/sheriff/package.json'] };
  put(path.join(root, 'package.json'), JSON.stringify({ name: '@dagim_codes/sheriff' }));
  const old = path.join(root, 'commands/obsolete.md');
  put(old, 'old command');
  inventory.files.push(path.relative(f.project, old));
  put(manifest, JSON.stringify(inventory));
  put(path.join(root, 'personal.md'), 'keep');
  ok(f.setup(local));
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(manifest), false);
  assert.equal(fs.existsSync(path.join(root, 'package.json')), false);
  ok(f.setup([...local, '--uninstall']));
  assert.equal(read(path.join(root, 'personal.md')), 'keep');
  assert.equal(fs.existsSync(path.join(root, 'SKILL.md')), false);
});

test('old npm scope supports upgrade and uninstall while foreign package names are rejected', (t) => {
  for (const uninstall of [false, true]) {
    const f = fixture(t);
    const global = ['--tool', 'both', '--global'];
    ok(f.setup(global));
    const packages = ['.claude/sheriff/package.json', '.agents/skills/sheriff/package.json']
      .map((relative) => path.join(f.home, relative));
    const args = uninstall ? [...global, '--uninstall'] : global;
    for (const file of packages) put(file, JSON.stringify({ name: '@someone-else/sheriff' }));
    const rejected = f.setup(args);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /not a Sheriff installation/);
    for (const file of packages) {
      assert.equal(JSON.parse(read(file)).name, '@someone-else/sheriff');
      put(file, JSON.stringify({ name: '@dagim_s/sheriff' }));
    }
    const state = path.join(f.project, '.sheriff/personal.md');
    put(state, 'keep project state');
    ok(f.setup(args));
    assert.equal(read(state), 'keep project state');
    for (const file of packages) {
      if (uninstall) assert.equal(fs.existsSync(file), false);
      else assert.equal(JSON.parse(read(file)).name, require('../package.json').name);
    }
  }
});

test('local hook migration preserves global and unrelated same-basename hooks', (t) => {
  const f = fixture(t);
  ok(f.setup(['--global']));
  const globalHook = JSON.parse(read(path.join(f.home, '.claude/settings.json'))).hooks.PostToolUse[0];
  const foreignHook = { hooks: [{ type: 'command', command: 'node /other/hooks/sheriff-context-monitor.js' }] };
  const settings = path.join(f.project, '.claude/settings.json');
  const original = { hooks: { PostToolUse: [globalHook, foreignHook] } };
  put(settings, JSON.stringify(original));
  ok(f.setup(local));
  assert.equal(JSON.parse(read(settings)).hooks.PostToolUse.length, 3);
  ok(f.setup([...local, '--uninstall']));
  assert.deepEqual(JSON.parse(read(settings)), original);
});

test('late write failure rolls back both integrations and settings', (t) => {
  const f = fixture(t);
  ok(f.setup(local));
  const command = path.join(f.project, '.claude/commands/sheriff/help.md');
  const settings = path.join(f.project, '.claude/settings.json');
  put(command, 'original installed command');
  const before = read(settings);
  const failAt = path.join(fs.realpathSync(f.project), '.agents/skills/sheriff/SKILL.md');
  const preload = path.join(f.dir, 'fail-write.cjs');
  put(preload, `const fs = require('fs'); const rename = fs.renameSync; let failed = false; fs.renameSync = function(a, b) { if (!failed && b === ${JSON.stringify(failAt)}) { failed = true; throw new Error('simulated disk failure'); } return rename.apply(this, arguments); };`);
  const result = f.setup(local, { NODE_OPTIONS: `--require=${preload}` });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /simulated disk failure/);
  assert.equal(read(command), 'original installed command');
  assert.equal(read(settings), before);
  ok(f.setup(local));
});

test('manifest traversal and symlink destinations fail before writes', (t) => {
  const f = fixture(t);
  ok(f.setup(local));
  const manifest = path.join(f.project, '.claude/sheriff/.install-manifest.json');
  const original = read(manifest);
  put(manifest, JSON.stringify({ files: ['../outside'] }));
  assert.notEqual(f.setup([...local, '--uninstall']).status, 0);
  assert.ok(fs.existsSync(path.join(f.project, '.agents/skills/sheriff/SKILL.md')));
  put(manifest, original);
  const command = path.join(f.project, '.claude/commands/sheriff/help.md');
  const victim = path.join(f.dir, 'personal.md');
  put(victim, 'safe'); fs.unlinkSync(command); fs.symlinkSync(victim, command);
  assert.notEqual(f.setup(local).status, 0);
  assert.equal(read(victim), 'safe');
});


test('an existing installer lock blocks concurrent mutation without removing its owner lock', (t) => {
  const f = fixture(t);
  const lock = path.join(f.project, '.sheriff-installer.lock');
  put(lock, 'another install');
  const result = f.setup(local);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Another installer/);
  assert.equal(read(lock), 'another install');
  assert.deepEqual(fs.readdirSync(f.project), ['.sheriff-installer.lock', 'node_modules', 'package.json']);
});


test('legacy installs migrate recognizable commands and bundled hooks while preserving unknown files', (t) => {
  const f = fixture(t);
  const root = path.join(f.project, '.claude/sheriff');
  put(path.join(root, 'package.json'), JSON.stringify({ name: '@dagim_s/sheriff' }));
  const command = path.join(f.project, '.claude/commands/sheriff/run.md');
  const hook = path.join(f.project, '.claude/hooks/sheriff-context-monitor.js');
  put(command, '---\nname: sheriff:run\n---\nOld workflow');
  put(hook, fs.readFileSync(path.join(__dirname, 'fixtures/legacy-context-monitor.js')));
  put(path.join(root, 'personal.md'), 'keep');
  ok(f.setup(local));
  assert.doesNotMatch(read(command), /Old workflow/);
  assert.notEqual(read(hook), read(path.join(__dirname, 'fixtures/legacy-context-monitor.js')));
  assert.equal(read(path.join(root, 'personal.md')), 'keep');
  assert.ok(fs.existsSync(path.join(root, '.install-manifest.json')));
});


test('explicit falsy and inherited statuslines are preserved', (t) => {
  const f = fixture(t);
  const settings = path.join(f.project, '.claude/settings.json');
  for (const statusLine of [null, false, '']) {
    put(settings, JSON.stringify({ statusLine }));
    ok(f.setup(local));
    assert.equal(JSON.parse(read(settings)).statusLine, statusLine);
    ok(f.setup([...local, '--uninstall']));
    assert.equal(JSON.parse(read(settings)).statusLine, statusLine);
  }
  put(settings, '{}');
  put(path.join(f.home, '.claude/settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'echo custom-global' } }));
  ok(f.setup(local));
  assert.equal(Object.hasOwn(JSON.parse(read(settings)), 'statusLine'), false);
});
