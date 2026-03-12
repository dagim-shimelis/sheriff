'use strict';

const fs = require('fs');
const path = require('path');
const { readFile, writeFile, ASSEMBLED_FILE } = require('./state');

const RESULTS_DIR = '.sheriff/results';

function writeResult(subphaseId, content, cwd = process.cwd()) {
  const file = `${RESULTS_DIR}/${subphaseId.replace(/\./g, '-')}.md`;
  writeFile(file, content, cwd);
  return file;
}

function readResult(subphaseId, cwd = process.cwd()) {
  return readFile(`${RESULTS_DIR}/${subphaseId.replace(/\./g, '-')}.md`, cwd);
}

function assembleResults(phaseNum, cwd = process.cwd()) {
  const resultsPath = path.join(cwd, RESULTS_DIR);
  if (!fs.existsSync(resultsPath)) return null;

  // Read PHASES.md to extract all sub-phase IDs for this phase
  const { PHASES_FILE } = require('./state');
  const phasesContent = readFile(PHASES_FILE, cwd);
  const expectedSubphases = [];
  if (phasesContent) {
    const subphasePattern = new RegExp(
      `### (${String(phaseNum).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+)`,
      'g',
    );
    let match;
    while ((match = subphasePattern.exec(phasesContent)) !== null) {
      expectedSubphases.push(match[1].trim());
    }
  }

  const files = fs.readdirSync(resultsPath)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => {
      // Only include results for the requested phase
      const parts = f.replace('.md', '').split('-');
      return parts[0] === String(phaseNum);
    })
    .sort();

  if (files.length === 0 && expectedSubphases.length === 0) return null;

  // Determine which sub-phases have result files
  const foundSubphases = files.map((f) => f.replace('.md', '').replace(/-/g, '.'));
  const missing = expectedSubphases.filter((sp) => !foundSubphases.includes(sp));

  const total = expectedSubphases.length || files.length;
  const found = files.length;

  const parts = [
    `# Sheriff Phase ${phaseNum} — Assembled Results\n`,
    `Generated: ${new Date().toISOString()}\n`,
    `Total sub-phases: ${total}, Found: ${found}, Missing: ${missing.length}\n\n---\n`,
  ];

  for (const file of files) {
    const content = fs.readFileSync(path.join(resultsPath, file), 'utf8');
    parts.push(`\n${content}\n\n---\n`);
  }

  const assembled = parts.join('\n');
  writeFile(ASSEMBLED_FILE, assembled, cwd);
  return { content: assembled, missing, total, found };
}

function writePhaseSummary(phaseNum, content, cwd = process.cwd()) {
  const file = `.sheriff/summaries/phase-${phaseNum}.md`;
  writeFile(file, content, cwd);
  return file;
}

function readPhaseSummary(phaseNum, cwd = process.cwd()) {
  return readFile(`.sheriff/summaries/phase-${phaseNum}.md`, cwd);
}

module.exports = {
  writeResult,
  readResult,
  assembleResults,
  writePhaseSummary,
  readPhaseSummary,
  RESULTS_DIR,
};
