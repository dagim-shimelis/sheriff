'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const installer = path.join(ROOT, 'bin/install.js');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-test-'));
  const home = path.join(dir, 'home');
  const project = path.join(dir, "project with 'quotes' and spaces");
  fs.mkdirSync(home); fs.mkdirSync(project);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, HOME: home, USERPROFILE: home, NODE_PATH: '', HOOK_DATA: '', TMPDIR: dir, TMP: dir, TEMP: dir };
  const run = (file, args = [], input = '') => spawnSync(process.execPath, [file, ...args], { cwd: project, env, input, encoding: 'utf8', timeout: 10000 });
  return { dir, home, project, env, run, setup: (...args) => run(installer, args) };
}
function ok(result) { assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout; }
function put(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
function json(file) { return JSON.parse(read(file)); }
function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? markdownFiles(full) : entry.name.endsWith('.md') ? [full] : [];
  });
}

for (const scope of ['local', 'global']) {
  test(`Codex ${scope}: self-contained install, relative references, update and uninstall`, (t) => {
    const f = fixture(t);
    const base = scope === 'local' ? f.project : f.home;
    const skill = path.join(base, '.agents/skills/sheriff');
    ok(f.setup('--tool', 'codex', `--${scope}`, '--silent'));
    assert.ok(fs.existsSync(path.join(skill, 'SKILL.md')));
    assert.equal(fs.existsSync(path.join(base, '.claude')), false);
    for (const file of markdownFiles(skill)) {
      const content = read(file);
      assert.doesNotMatch(content, /~?\/?.claude\/sheriff|@~\/|Task\(|\{INSTALL_(TOOL|SCOPE)\}|\{SHERIFF_RUNTIME\}/);
      assert.equal(content.includes(f.dir), false, 'installed content must survive moving the project');
    }
    for (const match of read(path.join(skill, 'SKILL.md')).matchAll(/\]\(([^)]+)\)/g)) {
      assert.ok(fs.existsSync(path.join(skill, match[1])), `Missing skill resource ${match[1]}`);
    }
    for (const file of fs.readdirSync(path.join(skill, 'commands'))) {
      const content = read(path.join(skill, 'commands', file));
      const relative = content.match(/Read `([^`]+runtime.md)` relative/)[1];
      assert.equal(fs.realpathSync(path.join(skill, 'commands', relative)), fs.realpathSync(path.join(skill, 'runtime.md')));
    }
    assert.match(read(path.join(skill, 'commands/update.md')), new RegExp(`--tool codex --${scope} --silent`));
    const cli = path.join(skill, 'bin/sheriff-tools.js');
    assert.equal(JSON.parse(ok(f.run(cli, ['current-version', '--raw']))).version, require('../package.json').version);
    ok(f.run(cli, ['init-project']));
    ok(f.run(cli, ['write-config'], JSON.stringify({ language: 'ts', models: { light: 'inherit', medium: 'inherit', heavy: 'inherit' } })));
    assert.equal(JSON.parse(ok(f.run(cli, ['read-config']))).language, 'ts');
    ok(f.run(cli, ['write-handoff', 'executor-1'], 'Resume with test assertions.'));
    assert.equal(ok(f.run(cli, ['read-handoff', 'executor-1'])), 'Resume with test assertions.');
    put(path.join(f.project, 'tests/example.test.js'), 'keep tests');
    put(path.join(skill, 'commands/help.md'), 'old version');
    ok(f.setup('--tool=codex', `--${scope}`, '--silent'));
    assert.notEqual(read(path.join(skill, 'commands/help.md')), 'old version');
    assert.equal(ok(f.run(cli, ['read-handoff', 'executor-1'])), 'Resume with test assertions.');
    ok(f.setup('--tool', 'codex', `--${scope}`, '--uninstall', '--silent'));
    assert.equal(fs.existsSync(skill), false);
    assert.equal(read(path.join(f.project, 'tests/example.test.js')), 'keep tests');
    assert.equal(json(path.join(f.project, '.sheriff/.sheriff.json')).language, 'ts');
    ok(f.setup('--tool', 'codex', `--${scope}`, '--uninstall', '--silent'));
  });
}

test('both integrations share state, preserve unrelated Claude settings, and uninstall independently', (t) => {
  const f = fixture(t);
  const settingsFile = path.join(f.project, '.claude/settings.json');
  const otherHook = { type: 'command', command: 'echo keep-me' };
  const original = { permissions: { allow: ['Read'] }, statusLine: { type: 'command', command: 'echo custom-status' }, hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [otherHook] }] } };
  put(settingsFile, JSON.stringify(original));
  put(path.join(f.project, '.claude/agents/sheriff-personal.md'), 'personal agent');
  ok(f.setup('--tool', 'claude,codex', '--local', '--silent'));
  ok(f.setup('--tool', 'both', '--local', '--silent'));
  const settings = json(settingsFile);
  assert.deepEqual(settings.permissions, original.permissions);
  assert.deepEqual(settings.statusLine, original.statusLine);
  assert.equal(settings.hooks.PostToolUse.length, 2);
  assert.deepEqual(settings.hooks.PostToolUse[0], original.hooks.PostToolUse[0]);
  assert.equal(settings.hooks.PostToolUse[1].hooks[0].type, 'command');
  const claudeCli = path.join(f.project, '.claude/sheriff/bin/sheriff-tools.js');
  const codexCli = path.join(f.project, '.agents/skills/sheriff/bin/sheriff-tools.js');
  ok(f.run(claudeCli, ['init-project']));
  ok(f.run(claudeCli, ['write-handoff', 'shared'], 'resume from either tool'));
  assert.equal(ok(f.run(codexCli, ['read-handoff', 'shared'])), 'resume from either tool');
  assert.match(read(path.join(f.project, '.claude/commands/sheriff/update.md')), /--tool claude --local --silent/);
  ok(f.setup('--tool', 'claude', '--local', '--uninstall', '--silent'));
  assert.deepEqual(json(settingsFile), original);
  assert.equal(read(path.join(f.project, '.claude/agents/sheriff-personal.md')), 'personal agent');
  assert.ok(fs.existsSync(codexCli));
  ok(f.setup('--tool', 'codex', '--local', '--uninstall', '--silent'));
  assert.equal(read(path.join(f.project, '.sheriff/handoffs/handoff-shared.md')), 'resume from either tool');
});

test('legacy scoped invocation still targets Claude, and legacy hooks migrate once', (t) => {
  const f = fixture(t);
  const dir = path.join(f.home, '.claude');
  const settingsFile = path.join(dir, 'settings.json');
  put(settingsFile, JSON.stringify({ hooks: {
    PostToolUse: [{ command: `node ${dir}/hooks/sheriff-context-monitor.js` }],
    Statusline: [{ command: `node ${dir}/hooks/sheriff-statusline.js` }],
  } }));
  ok(f.setup('--global', '--silent'));
  const settings = json(settingsFile);
  assert.equal(settings.hooks.Statusline, undefined);
  assert.equal(settings.hooks.PostToolUse.length, 1);
  assert.equal(settings.statusLine.type, 'command');
  assert.ok(fs.existsSync(path.join(dir, 'commands/sheriff/run.md')));
  assert.equal(fs.existsSync(path.join(f.home, '.agents')), false);
  ok(f.setup('--global', '--uninstall', '--silent'));
  assert.deepEqual(json(settingsFile), {});
});

test('bad arguments fail before any installation', (t) => {
  const f = fixture(t);
  for (const args of [[], ['--tool'], ['--tool='], ['--tool', 'cursor', '--local'], ['--tool', 'codex'], ['--local', '--global'], ['--typo'], ['--tool', 'codex', '--tool', 'claude']]) {
    assert.notEqual(f.setup(...args).status, 0, JSON.stringify(args));
    assert.deepEqual(fs.readdirSync(f.project), []);
    assert.deepEqual(fs.readdirSync(f.home), []);
  }
  assert.match(ok(f.setup('--help')), /--tool/);
});

test('malformed Claude settings prevent writes even when Codex is selected first', (t) => {
  const f = fixture(t);
  const file = path.join(f.project, '.claude/settings.json');
  for (const content of ['{broken', 'null', '[]', '{"hooks":[]}', '{"hooks":{"PostToolUse":{}}}']) {
    put(file, content);
    assert.notEqual(f.setup('--tool', 'codex,claude', '--local', '--silent').status, 0);
    assert.equal(read(file), content);
    assert.equal(fs.existsSync(path.join(f.project, '.agents')), false);
    assert.equal(fs.existsSync(path.join(f.project, '.claude/sheriff')), false);
  }
});

test('unrelated skill directories and symlinks are preserved', (t) => {
  const f = fixture(t);
  const skill = path.join(f.project, '.agents/skills/sheriff');
  put(path.join(skill, 'SKILL.md'), 'someone else owns this');
  for (const extra of [[], ['--uninstall']]) {
    assert.notEqual(f.setup('--tool', 'codex', '--local', ...extra).status, 0);
    assert.equal(read(path.join(skill, 'SKILL.md')), 'someone else owns this');
  }
  fs.rmSync(skill, { recursive: true });
  fs.symlinkSync(f.home, skill, 'dir');
  assert.notEqual(f.setup('--tool', 'codex', '--local', '--silent').status, 0);
  assert.deepEqual(fs.readdirSync(f.home), []);
});

test('installed runtime can claim, complete, update coverage and preserve handoffs', (t) => {
  const f = fixture(t);
  ok(f.setup('--tool', 'codex', '--local', '--silent'));
  const cli = path.join(f.project, '.agents/skills/sheriff/bin/sheriff-tools.js');
  ok(f.run(cli, ['init-project']));
  put(path.join(f.project, '.sheriff/PHASES.md'), '# Phases\n| ID | Title | Status | Tests |\n| 1.1 | utilities | [ ] | 0 |\n\n### 1.1\n```\nlock: —\nlock_time: —\n```\n');
  put(path.join(f.project, '.sheriff/TEST_MAP.md'), '| Area | File | Unit | E2E | Complexity | Notes |\n|------|------|------|-----|------------|-------|\n| util | src/add.js | ❌ needed | — N/A | low | |\n');
  assert.equal(JSON.parse(ok(f.run(cli, ['claim-subphase', '1.1', 'executor-1', '--raw']))).success, true);
  assert.match(read(path.join(f.project, '.sheriff/PHASES.md')), /lock: executor-1/);
  assert.equal(JSON.parse(ok(f.run(cli, ['mark-complete', '1.1', 'pass', '--raw']))).success, true);
  assert.match(read(path.join(f.project, '.sheriff/PHASES.md')), /✅/);
  assert.equal(JSON.parse(ok(f.run(cli, ['update-testmap', 'src/add.js', 'unit', 'tested', '--raw']))).success, true);
  assert.match(read(path.join(f.project, '.sheriff/TEST_MAP.md')), /✅/);
  assert.equal(JSON.parse(ok(f.run(cli, ['git-commit', '1.1', '--raw']))).skipped, true);
});

test('Claude hooks accept stdin, preserve quoted paths, and report context warnings', (t) => {
  const f = fixture(t);
  ok(f.setup('--tool', 'claude', '--local', '--silent'));
  const settings = json(path.join(f.project, '.claude/settings.json'));
  const cli = path.join(f.project, '.claude/sheriff/bin/sheriff-tools.js');
  ok(f.run(cli, ['init-project']));
  ok(f.run(cli, ['write-config'], '{}'));
  put(path.join(f.project, '.sheriff/PHASES.md'), '## Phase 1\n| 1.1 | tests | 🔒 | 0 |');
  const data = { session_id: 'isolated-session', cwd: f.project, context_window: { remaining_percentage: 24 } };
  const env = { ...process.env, HOOK_DATA: '', TMPDIR: f.dir, TMP: f.dir, TEMP: f.dir };
  const hook = (command, input) => spawnSync(command, { shell: true, cwd: f.project, env, input: JSON.stringify(input), encoding: 'utf8', timeout: 10000 });
  assert.match(ok(hook(settings.statusLine.command, data)), /24%/);
  const monitor = settings.hooks.PostToolUse[0].hooks[0].command;
  for (let i = 0; i < 4; i++) assert.equal(ok(hook(monitor, data)), '');
  const warning = JSON.parse(ok(hook(monitor, data))).hookSpecificOutput;
  assert.equal(warning.hookEventName, 'PostToolUse');
  assert.match(warning.additionalContext, /24%/);
  assert.equal(ok(hook(monitor, { session_id: '../unexpected' })), '');
  assert.equal(ok(f.run(path.join(f.project, '.claude/hooks/sheriff-context-monitor.js'), [], '{bad JSON')), '');
});

test('published tarball includes the Codex integration and installs without package dependencies', (t) => {
  const f = fixture(t);
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, 'Run packaging checks through npm test.');
  const packed = spawnSync(process.execPath, [npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', f.dir], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  const manifest = JSON.parse(ok(packed))[0];
  const files = manifest.files.map((file) => file.path);
  for (const expected of ['LICENSE', 'integrations/codex/SKILL.md', 'sheriff/runtime.md', 'bin/install.js', 'workflows/run.md', 'hooks/dist/sheriff-context-monitor.js']) assert.ok(files.includes(expected), expected);
  assert.equal(files.some((file) => file.startsWith('tests/') || file.startsWith('node_modules/')), false);
  const installed = spawnSync(process.execPath, [npmCli, 'exec', '--offline', '--yes',
    `--package=${path.join(f.dir, manifest.filename)}`, '--', 'sheriff', '--tool', 'both', '--local', '--silent'], {
    cwd: f.project,
    env: { ...f.env, npm_config_cache: path.join(f.dir, 'npm-cache') },
    encoding: 'utf8', timeout: 30000,
  });
  ok(installed);
  assert.ok(fs.existsSync(path.join(f.project, '.claude/commands/sheriff/run.md')));
  const cli = path.join(f.project, '.agents/skills/sheriff/bin/sheriff-tools.js');
  ok(f.run(cli, ['init-project']));
  assert.deepEqual(JSON.parse(ok(f.run(cli, ['get-status']))), { initialized: false });
});
