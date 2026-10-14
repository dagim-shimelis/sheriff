'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { safePath } = require('./state');

function withLock(file, cwd, fn, timeout = 10000) {
  const lockPath = safePath(file, cwd);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const token = `${process.pid}|${Date.now()}|${randomUUID()}`;
  const deadline = Date.now() + timeout;
  const wait = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      try { fs.writeFileSync(fd, token); } finally { fs.closeSync(fd); }
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Never steal a live lock or race another process removing a stale one.
      // shortcut: crashed locks require manual cleanup; add OS locks if unattended crash recovery is needed.
      safePath(file, cwd);
      if (Date.now() >= deadline) throw new Error(`Timed out acquiring ${file}; inspect check-stale-locks before removing an abandoned lock`);
      Atomics.wait(wait, 0, 0, Math.min(25, deadline - Date.now()));
    }
  }
  try { return fn(); }
  finally {
    if (fs.readFileSync(safePath(file, cwd), 'utf8') === token) fs.unlinkSync(lockPath);
  }
}

module.exports = { withLock };
