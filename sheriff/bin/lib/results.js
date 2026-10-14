'use strict';

const fs = require('fs');
const { readFile, writeFile, safePath, validateId, PHASES_FILE, ASSEMBLED_FILE } = require('./state');
const { parseSubphases } = require('./phases');
const RESULTS_DIR = '.sheriff/results';

function resultFile(id) { return `${RESULTS_DIR}/${validateId(id, 'subphase').replace('.', '-')}.md`; }
function writeResult(subphaseId, content, cwd = process.cwd()) {
  if (!content.trim()) throw new Error('Result content cannot be empty');
  const file = resultFile(subphaseId);
  writeFile(file, content, cwd);
  return file;
}
function readResult(subphaseId, cwd = process.cwd()) { return readFile(resultFile(subphaseId), cwd); }

function assembleResults(phaseNum, cwd = process.cwd()) {
  const phase = validateId(phaseNum, 'phase');
  const plan = readFile(PHASES_FILE, cwd);
  const expected = plan ? parseSubphases(plan).filter(item => item.id.split('.')[0] === phase).map(item => item.id) : [];
  const dir = safePath(RESULTS_DIR, cwd);
  const available = fs.existsSync(dir) ? fs.readdirSync(dir).filter(file => new RegExp(`^${phase}-[1-9]\\d*\\.md$`).test(file)).map(file => file.slice(0, -3).replace('-', '.')) : [];
  const ids = (plan ? expected : available).sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1]));
  if (!ids.length) return null;
  const found = [], missing = [];
  for (const id of ids) {
    const content = readResult(id, cwd);
    if (!content?.trim()) missing.push(id); else found.push(content);
  }
  const assembled = [
    `# Sheriff Phase ${phase} — Assembled Results`,
    `Generated: ${new Date().toISOString()}`,
    `Total sub-phases: ${ids.length}, Found: ${found.length}, Missing: ${missing.length}`,
    ...found,
  ].join('\n\n---\n\n') + '\n';
  writeFile(ASSEMBLED_FILE, assembled, cwd);
  return { content: assembled, missing, total: ids.length, found: found.length };
}
function summaryFile(id) { return `.sheriff/summaries/phase-${validateId(id, 'phase')}.md`; }
function writePhaseSummary(phaseNum, content, cwd = process.cwd()) {
  if (!content.trim()) throw new Error('Summary content cannot be empty');
  const file = summaryFile(phaseNum);
  writeFile(file, content, cwd);
  return file;
}
function readPhaseSummary(phaseNum, cwd = process.cwd()) { return readFile(summaryFile(phaseNum), cwd); }
module.exports = { writeResult, readResult, assembleResults, writePhaseSummary, readPhaseSummary, RESULTS_DIR };
