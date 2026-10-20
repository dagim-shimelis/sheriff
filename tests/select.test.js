'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { select } = require('../bin/lib/select');

function terminal() {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isRaw = false;
  input.setRawMode = (value) => { input.isRaw = value; };
  let text = '';
  output.on('data', (chunk) => { text += chunk; });
  return { input, output, text: () => text };
}

test('arrow selection wraps, confirms, and restores terminal state between prompts', async () => {
  const f = terminal();
  const first = select('AI tools', ['Claude Code', 'Codex', 'Both'], 0, f.input, f.output);
  f.input.write('\x1b[A'); // Up wraps to Both.
  f.input.write('\r');
  assert.equal(await first, 2);
  assert.equal(f.input.isRaw, false);
  assert.equal(f.input.isPaused(), true);
  assert.equal(f.input.listenerCount('keypress'), 0);

  const second = select('Install for', ['Local', 'Global'], 1, f.input, f.output);
  f.input.write('\x1b[B'); // Down wraps to Local.
  f.input.write('\r');
  assert.equal(await second, 0);
  assert.match(f.text(), /Both/);
  assert.match(f.text(), /Local/);
  assert.equal(f.text().split('\x1b[?1049h').length - 1, 2);
  assert.equal(f.text().split('\x1b[?1049l').length - 1, 2);
  assert.match(f.text(), /Sheriff setup/);
  assert.match(f.text(), /Ctrl\+C cancel/);
  assert.ok(f.text().endsWith('\x1b[?25h'));
});

test('TTY selection has a gold background and dark foreground', async () => {
  const f = terminal();
  f.output.isTTY = true;
  const result = select('Tools', ['Claude', 'Codex'], 0, f.input, f.output);
  f.input.write('\r');
  await result;
  if (!('NO_COLOR' in process.env) && process.env.TERM !== 'dumb') {
    assert.ok(f.text().includes('\x1b[48;2;236;193;121m\x1b[38;2;32;36;29m › Claude  \x1b[0m'));
  }
});

test('Enter keeps the default and ignores ordinary typing', async () => {
  const f = terminal();
  const result = select('Tools', ['Claude', 'Codex'], 1, f.input, f.output);
  f.input.write('x\r');
  assert.equal(await result, 1);
});

test('wizard redraws within a narrow terminal after resize', async () => {
  const f = terminal();
  f.output.columns = 40;
  f.output.rows = 15;
  const result = select('Install for', ['This project (local)', 'All your projects (global)'], 0, f.input, f.output);
  f.output.columns = 30;
  f.output.rows = 12;
  f.output.emit('resize');
  const frame = f.text().split('\x1b[H\x1b[J').at(-1);
  assert.ok(frame.split('\n').length <= 12);
  assert.ok(frame.split('\n').every((line) => Array.from(line).length < 30));
  f.input.write('\r');
  assert.equal(await result, 0);
  assert.equal(f.output.listenerCount('resize'), 0);
});

test('header art fits a standard terminal and collapses on resize', async () => {
  const f = terminal();
  f.output.columns = 80;
  f.output.rows = 24;
  const result = select('AI tools', ['Claude Code', 'Codex', 'Both'], 0, f.input, f.output);
  let frame = f.text().split('\x1b[H\x1b[J').at(-1);
  assert.match(frame, /╰┤╭─╯/);
  assert.ok(frame.split('\n').length <= 24);
  assert.ok(frame.split('\n').every((line) => Array.from(line).length < 80));
  for (const rows of [26, 34]) {
    f.output.rows = rows;
    f.output.emit('resize');
    frame = f.text().split('\x1b[H\x1b[J').at(-1);
    assert.match(frame, /╰┤╭─╯/);
    if (rows === 34) assert.match(frame, /███████╗/);
    assert.ok(frame.split('\n').length <= rows);
    assert.ok(frame.split('\n').every((line) => Array.from(line).length < 80));
  }
  f.output.columns = 40;
  f.output.rows = 20;
  f.output.emit('resize');
  frame = f.text().split('\x1b[H\x1b[J').at(-1);
  assert.doesNotMatch(frame, /███████╗/);
  assert.doesNotMatch(frame, /╰┤╭─╯/);
  assert.match(frame, /SHERIFF/);
  assert.match(frame, /Enter select/);
  f.input.write('\r');
  await result;
});

for (const key of ['\x03', '\x04']) {
  test(`cancellation restores terminal state (${JSON.stringify(key)})`, async () => {
    const f = terminal();
    const result = select('Tools', ['Claude', 'Codex'], 0, f.input, f.output);
    f.input.write(key);
    await assert.rejects(result, /cancelled/);
    assert.equal(f.input.isRaw, false);
    assert.equal(f.input.isPaused(), true);
    assert.equal(f.input.listenerCount('keypress'), 0);
    assert.ok(f.text().includes('\x1b[?1049l'));
    assert.equal(f.output.listenerCount('resize'), 0);
    assert.ok(f.text().endsWith('\x1b[?25h'));
  });
}
