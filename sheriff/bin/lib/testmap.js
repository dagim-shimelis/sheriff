'use strict';

const fs = require('fs');
const path = require('path');
const { readFile, writeFile, TEST_MAP_FILE } = require('./state');

// Mutex: simple file-based lock for concurrent writes (mirrors phases.js)
const LOCK_FILE = '.sheriff/.testmap.lock';

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
    if (Date.now() - start > timeout) throw new Error('Could not acquire TEST_MAP.md lock');
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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize a file path for comparison: strip leading './', use forward slashes.
 */
function normalizePath(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Check if candidate matches target with a path-separator boundary.
 * Ensures 'utils.js' does NOT match 'viewUtils.js', but 'utils.js' DOES match 'lib/utils.js'.
 */
function boundaryMatch(candidate, target) {
  const normCandidate = normalizePath(candidate);
  const normTarget = normalizePath(target);

  // Check if one ends with '/' + the other
  if (normTarget.length > normCandidate.length) {
    return normTarget.slice(-(normCandidate.length + 1)) === '/' + normCandidate;
  } else if (normCandidate.length > normTarget.length) {
    return normCandidate.slice(-(normTarget.length + 1)) === '/' + normTarget;
  }
  return false;
}

/**
 * Check if a Coverage Map row's file column matches the given sourceFile.
 */
function findSourceRow(cells1, sourceFile) {
  const normCells = normalizePath(cells1);
  const normSource = normalizePath(sourceFile);

  // 1. Exact match
  if (cells1 === sourceFile) return true;

  // 2. Path-normalized exact match
  if (normCells === normSource) return true;

  // 3. Boundary match (requires '/' separator)
  if (boundaryMatch(cells1, sourceFile)) return true;

  return false;
}

/**
 * Update the Coverage Map table in TEST_MAP.md for a given source file.
 *
 * @param {string} sourceFile - The source file path as it appears in the Coverage Map
 * @param {string} testType - 'unit' or 'e2e'
 * @param {string} status - 'tested' (→ ✅) or 'review' (→ ⚠️) or 'failed' (→ ❌)
 * @param {string} cwd - working directory
 * @returns {{ success: boolean, sourceFile: string, testType: string, status: string }}
 */
function updateCoverage(sourceFile, testType, status, cwd = process.cwd()) {
  const statusMap = { tested: '✅', review: '⚠️', failed: '❌' };
  const icon = statusMap[status];
  if (!icon) throw new Error(`Invalid status: ${status}. Must be tested, review, or failed`);

  const columnIndex = testType === 'unit' ? 2 : testType === 'e2e' ? 3 : null;
  if (columnIndex === null) throw new Error(`Invalid testType: ${testType}. Must be unit or e2e`);

  return withLock(cwd, () => {
    let content = readFile(TEST_MAP_FILE, cwd);
    if (!content) throw new Error('TEST_MAP.md not found');

    // Find the row containing this source file in the Coverage Map table
    // Table format: | Area | File | Unit | E2E | Complexity | Notes |
    const lines = content.split('\n');
    const matchedRows = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip non-table rows
      if (!line.startsWith('|')) continue;
      // Skip header and separator rows
      if (line.includes('Area') && line.includes('File')) continue;
      if (line.match(/^\|[\s-]+\|/)) continue;

      // Check if this row contains our source file
      const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');
      if (cells.length < 4) continue;

      // cells[1] is the File column — match against sourceFile
      if (findSourceRow(cells[1], sourceFile)) {
        matchedRows.push({ index: i, cells, line });
      }
    }

    if (matchedRows.length === 0) {
      return { success: false, reason: `Source file "${sourceFile}" not found in TEST_MAP.md Coverage Map` };
    }

    if (matchedRows.length > 1) {
      return {
        success: false,
        reason: 'ambiguous_match',
        matches: matchedRows.map(r => r.cells[1]),
      };
    }

    const match = matchedRows[0];
    const { index, cells } = match;

    // Replace the status in the correct column
    // columnIndex 2 = Unit (cells[2]), columnIndex 3 = E2E (cells[3])
    const oldStatus = cells[columnIndex];
    if (oldStatus === '✅') {
      // Already marked as tested, no change needed
      return { success: true, sourceFile, testType, status: icon, changed: false };
    }
    cells[columnIndex] = icon;
    lines[index] = '| ' + cells.join(' | ') + ' |';

    // Update the Summary section counts
    content = lines.join('\n');
    content = _updateSummaryCounts(content);

    writeFile(TEST_MAP_FILE, content, cwd);
    return { success: true, sourceFile, testType, status: icon, changed: true };
  });
}

/**
 * Recalculate and update the Summary section counts based on current Coverage Map data.
 */
function _updateSummaryCounts(content) {
  const lines = content.split('\n');

  // Find all coverage map rows and count statuses
  let unitDone = 0, e2eDone = 0, unitNeeded = 0, e2eNeeded = 0, na = 0, total = 0;
  let inTable = false;

  for (const line of lines) {
    if (!line.startsWith('|')) {
      if (inTable) break; // We've left the table
      continue;
    }
    // Skip header and separator
    if (line.includes('Area') && line.includes('File') && line.includes('Unit')) {
      inTable = true;
      continue;
    }
    if (line.match(/^\|[\s-]+\|/)) continue;
    if (!inTable) continue;

    const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');
    if (cells.length < 4) continue;

    total++;
    const unitStatus = cells[2];
    const e2eStatus = cells[3];

    if (unitStatus === '✅' || unitStatus === '⚠️') unitDone++;
    else if (unitStatus === '[ ]') unitNeeded++;

    if (e2eStatus === '✅' || e2eStatus === '⚠️') e2eDone++;
    else if (e2eStatus === '[ ]') e2eNeeded++;

    // Count NA: files where both unit and e2e are — or ⊘
    if ((unitStatus === '—' || unitStatus === '⊘') && (e2eStatus === '—' || e2eStatus === '⊘')) na++;
  }

  // Replace summary lines
  content = content.replace(/- Total source files: \d+/, `- Total source files: ${total}`);
  content = content.replace(/- Already tested \(unit\): \d+/, `- Already tested (unit): ${unitDone}`);
  content = content.replace(/- Already tested \(E2E\): \d+/, `- Already tested (E2E): ${e2eDone}`);
  content = content.replace(/- Needs unit tests: \d+/, `- Needs unit tests: ${unitNeeded}`);
  content = content.replace(/- Needs E2E tests: \d+/, `- Needs E2E tests: ${e2eNeeded}`);
  content = content.replace(/- Not applicable: \d+/, `- Not applicable: ${na}`);

  return content;
}

module.exports = {
  updateCoverage,
};
