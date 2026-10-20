'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { installPackage } = require('./fixtures/install-package');
const ROOT = path.resolve(__dirname, '..');
const pkg = require('../package.json');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-package-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const project = path.join(dir, "project with 'quotes' and spaces");
  const home = path.join(dir, 'home');
  fs.mkdirSync(project); fs.mkdirSync(home);
  const env = { ...process.env, HOME: home, USERPROFILE: home, NODE_PATH: '', npm_config_cache: path.join(dir, 'npm-cache') };
  const run = (file, args, cwd = project, input = '') => spawnSync(process.execPath, [file, ...args], { cwd, env, input, encoding: 'utf8', timeout: 30000 });
  return { dir, project, env, run };
}
function ok(result) { assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout; }
function read(file) { return fs.readFileSync(file, 'utf8'); }

test('package and lockfile do not depend on Sheriff itself', () => {
  const lock = require('../package-lock.json');
  assert.equal(pkg.dependencies?.[pkg.name], undefined);
  assert.equal(lock.packages[''].dependencies?.[pkg.name], undefined);
  assert.equal(lock.packages[`node_modules/${pkg.name}`], undefined);
});

test('offline dependency reinstall restores package-backed runtime without replacing adapters or project state', (t) => {
  const f = fixture(t);
  const npm = (args, cwd = f.project) => process.env.npm_execpath
    ? f.run(process.env.npm_execpath, args, cwd)
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, env: f.env, encoding: 'utf8', timeout: 30000, shell: process.platform === 'win32' });
  const packed = JSON.parse(ok(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', f.dir], ROOT)))[0];
  const npmFlags = ['--offline', '--ignore-scripts', '--no-audit', '--no-fund'];
  fs.writeFileSync(path.join(f.project, 'package.json'), JSON.stringify({ private: true, devDependencies: { [pkg.name]: `file:${path.join(f.dir, packed.filename)}` } }));
  Object.assign(f.env, { npm_config_offline: 'true', npm_config_ignore_scripts: 'true' });
  ok(f.run(path.join(ROOT, 'bin/install.js'), ['--tool', 'both', '--local', '--silent']));
  ok(npm(['exec', '--offline', '--', 'sheriff', '--tool', 'both', '--local', '--silent']));

  const packageRoot = path.join(f.project, 'node_modules', pkg.name);
  const installed = JSON.parse(read(path.join(packageRoot, 'package.json')));
  assert.equal(installed.dependencies?.[pkg.name], undefined);
  assert.equal(fs.existsSync(path.join(packageRoot, 'node_modules', pkg.name)), false);
  const cli = path.join(packageRoot, 'dist/codex/bin/sheriff-tools.js');
  ok(f.run(cli, ['init-project']));
  ok(f.run(cli, ['write-config'], f.project, JSON.stringify({ language: 'ts' })));
  ok(f.run(cli, ['write-handoff', 'restore'], f.project, 'Keep the interrupted test task.'));
  const tracked = ['package.json', 'package-lock.json', '.agents/skills/sheriff/SKILL.md', '.claude/settings.json', '.claude/commands/sheriff/run.md', '.sheriff/.sheriff.json', '.sheriff/handoffs/handoff-restore.md'];
  const before = tracked.map((file) => read(path.join(f.project, file)));

  fs.rmSync(path.join(f.project, 'node_modules'), { recursive: true });
  assert.equal(fs.existsSync(cli), false);
  ok(npm(['ci', ...npmFlags]));
  assert.deepEqual(tracked.map((file) => read(path.join(f.project, file))), before);
  assert.equal(JSON.parse(ok(f.run(cli, ['current-version', '--raw']))).version, pkg.version);
  assert.equal(ok(f.run(cli, ['read-handoff', 'restore'])), 'Keep the interrupted test task.');
  const skill = path.join(f.project, '.agents/skills/sheriff/SKILL.md');
  const resource = read(skill).match(/\[Sheriff instructions\]\(([^)]+)\)/)[1];
  assert.ok(fs.existsSync(path.resolve(path.dirname(skill), resource)));
  assert.deepEqual(fs.readdirSync(path.dirname(skill)), ['SKILL.md']);
  const settings = JSON.parse(read(path.join(f.project, '.claude/settings.json')));
  const hook = path.join(f.project, '.claude/hooks/sheriff-statusline.js');
  assert.match(ok(f.run(hook, [], f.project, JSON.stringify({ session_id: 'restored', cwd: f.project, context_window: { remaining_percentage: 42 } }))), /42%/);
  assert.ok(settings.statusLine.command.includes('sheriff-statusline.js'));
});

test('local registration uses the installed package version and rejects inconsistent built runtime metadata', (t) => {
  const f = fixture(t);
  const dependency = installPackage(f.project);
  const version = '9.8.7-project';
  for (const relative of ['package.json', 'dist/claude/package.json', 'dist/codex/package.json']) {
    const file = path.join(dependency, relative);
    const metadata = JSON.parse(read(file));
    fs.writeFileSync(file, JSON.stringify({ ...metadata, version }));
  }
  const skill = path.join(dependency, 'dist/codex/SKILL.md');
  fs.writeFileSync(skill, read(skill).replace(/^description:.*$/m, 'description: Installed dependency metadata wins'));
  const installer = path.join(ROOT, 'bin/install.js');
  assert.match(ok(f.run(installer, ['--tool', 'both', '--local'])), /project dependency 9\.8\.7-project/);
  const adapter = path.join(f.project, '.agents/skills/sheriff/SKILL.md');
  assert.match(read(adapter), /description: Installed dependency metadata wins/);
  const cli = path.join(dependency, 'dist/codex/bin/sheriff-tools.js');
  assert.equal(JSON.parse(ok(f.run(cli, ['current-version', '--raw']))).version, version);

  const before = read(adapter);
  fs.writeFileSync(path.join(dependency, 'dist/codex/package.json'), JSON.stringify({ name: pkg.name, version: '0.0.0' }));
  const result = f.run(installer, ['--tool', 'both', '--local', '--silent']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /mismatched codex runtime metadata/);
  assert.equal(read(adapter), before);
});

for (const existingManifest of [false, true]) {
  test(`local setup automatically installs an undeclared dependency (manifest: ${existingManifest})`, (t) => {
    const f = fixture(t);
    if (existingManifest) fs.writeFileSync(path.join(f.project, 'package.json'), '{"private":true}');
    const preload = path.join(f.dir, 'npm-stub.cjs');
    fs.writeFileSync(preload, `
      const assert = require('node:assert/strict');
      require('node:child_process').spawnSync = (command, args, options) => {
        assert.equal(command, process.platform === 'win32' ? 'npm.cmd' : 'npm');
        assert.deepEqual(args, ['install', '--prefix', '.', '--include=dev', '--no-audit', '--no-fund', '--save-dev', ${JSON.stringify(`${pkg.name}@${pkg.version}`)}]);
        assert.equal(options.cwd, process.cwd());
        require(${JSON.stringify(path.join(ROOT, 'tests/fixtures/install-package.js'))}).installPackage(process.cwd());
        return { status: 0 };
      };
    `);
    f.env.NODE_OPTIONS = `--require=${preload}`;
    ok(f.run(path.join(ROOT, 'bin/install.js'), ['--tool', 'both', '--local', '--silent']));
    assert.ok(fs.existsSync(path.join(f.project, '.agents/skills/sheriff/SKILL.md')));
    assert.ok(fs.existsSync(path.join(f.project, '.claude/settings.json')));
    assert.equal(fs.existsSync(path.join(f.project, '.sheriff-installer.lock')), false);
  });
}

test('npm failure leaves adapters untouched and releases the installer lock', (t) => {
  const f = fixture(t);
  const preload = path.join(f.dir, 'npm-failure.cjs');
  fs.writeFileSync(preload, `require('node:child_process').spawnSync = () => ({ status: 1, stderr: 'registry unavailable' });`);
  f.env.NODE_OPTIONS = `--require=${preload}`;
  const result = f.run(path.join(ROOT, 'bin/install.js'), ['--tool', 'both', '--local', '--silent']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /registry unavailable/);
  assert.deepEqual(fs.readdirSync(f.project), []);
});

test('local setup rejects a self-dependency and malformed project metadata', (t) => {
  const f = fixture(t);
  for (const metadata of [{ name: pkg.name }, null, [], '{bad json']) {
    fs.writeFileSync(path.join(f.project, 'package.json'), typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
    const result = f.run(path.join(ROOT, 'bin/install.js'), ['--tool', 'both', '--local', '--silent']);
    assert.notEqual(result.status, 0);
    assert.deepEqual(fs.readdirSync(f.project), ['package.json']);
  }
});

test('Yarn Plug’n’Play stops before dependency or adapter writes', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.project, 'package.json'), JSON.stringify({ packageManager: 'yarn@4.0.0' }));
  const preload = path.join(f.dir, 'yarn-pnp.cjs');
  fs.writeFileSync(preload, `
    require('node:child_process').spawnSync = (command, args) => {
      require('node:assert/strict').deepEqual(args, ['config', 'get', 'nodeLinker']);
      return { status: 0, stdout: 'pnp\\n' };
    };
  `);
  f.env.NODE_OPTIONS = `--require=${preload}`;
  const result = f.run(path.join(ROOT, 'bin/install.js'), ['--tool', 'both', '--local', '--silent']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Plug’n’Play/);
  assert.deepEqual(fs.readdirSync(f.project), ['package.json']);
});
