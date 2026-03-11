'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CONFIG_FILE = '.sheriff/.sheriff.json';

function getConfigPath(cwd = process.cwd()) {
  return path.join(cwd, CONFIG_FILE);
}

function readConfig(cwd = process.cwd()) {
  const file = getConfigPath(cwd);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeConfig(config, cwd = process.cwd()) {
  const file = getConfigPath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
}

function configExists(cwd = process.cwd()) {
  return fs.existsSync(getConfigPath(cwd));
}

function getDefault() {
  return {
    version: '0.1.0',
    testRunner: null,
    framework: null,
    language: 'js',
    sourceDirs: ['src', 'components', 'composables', 'stores', 'utils', 'api', 'lib'],
    excludeDirs: ['node_modules', 'dist', '.nuxt', '.output', 'coverage', '.sheriff'],
    excludePatterns: ['*.config.*', '*.d.ts', 'index.ts', 'index.js'],
    phaseStrategy: 'risk',
    onTestFailure: 'flag',
    maxParallelAgents: 3,
    staleLockMinutes: 30,
    confidence: 'high',
  };
}

module.exports = { readConfig, writeConfig, configExists, getDefault, getConfigPath };
