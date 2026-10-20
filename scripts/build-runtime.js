#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { name, version } = require('../package.json');

function copy(source, destination, tool) {
  if (fs.statSync(source).isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) copy(path.join(source, entry), path.join(destination, entry), tool);
    return;
  }
  if (!source.endsWith('.md')) return fs.copyFileSync(source, destination);
  let content = fs.readFileSync(source, 'utf8')
    .replaceAll('{INSTALL_TOOL}', tool)
    .replaceAll('{INSTALL_SCOPE}', 'local')
    .replaceAll('{SHERIFF_RUNTIME}', '../runtime.md');
  if (tool === 'codex') content = content.replaceAll('/sheriff:', '$sheriff ');
  fs.writeFileSync(destination, content);
}

function inventory(directory, relative = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.posix.join(relative, entry.name);
    return entry.isDirectory() ? inventory(path.join(directory, entry.name), file) : [file];
  });
}

function buildRuntime(destination = path.join(root, 'dist')) {
  for (const tool of ['claude', 'codex']) {
    const runtime = path.join(destination, tool);
    fs.rmSync(runtime, { recursive: true, force: true });
    copy(path.join(root, 'sheriff'), runtime, tool);
    for (const directory of ['agents', 'workflows']) copy(path.join(root, directory), path.join(runtime, directory), tool);
    copy(path.join(root, 'commands/sheriff'), path.join(runtime, 'commands'), tool);
    if (tool === 'codex') copy(path.join(root, 'integrations/codex/SKILL.md'), path.join(runtime, 'SKILL.md'), tool);
    const files = inventory(runtime).sort();
    fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name, version, files }, null, 2) + '\n');
  }
}

if (require.main === module) {
  buildRuntime();
  console.log('Built package runtimes for Claude Code and Codex.');
}

module.exports = { buildRuntime };
