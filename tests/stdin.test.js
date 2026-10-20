'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const state = require('../sheriff/bin/lib/state');
const config = require('../sheriff/bin/lib/config');
const cli = path.resolve(__dirname, '../sheriff/bin/sheriff-tools.js');

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sheriff-stdin-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  state.ensureSheriffDir(cwd);
  return cwd;
}

function start(t, cwd, args, wrapper) {
  const child = spawn(process.execPath, wrapper ? ['-e', wrapper, cli, ...args] : [cli, ...args], { cwd });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => stdout += chunk);
  child.stderr.setEncoding('utf8').on('data', chunk => stderr += chunk);
  // A broken reader may exit before the delayed producer finishes.
  child.stdin.on('error', () => {});
  const result = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
  return { child, result };
}

const writes = [
  { args: ['write-config'], file: '.sheriff/.sheriff.json', content: '{"language":"TypeScript 🧪"}', json: true },
  { args: ['write-handoff', 'worker'], file: '.sheriff/handoffs/handoff-worker.md', content: 'Resume 🧪\nKeep these assertions.\n' },
  { args: ['write-result', '1.1'], file: '.sheriff/results/1-1.md', content: '## Result 🧪\nTests passed.\n' },
  { args: ['write-summary', '1'], file: '.sheriff/summaries/phase-1.md', content: '# Summary 🧪\nEvidence retained.\n' },
];

for (const { args, file, content, json } of writes) {
  test(`${args[0]} waits for delayed stdin and preserves split UTF-8`, { timeout: 10000 }, async t => {
    const cwd = fixture(t);
    const before = json ? '{"language":"before"}' : 'Previous state\n';
    state.writeFile(file, before, cwd);
    const { child, result } = start(t, cwd, [...args, '--raw']);
    const bytes = Buffer.from(content);
    const split = bytes.indexOf(Buffer.from('🧪')) + 1;
    // Leave the inherited nonblocking pipe empty before sending fragmented input.
    await delay(150);
    child.stdin.write(bytes.subarray(0, split));
    await delay(30);
    child.stdin.write(bytes.subarray(split));
    await delay(30);
    assert.equal(state.readFile(file, cwd), before, 'state must not change before EOF');
    child.stdin.end();
    const output = await result;
    assert.equal(output.code, 0, output.stderr || output.stdout);
    assert.equal(JSON.parse(output.stdout).success, true);
    if (json) assert.equal(config.readConfig(cwd).language, 'TypeScript 🧪');
    else assert.equal(state.readFile(file, cwd), content);
  });
}

test('stdin read errors leave existing state intact and return a CLI error', { timeout: 10000 }, async t => {
  const cwd = fixture(t);
  const before = '{"language":"before"}';
  state.writeFile('.sheriff/.sheriff.json', before, cwd);
  const { result } = start(t, cwd, ['write-config'], `
    setImmediate(() => process.stdin.destroy(new Error('stdin read failed')));
    require(process.argv[1]);
  `);
  const output = await result;
  assert.equal(output.code, 1);
  assert.match(output.stderr, /sheriff-tools error: stdin read failed/);
  assert.equal(state.readFile('.sheriff/.sheriff.json', cwd), before);
});
