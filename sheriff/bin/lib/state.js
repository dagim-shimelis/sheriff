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
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
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

function getStatus(cwd = process.cwd()) {
  const phases = readFile(PHASES_FILE, cwd);
  if (!phases) return { initialized: false };

  const lines = phases.split('\n');
  const total = (phases.match(/^\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/gm) || []).length - 1;
  const done = (phases.match(/✅/g) || []).length;
  const inProgress = (phases.match(/🔒/g) || []).length;
  const review = (phases.match(/⚠️/g) || []).length;
  const pending = total - done - inProgress - review;

  return { initialized: true, total, done, inProgress, review, pending };
}

module.exports = {
  ensureSheriffDir,
  readFile,
  writeFile,
  fileExists,
  writeHandoff,
  readHandoff,
  getStatus,
  SHERIFF_DIR,
  TEST_MAP_FILE,
  PHASES_FILE,
  ASSEMBLED_FILE,
};
