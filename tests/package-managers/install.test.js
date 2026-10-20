'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const pkg = require('../../package.json');
const managers = process.env.SHERIFF_TEST_MANAGER ? [process.env.SHERIFF_TEST_MANAGER] : ['npm', 'pnpm', 'yarn', 'bun'];
assert.ok(managers.every((manager) => ['npm', 'pnpm', 'yarn', 'bun'].includes(manager)), 'Unknown SHERIFF_TEST_MANAGER');
let directory, registry, server, tarballRequests = 0;

function run(command, args, cwd, env, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd, env, shell: process.platform === 'win32' && command !== process.execPath,
      timeout: 60000, stdio: 'pipe',
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}
function ok(result) {
  assert.equal(result.status, 0, result.stderr + result.stdout);
  return result.stdout;
}
function write(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function read(file) { return fs.readFileSync(file, 'utf8'); }

before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-real-managers-'));
  const packed = JSON.parse(ok(await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], ROOT, process.env)))[0];
  const tarball = fs.readFileSync(path.join(directory, packed.filename));
  server = http.createServer((request, response) => {
    if (request.url === '/sheriff.tgz') {
      tarballRequests++;
      response.end(tarball);
    } else if (decodeURIComponent(request.url).replace(/^\//, '') === pkg.name) {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        name: pkg.name, 'dist-tags': { latest: pkg.version },
        versions: { [pkg.version]: { ...pkg, dist: {
          tarball: `${registry}/sheriff.tgz`,
          shasum: crypto.createHash('sha1').update(tarball).digest('hex'),
        } } },
      }));
    } else {
      response.writeHead(404);
      response.end('{}');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  registry = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

for (const manager of managers) {
  for (const layout of ['standalone', 'workspace-root', 'workspace-child']) {
    test(`${manager}: real ${layout} install, both runtimes, and reinstall`, async (t) => {
      const dir = fs.mkdtempSync(path.join(directory, `${manager}-`));
      const home = path.join(dir, 'home');
      const root = path.join(dir, "project with 'quotes' and spaces");
      fs.mkdirSync(home); fs.mkdirSync(root);
      fs.mkdirSync(path.join(root, '.git'));
      const env = {
        ...process.env, HOME: home, USERPROFILE: home, NODE_PATH: '',
        npm_config_registry: registry, npm_config_cache: path.join(dir, 'npm-cache'),
        npm_config_userconfig: path.join(home, '.npmrc'),
        npm_config_audit: 'false', npm_config_fund: 'false',
        BUN_INSTALL_CACHE_DIR: path.join(dir, 'bun-cache'),
        YARN_CACHE_FOLDER: path.join(dir, 'yarn-cache'),
        YARN_GLOBAL_FOLDER: path.join(dir, 'yarn-global'),
        COREPACK_ENABLE_PROJECT_SPEC: '0', COREPACK_ENABLE_AUTO_PIN: '0',
        YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
        // Yarn Classic emits ANSI controls even when its config output is piped.
        ...(manager === 'yarn' ? { FORCE_COLOR: '1' } : {}),
      };
      const version = ok(await run(manager, ['--version'], root, env)).trim();
      t.diagnostic(`${manager} ${version}`);
      const modernYarn = manager === 'yarn' && Number(version.split('.')[0]) >= 2;
      const workspace = layout !== 'standalone';
      write(path.join(root, 'package.json'), {
        name: 'fixture-root', version: '1.0.0', private: true, packageManager: `${manager}@${version}`,
        ...(workspace ? { workspaces: ['packages/*'] } : {}),
      });
      fs.writeFileSync(path.join(root, '.npmrc'), `registry=${registry}\n` +
        (manager === 'pnpm' ? `store-dir=${path.join(dir, 'pnpm-store').split(path.sep).join('/')}\n` : ''));
      fs.writeFileSync(path.join(root, 'bunfig.toml'), `[install]\nregistry = "${registry}"\n`);
      if (modernYarn) fs.writeFileSync(path.join(root, '.yarnrc.yml'),
        `nodeLinker: node-modules\nnpmRegistryServer: "${registry}"\nunsafeHttpWhitelist:\n  - 127.0.0.1\nenableGlobalCache: false\n`);
      let project = root;
      if (workspace) {
        const child = path.join(root, 'packages', 'app');
        fs.mkdirSync(child, { recursive: true });
        write(path.join(child, 'package.json'), { name: 'fixture-app', version: '1.0.0', private: true });
        fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
        if (layout === 'workspace-child') project = child;
      }
      const setup = () => run(process.execPath, [path.join(ROOT, 'bin/install.js'), '--tool', 'both', '--local'], project, env);
      const requestsBefore = tarballRequests;
      ok(await setup());
      assert.ok(tarballRequests > requestsBefore, 'real manager must download the packed checkout');
      assert.ok(JSON.parse(read(path.join(project, 'package.json'))).devDependencies[pkg.name]);
      const skill = path.join(project, '.agents/skills/sheriff/SKILL.md');
      const instructions = path.resolve(path.dirname(skill), read(skill).match(/\[Sheriff instructions\]\(([^)]+)\)/)[1]);
      assert.ok(fs.existsSync(instructions));
      const dependency = path.resolve(path.dirname(instructions), '../..');
      const claudeCommand = path.join(project, '.claude/commands/sheriff/run.md');
      const claudeInstructions = read(claudeCommand).match(/\[Sheriff instructions\]\(([^)]+)\)/)[1];
      assert.ok(fs.existsSync(path.resolve(path.dirname(claudeCommand), claudeInstructions)));
      ok(await run(process.execPath, [path.join(dependency, 'bin/install.js'), '--tool', 'both', '--local', '--silent'], project, env));
      for (const tool of ['claude', 'codex']) {
        const cli = path.join(dependency, 'dist', tool, 'bin/sheriff-tools.js');
        assert.equal(JSON.parse(ok(await run(process.execPath, [cli, 'current-version', '--raw'], project, env))).version, pkg.version);
      }
      const cli = path.join(dependency, 'dist/codex/bin/sheriff-tools.js');
      ok(await run(process.execPath, [cli, 'init-project'], project, env));
      ok(await run(process.execPath, [cli, 'write-config'], project, env, JSON.stringify({ language: 'ts' })));
      ok(await run(process.execPath, [cli, 'write-handoff', 'restore'], project, env, 'Keep this work.'));
      const lock = { npm: 'package-lock.json', pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', bun: 'bun.lock' }[manager];
      const lockfile = [path.join(root, lock), path.join(project, lock)].find(fs.existsSync);
      assert.ok(lockfile, `${manager} must create its lockfile`);
      const tracked = [lockfile, path.join(project, 'package.json'), skill,
        claudeCommand, path.join(project, '.claude/settings.json'),
        path.join(project, '.sheriff/.sheriff.json'), path.join(project, '.sheriff/handoffs/handoff-restore.md')];
      const before = tracked.map(read);
      fs.rmSync(path.join(root, 'node_modules'), { recursive: true, force: true });
      if (project !== root) fs.rmSync(path.join(project, 'node_modules'), { recursive: true, force: true });
      assert.equal(fs.existsSync(cli), false);
      const restored = await setup();
      if (restored.status !== 0) t.diagnostic(`Lockfile before restoration:\n${before[0]}`);
      ok(restored);
      assert.deepEqual(tracked.map(read), before);
      assert.equal(ok(await run(process.execPath, [cli, 'read-handoff', 'restore'], project, env)), 'Keep this work.');
      const hook = path.join(project, '.claude/hooks/sheriff-statusline.js');
      assert.match(ok(await run(process.execPath, [hook], project, env, JSON.stringify({
        session_id: 'restored', cwd: project, context_window: { remaining_percentage: 42 },
      }))), /42%/);
      if (modernYarn && !workspace) {
        fs.rmSync(path.join(root, 'node_modules'), { recursive: true });
        fs.writeFileSync(path.join(root, '.yarnrc.yml'), read(path.join(root, '.yarnrc.yml')).replace('node-modules', 'pnp'));
        const result = await setup();
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Plug’n’Play/);
        assert.deepEqual(tracked.map(read), before);
      }
    });
  }
}
