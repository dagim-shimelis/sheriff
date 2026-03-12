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
    // Check if the existing lock is stale
    try {
      const lockContent = fs.readFileSync(lockPath, 'utf8');
      const [pidStr, timestampStr] = lockContent.split('|');
      const pid = parseInt(pidStr, 10);
      const timestamp = parseInt(timestampStr, 10);
      let alive = false;
      try { process.kill(pid, 0); alive = true; } catch { alive = false; }
      const age = Date.now() - timestamp;
      if (!alive || age > 60000) {
        process.stderr.write(`[sheriff] Removing stale lock ${lockPath} (pid=${pid}, alive=${alive}, age=${age}ms)\n`);
        fs.unlinkSync(lockPath);
        continue;
      }
    } catch (e) {
      // If we can't read/parse the lock file, treat it as stale
      process.stderr.write(`[sheriff] Removing unreadable lock ${lockPath}\n`);
      try { fs.unlinkSync(lockPath); } catch {}
      continue;
    }
    if (Date.now() - start > timeout) throw new Error('Could not acquire PHASES.md lock');
    const sleep = (ms) => { const end = Date.now() + ms; while (Date.now() < end) {} };
    sleep(100);
  }
  fs.writeFileSync(lockPath, `${process.pid}|${Date.now()}`);
}

function releaseLock(cwd) {
  const lockPath = path.join(cwd, LOCK_FILE);
  if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
}

function withLock(cwd, fn) {
  try {
    acquireLock(cwd);
  } catch (err) {
    return { success: false, reason: 'lock_timeout', message: err.message };
  }
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

function getSafeToRelease(subphaseId, cwd = process.cwd()) {
  // Check 1: Does a result file exist for this subphase?
  const resultFile = `.sheriff/results/${subphaseId.replace(/\./g, '-')}.md`;
  const resultPath = path.join(cwd, resultFile);
  if (fs.existsSync(resultPath)) {
    return { safe: false, reason: 'result_exists' };
  }

  // Check 2: Does any handoff file reference this subphaseId?
  const handoffsDir = path.join(cwd, '.sheriff', 'handoffs');
  if (fs.existsSync(handoffsDir)) {
    const handoffFiles = fs.readdirSync(handoffsDir).filter((f) => f.startsWith('handoff-') && f.endsWith('.md'));
    for (const file of handoffFiles) {
      const content = fs.readFileSync(path.join(handoffsDir, file), 'utf8');
      if (content.includes(subphaseId)) {
        return { safe: false, reason: 'handoff_exists' };
      }
    }
  }

  return { safe: true };
}

function releaseSubphase(subphaseId, cwd = process.cwd(), force = false) {
  if (!force) {
    const safeCheck = getSafeToRelease(subphaseId, cwd);
    if (!safeCheck.safe) {
      return { success: false, subphaseId, reason: safeCheck.reason };
    }
  }

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

    // Clear lock fields so stale lock detection is not confused
    const headerPattern = new RegExp(
      `(### ${escapeRegex(subphaseId)}[^\n]*\n(?:.*\n)*?lock: )[^\n]+`,
    );
    content = content.replace(headerPattern, `$1—`);
    const timePattern = new RegExp(
      `(### ${escapeRegex(subphaseId)}[^\n]*\n(?:.*\n)*?lock_time: )[^\n]+`,
    );
    content = content.replace(timePattern, `$1—`);

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

function getOrphanedLockFiles(cwd = process.cwd()) {
  const lockFiles = [
    '.sheriff/.phases.lock',
    '.sheriff/.testmap.lock',
  ];
  const found = [];
  for (const file of lockFiles) {
    const full = path.join(cwd, file);
    if (!fs.existsSync(full)) continue;
    const raw = fs.readFileSync(full, 'utf8').trim();
    const pid = parseInt(raw.split('|')[0], 10);
    let alive = false;
    if (!isNaN(pid)) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    found.push({ file, pid: isNaN(pid) ? null : pid, alive });
  }
  return found;
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
  getSafeToRelease,
  getOrphanedLockFiles,
  getNextAvailableSubphase,
  STATUS,
};
