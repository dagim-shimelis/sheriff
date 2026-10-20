#!/usr/bin/env node
'use strict';

// Opt-in: invokes real host sessions and consumes normal model usage.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { sessionResult } = require('./session-result');

const root = path.resolve(__dirname, '../..');
const host = process.argv[2];
assert.ok(['codex', 'claude'].includes(host), 'Choose codex or claude');
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), `sheriff-${host}-live-`));
const project = path.join(evidence, 'project');
const skill = path.join(project, host === 'codex' ? '.agents/skills/sheriff' : '.claude/sheriff');
const adapters = host === 'codex' ? skill : path.join(project, '.claude');
const runtimeRoot = path.join(project, 'node_modules/@dagim_codes/sheriff/dist', host);
const cli = path.join(runtimeRoot, 'bin/sheriff-tools.js');
const report = { host, startedAt: new Date().toISOString(), evidence, checks: [], sessions: [] };
const fixedDiscount = 'export function discount(price, percent) { return price * (1 - percent / 100); }\n';
const brokenDiscount = fixedDiscount.replace('/ 100)', '/ 1000)');
const originalLabel = "export function label(text) { return text.trim().toLowerCase().replace(/\\s+/g, '-'); }\n";
const updatedLabel = "export function label(text, separator = '-') { return text.trim().toLowerCase().replace(/\\s+/g, separator); }\n";
let child;
let interrupted = false;

function stopChild(signal) {
  if (!child?.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) { if (error.code !== 'ESRCH') throw error; }
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function read(file) { return fs.readFileSync(file, 'utf8'); }
function hash(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function files(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(item =>
    item.isDirectory() ? files(path.join(dir, item.name)) : [path.join(dir, item.name)]) : [];
}
function run(bin, args, cwd = project, extra = {}) {
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', timeout: 30000, ...extra });
  if (result.error) throw result.error;
  return result;
}
function ok(result) { assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout; }
function runtime(...args) { return ok(run(process.execPath, [cli, ...args, '--raw'])); }
function check(name, fn) {
  try { fn(); report.checks.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, pass: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
  save();
}
function save() { write(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
function suite(name) {
  const selected = files(path.join(project, 'tests')).filter(file => file.endsWith('.test.js'));
  assert.ok(selected.length > 0, 'Fixture must contain tests');
  const result = run(process.execPath, ['--test', ...selected]);
  write(path.join(evidence, `${name}.tap`), result.stdout + result.stderr);
  assert.match(result.stdout, /# tests [1-9]\d*/);
  return result;
}
function plan() { return require(path.join(runtimeRoot, 'bin/lib/phases.js')).parseSubphases(read(path.join(project, '.sheriff/PHASES.md'))); }
function phaseFor(source) { return plan().find(phase => phase.block.includes(`source: ${source}`)); }
function snapshots(dir) { return Object.fromEntries(files(dir).map(file => [path.relative(dir, file), hash(file)])); }

async function session(name, prompt) {
  assert.equal(interrupted, false, 'Live test interrupted');
  console.log(`START ${name}`);
  const start = Date.now();
  const logPath = path.join(evidence, `${name}.jsonl`);
  const out = fs.openSync(logPath, 'w');
  const err = fs.openSync(path.join(evidence, `${name}.stderr`), 'w');
  const args = host === 'codex'
    ? ['exec', '--ignore-user-config', '--sandbox', 'workspace-write', '--ephemeral', '--json',
      '-C', project, '-o', path.join(evidence, `${name}.md`), '-']
    : ['--print', '--output-format', 'stream-json', '--verbose', '--include-hook-events', '--no-session-persistence',
      '--setting-sources', 'project,local', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-chrome',
      '--permission-mode', 'acceptEdits', '--permission-prompts', 'none',
      '--tools', 'Read,Write,Edit,Bash,Glob,Grep,Skill', '--allowedTools', 'Read,Write,Edit,Bash,Glob,Grep,Skill',
      '--settings', JSON.stringify({ sandbox: { enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false, failIfUnavailable: true } })];
  if (host === 'claude') prompt = prompt.replaceAll('$sheriff ', '/sheriff:');
  const instruction = `${prompt}\n\nThis is a disposable acceptance-test project. Follow its AGENTS.md. Work only here. No commits, dependency installs, network research, or changes to src/, README.md, package.json, package-lock.json, node_modules/, .agents/, .claude/, AGENTS.md, CLAUDE.md, or personal-notes.txt. Use the installed Sheriff integration and actual runner evidence. All preferences are supplied; do not wait for questions. Skip the optional registry update check. Do not delegate.\n`;
  write(path.join(evidence, `${name}.prompt.txt`), instruction);
  let timedOut = false;
  let timeout, killTimer, heartbeat;
  try {
    child = spawn(host, args, { cwd: project, detached: process.platform !== 'win32', stdio: ['pipe', out, err] });
    timeout = setTimeout(() => { timedOut = true; stopChild('SIGTERM'); killTimer = setTimeout(() => stopChild('SIGKILL'), 5000); }, 600000);
    heartbeat = setInterval(() => console.log(`RUNNING ${name} (${Math.round((Date.now() - start) / 1000)}s)`), 30000);
    const completed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
    child.stdin.on('error', () => {});
    child.stdin.end(instruction);
    const result = await completed;
    const events = read(logPath).split('\n').filter(Boolean).map(line => JSON.parse(line));
    const parsed = sessionResult(host, events, result.code);
    report.sessions.push({ name, ...result, timedOut, seconds: Math.round((Date.now() - start) / 1000), ...parsed });
    if (host === 'claude') write(path.join(evidence, `${name}.md`), parsed.text);
    if (parsed.error && /organization has disabled|not logged in|invalid api key|authentication/i.test(parsed.error)) {
      report.blocked = { stage: name, reason: parsed.error };
    }
    save();
    assert.equal(timedOut, false, `${name} timed out`);
    assert.ok(!parsed.error, `${name}: ${parsed.error || read(path.join(evidence, `${name}.stderr`))}`);
    console.log(`DONE ${name}`);
    return read(logPath);
  } finally {
    clearTimeout(timeout); clearTimeout(killTimer); clearInterval(heartbeat);
    child = null; fs.closeSync(out); fs.closeSync(err);
  }
}

async function main() {
  console.log(`Evidence: ${evidence}`);
  fs.mkdirSync(project);
  report.commit = ok(run('git', ['rev-parse', 'HEAD'], root)).trim();
  report.hostVersion = ok(run(host, ['--version'])).trim();
  report.node = process.version;
  write(path.join(project, 'package.json'), JSON.stringify({ name: 'sheriff-live-fixture', private: true, type: 'module', scripts: { test: 'node --test tests/*.test.js' } }, null, 2));
  write(path.join(project, '.gitignore'), 'node_modules/\n.agents/\n.claude/\n.sheriff/\n');
  write(path.join(project, 'AGENTS.md'), '# Fixture boundaries\nUse node:test and node:assert/strict. Unit tests only. Existing npm test command works without dependencies. Source behavior is specified in README.md. Sheriff policy: flag source defects, never change source. Work sequentially. Preserve all original tests and personal-notes.txt. Do not commit, install packages, or modify installed skills.\n');
  if (host === 'claude') write(path.join(project, 'CLAUDE.md'), 'Read and follow AGENTS.md for fixture boundaries.\n');
  write(path.join(project, 'README.md'), '# Utility contract\n- add(a, b): arithmetic sum of two numbers.\n- discount(price, percent): final price after a percentage discount; discount(100, 20) must equal 80, discount(50, 100) must equal 0. Inputs are finite prices >= 0 and percentages from 0 to 100.\n- label(text): trim surrounding whitespace, lowercase, and replace each run of whitespace with one hyphen; empty input returns empty string.\n');
  write(path.join(project, 'src/add.js'), 'export function add(a, b) { return a + b; }\n');
  write(path.join(project, 'src/discount.js'), brokenDiscount);
  write(path.join(project, 'src/label.js'), originalLabel);
  write(path.join(project, 'tests/add.test.js'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/add.js';\ntest('existing addition regression', () => { assert.equal(add(2, 3), 5); assert.equal(add(-2, 2), 0); });\n");
  write(path.join(project, 'personal-notes.txt'), 'Original personal note.\n');
  ok(run('git', ['init', '-q']));
  ok(run('git', ['add', '--', 'package.json', '.gitignore', 'AGENTS.md', 'README.md', 'src', 'tests', 'personal-notes.txt', ...(host === 'claude' ? ['CLAUDE.md'] : [])]));
  ok(run('git', ['-c', 'user.name=Sheriff Live Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Fixture baseline', '--no-gpg-sign']));
  write(path.join(project, 'personal-notes.txt'), 'Unrelated uncommitted personal note: preserve exactly.\n');
  const personalHash = hash(path.join(project, 'personal-notes.txt'));
  const originalTest = read(path.join(project, 'tests/add.test.js'));
  const head = ok(run('git', ['rev-parse', 'HEAD']));
  const initialSources = snapshots(path.join(project, 'src'));
  check('fixture baseline executes a passing test', () => ok(suite('baseline')));
  assert.equal(report.checks.at(-1).pass, true, 'Fix fixture baseline before starting paid model sessions');
  // npm pack runs prepack. Install a real project dependency before registering adapters.
  const npm = process.env.npm_execpath;
  assert.ok(npm, `Run via npm run test:live:${host}`);
  const packed = ok(run(process.execPath, [npm, 'pack', '--json', '--pack-destination', evidence], root));
  const metadata = JSON.parse(packed.slice(packed.indexOf('[\n')))[0];
  report.tarball = { filename: metadata.filename, integrity: metadata.integrity };
  ok(run(process.execPath, [npm, 'install', '--offline', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund', path.join(evidence, metadata.filename)], project,
    { env: { ...process.env, npm_config_cache: path.join(evidence, 'npm-cache') } }));
  ok(run(process.execPath, [npm, 'exec', '--offline', '--', 'sheriff', '--tool', host, '--local', '--silent'], project,
    { env: { ...process.env, npm_config_cache: path.join(evidence, 'npm-cache') } }));
  check(`packed npm package installs its ${host} integration`, () => assert.ok(fs.existsSync(path.join(project,
    host === 'codex' ? '.agents/skills/sheriff/SKILL.md' : '.claude/commands/sheriff/help.md'))));
  const installedFiles = snapshots(adapters);
  const runtimeFiles = snapshots(runtimeRoot);
  report.baseline = { sources: initialSources, installedFiles, runtimeFiles, personalHash, originalTest, head };
  save();

  const help = await session('01-help', '$sheriff help\nShow the installed Sheriff operations. Do not start work yet.');
  check(`${host} discovers its installed integration and executes help`, () => {
    // Explicit skills are injected by Codex; a separate SKILL.md shell read is not required.
    assert.match(help, new RegExp(`dist/${host}/runtime\\.md`));
    if (host === 'codex') assert.match(help, /commands\/help\.md/);
    else assert.match(help, /sheriff:help/);
    assert.match(help, /current-version/);
  });
  await session('02-run', '$sheriff run --no-audit\nPerform the full workflow. Preferences: unit tests only, existing node:test runner, src source directory, risk strategy, onTestFailure flag, one sequential worker, inherit models. Preserve all existing tests. Continue independent work if a source defect causes tests to fail.');
  check('onboarding writes valid complete config', () => {
    const config = JSON.parse(runtime('read-config'));
    assert.equal(config.onTestFailure, 'flag'); assert.equal(config.testTypes.e2e, false);
    assert.equal(JSON.parse(runtime('check-config-version')).needsMigration, false);
  });
  check('run creates a coverage map and terminal execution evidence', () => {
    const map = read(path.join(project, '.sheriff/TEST_MAP.md'));
    for (const source of Object.keys(initialSources)) assert.ok(map.includes(source));
    assert.ok(plan().length >= 2);
    assert.ok(plan().every(phase => ['pass', 'fail', 'review'].includes(phase.status)));
    assert.ok(files(path.join(project, '.sheriff/results')).length >= 2);
    assert.ok(files(path.join(project, '.sheriff/summaries')).length >= 1);
  });
  check('run exposes the seeded discount bug and preserves source', () => {
    assert.deepEqual(snapshots(path.join(project, 'src')), initialSources);
    assert.equal(phaseFor('src/discount.js')?.status, 'fail');
    assert.equal(phaseFor('src/label.js')?.status, 'pass');
    assert.notEqual(suite('after-run').status, 0);
    write(path.join(project, 'src/discount.js'), fixedDiscount);
    try { ok(suite('discount-fixed-oracle')); }
    finally { write(path.join(project, 'src/discount.js'), brokenDiscount); }
  });
  const testsBeforeAudit = snapshots(path.join(project, 'tests'));
  await session('03-audit', '$sheriff audit\nAudit the fixture against README.md. Policy remains flag: write findings without modifying source or tests.');
  check('audit reports the percentage bug without source fixes', () => {
    const audits = files(path.join(project, '.sheriff/audits')).map(read).join('\n');
    assert.match(audits, /discount/i); assert.match(audits, /1000/);
    assert.deepEqual(snapshots(path.join(project, 'src')), initialSources);
    assert.deepEqual(snapshots(path.join(project, 'tests')), testsBeforeAudit);
  });

  // Controlled pause: reopen a completed independent item, then let the host save/resume the handoff.
  const retry = phaseFor('src/label.js');
  assert.ok(retry, 'Cannot test resume without the label subphase');
  runtime('release-subphase', retry.id, '--force');
  const remainingResults = snapshots(path.join(project, '.sheriff/results'));
  await session('04-pause', `$sheriff run --no-audit\nRecovery drill: inspect the pending ${retry.id} subphase and existing tests, claim it, then deliberately pause before executing tests. Save a handoff keyed by ${retry.id} describing the verified existing tests and a whitespace edge case to check on resume. Release your own stopped claim to pending and end this invocation. Do not produce a terminal result or resume in this invocation.`);
  check('pause persists a handoff and releases its claim', () => {
    assert.ok(fs.existsSync(path.join(project, `.sheriff/handoffs/handoff-${retry.id}.md`)));
    assert.equal(plan().find(phase => phase.id === retry.id)?.status, 'pending');
    assert.ok(!plan().some(phase => phase.status === 'in_progress'));
  });
  const resumed = await session('05-resume', '$sheriff run --no-audit\nResume pending work from its handoff. Preserve terminal failures; they are not an explicit retry request.');
  check(`fresh ${host} session resumes handoff without retrying terminal failures`, () => {
    assert.ok(resumed.includes(`handoff-${retry.id}`) || resumed.includes(`read-handoff ${retry.id}`));
    assert.equal(plan().find(phase => phase.id === retry.id)?.status, 'pass');
    for (const [file, digest] of Object.entries(remainingResults)) assert.equal(hash(path.join(project, '.sheriff/results', file)), digest);
  });

  // Simulate a developer fixing the known bug and adding a documented behavior.
  write(path.join(project, 'src/discount.js'), fixedDiscount);
  write(path.join(project, 'src/label.js'), updatedLabel);
  fs.appendFileSync(path.join(project, 'README.md'), '\nChanged requirement: label(text, separator = "-") accepts an optional separator; label("Hello World", "_") returns "hello_world". Default behavior is unchanged.\n');
  const changedSources = snapshots(path.join(project, 'src'));
  await session('06-sync', '$sheriff sync --no-audit\nSynchronize tests for the current working-tree source changes and README contract. The developer fixed discount and added the optional label separator. Keep policy flag.');
  check('sync executes a passing full suite and preserves developer source edits', () => {
    ok(suite('after-sync'));
    assert.deepEqual(snapshots(path.join(project, 'src')), changedSources);
    assert.ok(files(path.join(project, '.sheriff/sync')).length > 0);
  });
  check('sync adds regression protection for the new separator behavior', () => {
    write(path.join(project, 'src/label.js'), originalLabel);
    try { assert.notEqual(suite('separator-mutation').status, 0, 'Tests did not detect removal of the new behavior'); }
    finally { write(path.join(project, 'src/label.js'), updatedLabel); }
  });
  const stateBeforeStatus = snapshots(path.join(project, '.sheriff'));
  await session('07-status', '$sheriff status\nReport current plan and coverage-map evidence, distinguishing historical failures from the latest sync results. Do not modify anything.');
  check('status distinguishes historical failure from sync results without changing state', () => {
    const status = read(path.join(evidence, '07-status.md'));
    assert.match(status, /fail|❌/i); assert.match(status, /sync/i);
    assert.deepEqual(snapshots(path.join(project, '.sheriff')), stateBeforeStatus);
  });
  check('user work, original tests, Git history, and installed skill are preserved', () => {
    assert.equal(hash(path.join(project, 'personal-notes.txt')), personalHash);
    assert.ok(read(path.join(project, 'tests/add.test.js')).includes(originalTest), 'Original test must survive; appending cases is allowed');
    assert.equal(ok(run('git', ['rev-parse', 'HEAD'])), head);
    assert.equal(ok(run('git', ['diff', '--cached', '--name-only'])).trim(), '');
    assert.deepEqual(snapshots(adapters), installedFiles);
    assert.deepEqual(snapshots(runtimeRoot), runtimeFiles);
  });
  check('uninstall preserves generated tests and project state', () => {
    const tests = snapshots(path.join(project, 'tests'));
    const state = snapshots(path.join(project, '.sheriff'));
    ok(run(process.execPath, [npm, 'exec', '--offline', '--', 'sheriff', '--tool', host, '--local', '--uninstall', '--silent'], project,
      { env: { ...process.env, npm_config_cache: path.join(evidence, 'npm-cache') } }));
    assert.ok(!fs.existsSync(skill));
    assert.deepEqual(snapshots(runtimeRoot), runtimeFiles);
    assert.deepEqual(snapshots(path.join(project, 'tests')), tests);
    assert.deepEqual(snapshots(path.join(project, '.sheriff')), state);
  });
}

process.once('SIGINT', () => { interrupted = true; stopChild('SIGTERM'); process.exitCode = 130; });
main().catch(error => { report.error = error.stack; console.error(error.message); process.exitCode = 1; }).finally(() => {
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.filter(check => check.pass).length;
  report.failed = report.checks.filter(check => !check.pass).length;
  report.outcome = report.blocked ? 'blocked' : report.error || report.failed ? 'failed' : 'passed';
  if (report.failed) process.exitCode = 1;
  save();
  console.log(`Results: ${report.passed} passed, ${report.failed} failed${report.error ? ', fatal error' : ''}. ${path.join(evidence, 'report.json')}`);
});
