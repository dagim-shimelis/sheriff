'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionResult } = require('./live/session-result');

test('Claude organization denial cannot pass despite its success envelope', () => {
  const message = 'Your organization has disabled Claude subscription access for Claude Code';
  const result = sessionResult('claude', [
    { type: 'system', subtype: 'init', slash_commands: ['help', 'sheriff:run'], model: 'host-default' },
    { type: 'result', subtype: 'success', is_error: false, result: message },
  ], 1);
  assert.equal(result.error, message);
  assert.deepEqual(result.commands, ['sheriff:run']);
});

test('live result parsing requires completion and retains failure diagnostics', () => {
  assert.ok(sessionResult('codex', [{ type: 'thread.started' }], 0).error);
  assert.equal(sessionResult('codex', [{ type: 'turn.failed', error: { message: 'quota exceeded' } }], 1).error, 'quota exceeded');
  assert.equal(sessionResult('claude', [{ type: 'result', subtype: 'error_during_execution', errors: ['runner unavailable'] }], 0).error, 'runner unavailable');
  assert.equal(sessionResult('codex', [{ type: 'turn.completed', usage: { output_tokens: 10 } }], 0).error, undefined);
  assert.equal(sessionResult('claude', [{ type: 'result', subtype: 'success', result: 'done' }], 0).error, undefined);
});
