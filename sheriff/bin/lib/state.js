'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const SHERIFF_DIR = '.sheriff';
const TEST_MAP_FILE = '.sheriff/TEST_MAP.md';
const PHASES_FILE = '.sheriff/PHASES.md';
const ASSEMBLED_FILE = '.sheriff/results-assembled.md';

function safePath(relPath, cwd = process.cwd()) {
  const root = path.resolve(cwd);
  const full = path.resolve(root, relPath);
  const relative = path.relative(root, full);
  if (path.isAbsolute(relPath) || relative === '..' || relative.startsWith(`..${path.sep}`) || !relative) {
    throw new Error('State path must remain inside the project');
  }
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Refusing symlink state path: ${relative}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return full;
}

function validateId(value, kind = 'agent') {
  const patterns = { agent: /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/, subphase: /^[1-9]\d*\.[1-9]\d*$/, phase: /^[1-9]\d*$/ };
  if (!patterns[kind].test(String(value ?? ''))) throw new Error(`Invalid ${kind} ID: ${value}`);
  return String(value);
}

function ensureSheriffDir(cwd = process.cwd()) {
  for (const dir of ['', '/summaries', '/handoffs', '/results']) {
    fs.mkdirSync(safePath(SHERIFF_DIR + dir, cwd), { recursive: true });
  }
}

function readFile(relPath, cwd = process.cwd()) {
  try { return fs.readFileSync(safePath(relPath, cwd), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function writeFile(relPath, content, cwd = process.cwd()) {
  const full = safePath(relPath, cwd);
  const tmp = `${full}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(full), { recursive: true });
  try {
    fs.writeFileSync(tmp, content, { flag: 'wx', mode: 0o600 });
    fs.renameSync(tmp, full);
  } finally {
    try { fs.unlinkSync(tmp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function fileExists(relPath, cwd = process.cwd()) {
  return fs.existsSync(safePath(relPath, cwd));
}

function handoffFile(id) { return `.sheriff/handoffs/handoff-${validateId(id)}.md`; }
function writeHandoff(agentId, content, cwd = process.cwd()) {
  const file = handoffFile(agentId);
  if (!content.trim()) throw new Error('Handoff content cannot be empty');
  writeFile(file, content, cwd);
  return file;
}
function readHandoff(agentId, cwd = process.cwd()) { return readFile(handoffFile(agentId), cwd); }
function deleteHandoff(identifier, cwd = process.cwd()) {
  const file = handoffFile(identifier);
  try { fs.unlinkSync(safePath(file, cwd)); return { deleted: true, file }; }
  catch (error) { if (error.code === 'ENOENT') return { deleted: false, file }; throw error; }
}
function cleanupHandoffs(cwd = process.cwd()) {
  const dir = safePath('.sheriff/handoffs', cwd);
  if (!fs.existsSync(dir)) return { deleted: 0 };
  const files = fs.readdirSync(dir).filter(f => /^handoff-[a-zA-Z0-9][a-zA-Z0-9_.-]*\.md$/.test(f));
  for (const file of files) safePath(`.sheriff/handoffs/${file}`, cwd);
  for (const file of files) fs.unlinkSync(path.join(dir, file));
  return { deleted: files.length };
}

function getStatus(cwd = process.cwd()) {
  const content = readFile(PHASES_FILE, cwd);
  if (content === null) return { initialized: false };
  const phases = require('./phases').parseSubphases(content);
  const status = { initialized: true, total: phases.length, done: 0, inProgress: 0, review: 0, failed: 0, pending: 0, testsWritten: 0, testsPassing: 0, testsFailed: 0 };
  const fields = { pass: 'done', in_progress: 'inProgress', review: 'review', fail: 'failed', pending: 'pending' };
  for (const phase of phases) status[fields[phase.status]]++;
  const dir = safePath('.sheriff/summaries', cwd);
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir).filter(f => /^phase-[1-9]\d*\.md$/.test(f))) {
      const summary = readFile(`.sheriff/summaries/${file}`, cwd);
      const count = key => Number(summary.match(new RegExp(`^${key}:\\s*(\\d+)\\s*$`, 'm'))?.[1] || 0);
      const passing = count('tests_passing'), failed = count('tests_failed'), skipped = count('tests_skipped');
      status.testsPassing += passing;
      status.testsFailed += failed;
      status.testsWritten += passing + failed + skipped;
    }
  }
  return status;
}

module.exports = { safePath, validateId, ensureSheriffDir, readFile, writeFile, fileExists, writeHandoff, readHandoff, deleteHandoff, cleanupHandoffs, getStatus, SHERIFF_DIR, TEST_MAP_FILE, PHASES_FILE, ASSEMBLED_FILE };
