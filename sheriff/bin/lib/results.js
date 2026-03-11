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

  const files = fs.readdirSync(resultsPath)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => {
      // Only include results for the requested phase
      const parts = f.replace('.md', '').split('-');
      return parts[0] === String(phaseNum);
    })
    .sort();

  if (files.length === 0) return null;

  const parts = [
    `# Sheriff Phase ${phaseNum} — Assembled Results\n`,
    `Generated: ${new Date().toISOString()}\n`,
    `Total sub-phases: ${files.length}\n\n---\n`,
  ];

  for (const file of files) {
    const content = fs.readFileSync(path.join(resultsPath, file), 'utf8');
    parts.push(`\n${content}\n\n---\n`);
  }

  const assembled = parts.join('\n');
  writeFile(ASSEMBLED_FILE, assembled, cwd);
  return assembled;
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
