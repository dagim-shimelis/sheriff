'use strict';

const fs = require('fs');
const path = require('path');

const SHERIFF_DIR = '.sheriff';
const TEST_MAP_FILE = '.sheriff/TEST_MAP.md';
const PHASES_FILE = '.sheriff/PHASES.md';
const ASSEMBLED_FILE = '.sheriff/results-assembled.md';

function ensureSheriffDir(cwd = process.cwd()) {
  fs.mkdirSync(path.join(cwd, SHERIFF_DIR), { recursive: true });
  fs.mkdirSync(path.join(cwd, SHERIFF_DIR, 'summaries'), { recursive: true });
  fs.mkdirSync(path.join(cwd, SHERIFF_DIR, 'handoffs'), { recursive: true });
}

function readFile(relPath, cwd = process.cwd()) {
  const full = path.join(cwd, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function writeFile(relPath, content, cwd = process.cwd()) {
  const full = path.join(cwd, relPath);
  const tmp = full + '.tmp';
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, full);
}

function fileExists(relPath, cwd = process.cwd()) {
  return fs.existsSync(path.join(cwd, relPath));
}

function writeHandoff(agentId, content, cwd = process.cwd()) {
  const file = `.sheriff/handoffs/handoff-${agentId}.md`;
  writeFile(file, content, cwd);
  return file;
}

function readHandoff(agentId, cwd = process.cwd()) {
  return readFile(`.sheriff/handoffs/handoff-${agentId}.md`, cwd);
}

function deleteHandoff(identifier, cwd = process.cwd()) {
  const file = `.sheriff/handoffs/handoff-${identifier}.md`;
  const full = path.join(cwd, file);
  if (fs.existsSync(full)) {
    fs.unlinkSync(full);
    return { deleted: true, file };
  }
  return { deleted: false, file };
}

function cleanupHandoffs(cwd = process.cwd()) {
  const dir = path.join(cwd, '.sheriff/handoffs');
  if (!fs.existsSync(dir)) return { deleted: 0 };
  const files = fs.readdirSync(dir).filter(f => f.startsWith('handoff-') && f.endsWith('.md'));
  for (const f of files) fs.unlinkSync(path.join(dir, f));
  return { deleted: files.length };
}

function getStatus(cwd = process.cwd()) {
  const phases = readFile(PHASES_FILE, cwd);
  if (!phases) return { initialized: false };

  const lines = phases.split('\n');
  const total = (phases.match(/^\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/gm) || []).length - 1;
  const done = (phases.match(/✅/g) || []).length;
  const inProgress = (phases.match(/🔒/g) || []).length;
  const review = (phases.match(/⚠️/g) || []).length;
  const pending = total - done - inProgress - review;

  // Parse test counts from phase summaries
  let testsWritten = 0;
  let testsPassing = 0;
  let testsFailed = 0;

  const summariesDir = path.join(cwd, '.sheriff', 'summaries');
  if (fs.existsSync(summariesDir)) {
    const summaryFiles = fs.readdirSync(summariesDir).filter(f => f.startsWith('phase-') && f.endsWith('.md'));
    for (const file of summaryFiles) {
      const content = fs.readFileSync(path.join(summariesDir, file), 'utf8');
      const passingMatch = content.match(/tests_passing:\s*(\d+)/);
      const skippedMatch = content.match(/tests_skipped:\s*(\d+)/);
      const failedMatch = content.match(/tests_failed:\s*(\d+)/);
      const passing = passingMatch ? parseInt(passingMatch[1], 10) : 0;
      const skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
      const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
      testsPassing += passing;
      testsFailed += failed;
      testsWritten += passing + skipped + failed;
    }
  }

  return { initialized: true, total, done, inProgress, review, pending, testsWritten, testsPassing, testsFailed };
}

module.exports = {
  ensureSheriffDir,
  readFile,
  writeFile,
  fileExists,
  writeHandoff,
  readHandoff,
  deleteHandoff,
  cleanupHandoffs,
  getStatus,
  SHERIFF_DIR,
  TEST_MAP_FILE,
  PHASES_FILE,
  ASSEMBLED_FILE,
};
