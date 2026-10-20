'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { installPackage } = require('./fixtures/install-package');
const ROOT = path.resolve(__dirname, '..');
const installer = path.join(ROOT, 'bin/install.js');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-local-safety-'));
  const home = path.join(dir, 'home');
  const project = path.join(dir, 'project');
  fs.mkdirSync(home); fs.mkdirSync(project);
  const packageRoot = installPackage(project);
  const env = { ...process.env, HOME: home, USERPROFILE: home, NODE_OPTIONS: '', TMPDIR: dir };
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  function setup(args, extra = {}) {
    return spawnSync(process.execPath, [installer, ...args, '--silent'], {
      cwd: project, env: { ...env, ...extra }, encoding: 'utf8', timeout: 10000,
    });
  }
  return { dir, home, project, packageRoot, env, setup };
}
function put(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
function json(file) { return JSON.parse(read(file)); }
function ok(result) { assert.equal(result.status, 0, result.stderr || result.stdout); }
const local = ['--tool', 'both', '--local'];

function copiedInstall(f) {
  ok(f.setup(['--tool', 'both', '--global']));
  for (const directory of ['.claude', '.agents']) {
    fs.cpSync(path.join(f.home, directory), path.join(f.project, directory), { recursive: true });
    fs.rmSync(path.join(f.home, directory), { recursive: true });
  }
  const settings = path.join(f.project, '.claude/settings.json');
  put(settings, read(settings).replaceAll(f.home, fs.realpathSync(f.project)));
  for (const root of ['.claude/sheriff', '.agents/skills/sheriff']) {
    const manifest = path.join(f.project, root, '.install-manifest.json');
    // Pre-package-layout manifests recorded only the copied paths.
    put(manifest, JSON.stringify({ files: json(manifest).files }));
  }
}

function snapshot(dir) {
  const contents = {};
  function walk(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, item.name);
      if (item.isDirectory()) walk(file);
      else contents[path.relative(dir, file)] = read(file);
    }
  }
  walk(dir);
  return contents;
}

test('copied installs migrate atomically and preserve unknown files and all project state', (t) => {
  const f = fixture(t);
  copiedInstall(f);
  put(path.join(f.project, '.sheriff/personal.md'), 'project state');
  put(path.join(f.project, '.agents/skills/sheriff/personal.md'), 'personal skill resource');
  put(path.join(f.project, '.claude/sheriff/personal.md'), 'personal Claude resource');
  const beforeClaude = snapshot(path.join(f.project, '.claude'));
  const beforeCodex = snapshot(path.join(f.project, '.agents'));
  const failure = path.join(fs.realpathSync(f.project), '.agents/skills/sheriff/SKILL.md');
  const preload = path.join(f.dir, 'fail-write.cjs');
  put(preload, `const fs = require('fs'); const rename = fs.renameSync; let failed = false; fs.renameSync = function(a, b) { if (!failed && b === ${JSON.stringify(failure)}) { failed = true; throw new Error('migration write failed'); } return rename.apply(this, arguments); };`);
  const failed = f.setup(local, { NODE_OPTIONS: `--require=${preload}` });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /migration write failed/);
  assert.deepEqual(snapshot(path.join(f.project, '.claude')), beforeClaude);
  assert.deepEqual(snapshot(path.join(f.project, '.agents')), beforeCodex);
  ok(f.setup(local));
  assert.deepEqual(fs.readdirSync(path.join(f.project, '.agents/skills/sheriff')).sort(), ['SKILL.md', 'personal.md']);
  assert.deepEqual(fs.readdirSync(path.join(f.project, '.claude/sheriff')).sort(), ['.install-manifest.json', 'personal.md']);
  assert.equal(read(path.join(f.project, '.sheriff/personal.md')), 'project state');
  ok(f.setup([...local, '--uninstall']));
  assert.equal(read(path.join(f.project, '.agents/skills/sheriff/personal.md')), 'personal skill resource');
  assert.equal(read(path.join(f.project, '.claude/sheriff/personal.md')), 'personal Claude resource');
  assert.equal(read(path.join(f.project, '.sheriff/personal.md')), 'project state');
});

test('invalid recorded statusline cannot adopt and replace a custom command', (t) => {
  for (const action of [[], ['--uninstall']]) {
    const f = fixture(t);
    const settingsFile = path.join(f.project, '.claude/settings.json');
    const custom = { type: 'command', command: 'echo personal-statusline' };
    put(settingsFile, JSON.stringify({ statusLine: custom }));
    ok(f.setup(local));
    const manifestFile = path.join(f.project, '.claude/sheriff/.install-manifest.json');
    const manifest = json(manifestFile);
    manifest.statusLine = custom.command;
    put(manifestFile, JSON.stringify(manifest));
    f.setup([...local, ...action]);
    assert.deepEqual(json(settingsFile).statusLine, custom);
  }
});

test('global setup and uninstall preserve a project-local hook command in global settings', (t) => {
  const f = fixture(t);
  const settingsFile = path.join(f.home, '.claude/settings.json');
  const projectHook = { hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/sheriff-context-monitor.js"' }] };
  put(settingsFile, JSON.stringify({ hooks: { PostToolUse: [projectHook] } }));
  ok(f.setup(['--tool', 'claude', '--global']));
  const settings = json(settingsFile);
  assert.ok(settings.hooks.PostToolUse.some((entry) => JSON.stringify(entry) === JSON.stringify(projectHook)));
  ok(f.setup(['--tool', 'claude', '--global', '--uninstall']));
  assert.deepEqual(json(settingsFile), { hooks: { PostToolUse: [projectHook] } });
});

test('a missing runtime module cannot replace an existing copied installation with a broken adapter', (t) => {
  const f = fixture(t);
  copiedInstall(f);
  const before = snapshot(path.join(f.project, '.agents'));
  fs.unlinkSync(path.join(f.packageRoot, 'dist/codex/bin/lib/config.js'));
  const result = f.setup(['--tool', 'codex', '--local']);
  assert.notEqual(result.status, 0);
  assert.deepEqual(snapshot(path.join(f.project, '.agents')), before);
});

test('malformed package inventories fail before modifying either existing integration', (t) => {
  const f = fixture(t);
  copiedInstall(f);
  const beforeClaude = snapshot(path.join(f.project, '.claude'));
  const beforeCodex = snapshot(path.join(f.project, '.agents'));
  const metadataFile = path.join(f.packageRoot, 'dist/codex/package.json');
  const metadata = json(metadataFile);
  for (const files of [undefined, null, [], {}, [''], [false], ['../package.json'], ['./runtime.md'], [path.join(f.project, 'package.json')], ['bin']]) {
    put(metadataFile, JSON.stringify({ ...metadata, files }));
    const result = f.setup(local);
    assert.notEqual(result.status, 0, `Inventory ${JSON.stringify(files)} must be rejected`);
    assert.deepEqual(snapshot(path.join(f.project, '.claude')), beforeClaude);
    assert.deepEqual(snapshot(path.join(f.project, '.agents')), beforeCodex);
    assert.equal(fs.existsSync(path.join(f.project, '.sheriff-installer.lock')), false);
  }
});

test('symlinked integration parents abort before either tool writes', (t) => {
  const f = fixture(t);
  const outside = path.join(f.dir, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.project, '.agents'));
  const result = f.setup(local);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink/);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(fs.existsSync(path.join(f.project, '.claude')), false);
});
