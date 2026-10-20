'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildRuntime } = require('../scripts/build-runtime');
const pkg = require('../package.json');

function snapshot(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? snapshot(file, base) : [[path.relative(base, file), fs.readFileSync(file, 'utf8')]];
  });
}

test('package runtimes are portable, deterministic, and run against project state', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-build-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const destination = path.join(directory, 'package/dist');
  const project = path.join(directory, 'project');
  fs.mkdirSync(project);
  buildRuntime(destination);
  const first = snapshot(destination);
  fs.writeFileSync(path.join(destination, 'codex/stale.md'), 'remove stale generated files');
  buildRuntime(destination);
  assert.deepEqual(snapshot(destination), first);

  for (const tool of ['claude', 'codex']) {
    const runtime = path.join(destination, tool);
    const { files, ...metadata } = JSON.parse(fs.readFileSync(path.join(runtime, 'package.json'), 'utf8'));
    assert.deepEqual(metadata, { name: pkg.name, version: pkg.version });
    assert.deepEqual(files, snapshot(runtime).map(([file]) => file.split(path.sep).join('/')).filter((file) => file !== 'package.json').sort());
    assert.ok(files.includes('bin/lib/config.js'));
    assert.match(fs.readFileSync(path.join(runtime, 'runtime.md'), 'utf8'), new RegExp(`Tool: ${tool}\\nInstall scope: local`));
    for (const [file, content] of snapshot(runtime)) {
      if (!file.endsWith('.md')) continue;
      assert.doesNotMatch(content, /\{INSTALL_(TOOL|SCOPE)\}|\{SHERIFF_RUNTIME\}/);
      assert.equal(content.includes(directory), false, `${file} must remain relocatable`);
      if (tool === 'codex') assert.doesNotMatch(content, /\/sheriff:/);
      if (file.startsWith('commands' + path.sep)) {
        const reference = content.match(/Read `([^`]+runtime.md)` relative/)[1];
        assert.equal(path.resolve(runtime, path.dirname(file), reference), path.join(runtime, 'runtime.md'));
      }
    }
    if (tool === 'codex') {
      const skill = fs.readFileSync(path.join(runtime, 'SKILL.md'), 'utf8');
      for (const match of skill.matchAll(/\]\(([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(runtime, match[1])), match[1]);
    }
    const cli = path.join(runtime, 'bin/sheriff-tools.js');
    const run = (...args) => {
      const result = spawnSync(process.execPath, [cli, ...args, '--raw'], { cwd: project, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return JSON.parse(result.stdout);
    };
    assert.equal(run('current-version').version, pkg.version);
    run('init-project');
    assert.ok(fs.existsSync(path.join(project, '.sheriff')));
    assert.equal(fs.existsSync(path.join(runtime, '.sheriff')), false);
  }
});
