'use strict';

// CLI exit status is authoritative even when a provider emits a misleading success envelope.
function sessionResult(host, events, exitCode) {
  const finished = events.filter(event => event.type === (host === 'codex' ? 'turn.completed' : 'result'));
  const last = finished.at(-1);
  const init = events.find(event => event.type === 'system' && event.subtype === 'init');
  const result = {
    usage: finished.map(event => event.usage),
    text: last?.result || '',
    model: init?.model,
    commands: (init?.slash_commands || []).filter(name => name.startsWith('sheriff:')),
    hooks: events.filter(event => ['hook_started', 'hook_response'].includes(event.subtype)).length,
    permissionDenials: finished.flatMap(event => event.permission_denials || []),
  };
  const failed = events.find(event => ['turn.failed', 'error'].includes(event.type));
  if (exitCode !== 0 || !finished.length || failed ||
      (host === 'claude' && finished.some(event => event.subtype !== 'success' || event.is_error))) {
    result.error = result.text || last?.errors?.join('\n') || failed?.error?.message || failed?.message ||
      `Host exited ${exitCode} without a successful completed turn`;
  }
  return result;
}

module.exports = { sessionResult };
