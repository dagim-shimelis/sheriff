'use strict';

const fs = require('fs');
const path = require('path');
const { readFile, writeFile, PHASES_FILE } = require('./state');

const STATUS = {
  PENDING: '[ ]',
  IN_PROGRESS: '🔒',
  PASS: '✅',
  FAIL: '❌',
  REVIEW: '⚠️',
};

// Mutex: simple file-based lock for concurrent writes
const LOCK_FILE = '.sheriff/.phases.lock';

function acquireLock(cwd, timeout = 10000) {
  const lockPath = path.join(cwd, LOCK_FILE);
  const start = Date.now();
  while (fs.existsSync(lockPath)) {
    if (Date.now() - start > timeout) throw new Error('Could not acquire PHASES.md lock');
    const sleep = (ms) => { const end = Date.now() + ms; while (Date.now() < end) {} };
    sleep(100);
  }
  fs.writeFileSync(lockPath, String(process.pid));
}

function releaseLock(cwd) {
  const lockPath = path.join(cwd, LOCK_FILE);
  if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
}

function withLock(cwd, fn) {
  acquireLock(cwd);
  try {
    return fn();
  } finally {
    releaseLock(cwd);
  }
}

function claimSubphase(subphaseId, agentId, cwd = process.cwd()) {
  return withLock(cwd, () => {
    // Reload inside lock
    let content = readFile(PHASES_FILE, cwd);
    if (!content) throw new Error('PHASES.md not found');

    const idPattern = new RegExp(`\\| ${escapeRegex(subphaseId)} \\|([^|]*)\\| \\[ \\) \\|([^|]*)\\|`, 'g');
    // Match table row for this subphase
    const rowPattern = new RegExp(
      `(\\| ${escapeRegex(subphaseId)} \\|[^|]*\\| )\\[ \\]( \\|[^|]*\\|)`,
    );

    if (!rowPattern.test(content)) {
      // Already locked or doesn't exist
      return { success: false, reason: 'subphase not available' };
    }

    const lockTime = new Date().toISOString();
    content = content.replace(rowPattern, `$1🔒 ${agentId}$2`);

    // Also record lock_time in the subphase header block
    const headerPattern = new RegExp(
      `(### ${escapeRegex(subphaseId)}[^\n]*\n(?:.*\n)*?lock: )—`,
    );
    content = content.replace(headerPattern, `$1${agentId}`);
    const timePattern = new RegExp(
      `(### ${escapeRegex(subphaseId)}[^\n]*\n(?:.*\n)*?lock_time: )—`,
    );
    content = content.replace(timePattern, `$1${lockTime}`);

    writeFile(PHASES_FILE, content, cwd);
    return { success: true, subphaseId, agentId, lockTime };
  });
}

function releaseSubphase(subphaseId, cwd = process.cwd()) {
  return withLock(cwd, () => {
    let content = readFile(PHASES_FILE, cwd);
    if (!content) throw new Error('PHASES.md not found');

    const rowPattern = new RegExp(
      `(\\| ${escapeRegex(subphaseId)} \\|[^|]*\\| )🔒[^|]*( \\|[^|]*\\|)`,
    );
    content = content.replace(rowPattern, `$1[ ]$2`);

    const headerPattern = new RegExp(
      `(### ${escapeRegex(subphaseId)}[^\n]*\n(?:.*\n)*?lock: )[^\n]+`,
    );
    content = content.replace(headerPattern, `$1—`);
    const timePattern = new RegExp(
      `(### ${escapeRegex(subphaseId)}[^\n]*\n(?:.*\n)*?lock_time: )[^\n]+`,
    );
    content = content.replace(timePattern, `$1—`);

    writeFile(PHASES_FILE, content, cwd);
    return { success: true, subphaseId };
  });
}

function markComplete(subphaseId, result, cwd = process.cwd()) {
  // result: 'pass' | 'fail' | 'review'
  const statusMap = { pass: '✅', fail: '❌', review: '⚠️' };
  const icon = statusMap[result] || '⚠️';

  return withLock(cwd, () => {
    let content = readFile(PHASES_FILE, cwd);
    if (!content) throw new Error('PHASES.md not found');

    const rowPattern = new RegExp(
      `(\\| ${escapeRegex(subphaseId)} \\|[^|]*\\| )[^|]*( \\|[^|]*\\|)`,
    );
    content = content.replace(rowPattern, `$1${icon}$2`);

    writeFile(PHASES_FILE, content, cwd);

    // Update phase-level progress table if all subphases in phase are done
    _updatePhaseProgress(content, subphaseId, cwd);

    return { success: true, subphaseId, result: icon };
  });
}

function getStaleLocks(cwd = process.cwd()) {
  const content = readFile(PHASES_FILE, cwd);
  if (!content) return [];

  const config = require('./config').readConfig(cwd);
  const staleMins = config?.staleLockMinutes || 30;
  const staleThreshold = Date.now() - staleMins * 60 * 1000;

  const stale = [];
  // Find lock_time entries
  const lockTimePattern = /lock_time: ([^\n]+)/g;
  const lockPattern = /lock: ([^\n]+)/g;
  const subphasePattern = /### ([^\n]+)\n/g;

  let spMatch, lockMatch, timeMatch;
  const sections = content.split(/(?=### )/);

  for (const section of sections) {
    const spMatch = section.match(/### ([^\n]+)/);
    const lockMatch = section.match(/lock: ([^\n]+)/);
    const timeMatch = section.match(/lock_time: ([^\n]+)/);

    if (!spMatch || !lockMatch || !timeMatch) continue;
    const subphaseId = spMatch[1].trim();
    const agentId = lockMatch[1].trim();
    const lockTime = timeMatch[1].trim();

    if (agentId === '—' || lockTime === '—') continue;

    const lockDate = new Date(lockTime).getTime();
    if (lockDate < staleThreshold) {
      stale.push({ subphaseId, agentId, lockTime });
    }
  }

  return stale;
}

function getNextAvailableSubphase(wave, cwd = process.cwd()) {
  const content = readFile(PHASES_FILE, cwd);
  if (!content) return null;

  // Find subphase rows with [ ] status and matching wave
  const sections = content.split(/(?=### )/);

  for (const section of sections) {
    const spMatch = section.match(/### ([^\n]+)/);
    const waveMatch = section.match(/wave: (\d+)/);
    const lockMatch = section.match(/lock: ([^\n]+)/);

    if (!spMatch || !waveMatch || !lockMatch) continue;
    if (parseInt(waveMatch[1]) !== wave) continue;
    if (lockMatch[1].trim() !== '—') continue;

    // Check the table row has [ ]
    const subphaseId = spMatch[1].trim();
    const rowPattern = new RegExp(`\\| ${escapeRegex(subphaseId)} \\|[^|]*\\| \\[ \\] \\|`);
    if (rowPattern.test(content)) {
      return subphaseId;
    }
  }

  return null;
}

function _updatePhaseProgress(content, subphaseId, cwd) {
  // Extract phase number from subphaseId (e.g. "8.1" → phase "8")
  const phaseNum = subphaseId.split('.')[0];
  const phasePattern = new RegExp(
    `\\| Phase ${escapeRegex(phaseNum)}[^|]*\\|[^|]*\\| \\[ \\] \\|`,
  );

  // Count pending subphases in this phase
  const pendingPattern = new RegExp(
    `### ${escapeRegex(phaseNum)}\\.\\d+[^\n]*\n(?:.*\n)*?lock: —`,
    'g',
  );
  const subphaseRows = content.match(
    new RegExp(`\\| ${escapeRegex(phaseNum)}\\.\\d+ \\|[^|]*\\| \\[ \\] \\|`, 'g'),
  );

  if (!subphaseRows || subphaseRows.length === 0) {
    // All done — update phase row
    let updated = readFile(PHASES_FILE, cwd);
    updated = updated.replace(
      new RegExp(`(\\| Phase ${escapeRegex(phaseNum)}[^|]*\\| )[^|]*(\\| )`),
      `$1✅$2`,
    );
    writeFile(PHASES_FILE, updated, cwd);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  claimSubphase,
  releaseSubphase,
  markComplete,
  getStaleLocks,
  getNextAvailableSubphase,
  STATUS,
};
