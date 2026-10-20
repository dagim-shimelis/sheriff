'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { packageManager, installArgs } = require('../bin/lib/package-manager');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-manager-'));
  fs.mkdirSync(path.join(root, '.git'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
for (const [manager, lock] of Object.entries({ npm: 'package-lock.json', pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', bun: 'bun.lock' })) {
  test(`${manager}: detects lockfile, inherits workspace manager, and builds add/restore commands`, (t) => {
    const root = fixture(t);
    fs.writeFileSync(path.join(root, lock), '');
    assert.equal(packageManager(root), manager);
    const child = path.join(root, 'packages/app');
    fs.mkdirSync(child, { recursive: true });
    assert.equal(packageManager(child), manager);
    const spec = '@dagim_codes/sheriff@0.1.6';
    const expected = manager === 'npm' ? ['install', '--prefix', '.', '--include=dev', '--no-audit', '--no-fund', '--save-dev', spec] : ['add', manager === 'pnpm' ? '--save-dev' : '--dev', spec];
    assert.deepEqual(installArgs(manager, spec, false), expected);
    const restored = installArgs(manager, spec, true);
    assert.equal(restored[0], 'install');
    assert.equal(restored.includes(spec), false);
  });
}
test('explicit packageManager wins over stale lockfiles; ambiguity and unknown managers stop setup', (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'bun.lockb'), '');
  assert.equal(packageManager(root), 'bun');
  fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), '');
  assert.throws(() => packageManager(root), /Multiple package managers/);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.11.0' }));
  assert.equal(packageManager(root), 'pnpm');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'unknown@1.0.0' }));
  assert.throws(() => packageManager(root), /Unsupported packageManager/);
});
test('pnpm installed layout is detected without a lockfile; clean projects default to npm', (t) => {
  const root = fixture(t);
  assert.equal(packageManager(root), 'npm');
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'node_modules/.modules.yaml'), '');
  assert.equal(packageManager(root), 'pnpm');
});
