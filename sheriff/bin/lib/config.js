'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = '.sheriff/.sheriff.json';

/**
 * Config schema version — bump this when adding new config fields.
 * Each version maps to the fields it introduced, so the migration system
 * knows exactly which questions to ask existing users on update.
 */
const CURRENT_CONFIG_VERSION = 1;

/**
 * Registry of config fields introduced in each version.
 * When you add new fields:
 *   1. Bump CURRENT_CONFIG_VERSION
 *   2. Add a new entry here mapping the version to its new field paths
 *   3. Add the fields to getDefault() with sensible defaults
 *   4. Add corresponding questions to the interrogator's migration section
 *
 * Field paths use dot notation for nested fields (e.g., "models.light").
 */
const CONFIG_VERSION_REGISTRY = {
  1: {
    description: 'Initial config schema',
    fields: [
      'testRunner', 'testRunners.unit', 'testRunners.e2e',
      'testTypes.unit', 'testTypes.e2e',
      'testRunnerSetup.unit', 'testRunnerSetup.e2e',
      'framework', 'language',
      'sourceDirs', 'excludeDirs', 'excludePatterns',
      'phaseStrategy', 'onTestFailure',
      'maxParallelAgents', 'staleLockMinutes', 'confidence',
      'models.light', 'models.medium', 'models.heavy',
    ],
  },
};

function getConfigPath(cwd = process.cwd()) {
  return path.join(cwd, CONFIG_FILE);
}

/**
 * Deep-merges default values into a config object for any missing fields.
 * Does NOT overwrite existing values — only fills in undefined ones.
 * Does NOT write the result back to disk.
 */
function mergeDefaults(cfg) {
  const defaults = getDefault();

  function merge(target, source) {
    for (const key of Object.keys(source)) {
      if (target[key] === undefined) {
        target[key] = source[key];
      } else if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] !== null &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        merge(target[key], source[key]);
      }
    }
    return target;
  }

  return merge(cfg, defaults);
}

function readConfig(cwd = process.cwd()) {
  const file = getConfigPath(cwd);
  if (!fs.existsSync(file)) return null;
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  return mergeDefaults(cfg);
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
    configVersion: CURRENT_CONFIG_VERSION,
    version: '0.1.0',
    testRunner: null,           // deprecated — kept for backward compat
    testRunners: {
      unit: null,               // "vitest" | "jest" | "mocha" | etc.
      e2e: null,                // "playwright" | "cypress" | etc.
    },
    testTypes: {
      unit: true,
      e2e: true,
    },
    testRunnerSetup: {
      unit: null,               // "detected" | "installed" | null
      e2e: null,                // "detected" | "installed" | null
    },
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
    models: {
      light: 'haiku',
      medium: 'sonnet',
      heavy: 'opus',
    },
  };
}

/**
 * Resolves a dot-notation path (e.g., "models.light") against an object.
 * Returns undefined if any segment is missing.
 */
function getNestedValue(obj, dotPath) {
  const parts = dotPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Checks the stored config version against CURRENT_CONFIG_VERSION.
 * Returns an object describing what needs migration.
 */
function checkConfigVersion(cwd = process.cwd()) {
  const cfg = readConfig(cwd);
  if (!cfg) {
    return {
      needsMigration: false,
      configMissing: true,
      storedVersion: 0,
      currentVersion: CURRENT_CONFIG_VERSION,
      missingFields: [],
      newVersions: [],
    };
  }

  const storedVersion = cfg.configVersion || 1;

  // Collect fields introduced in versions after the stored version
  const missingFields = [];
  const newVersions = [];

  for (let v = storedVersion + 1; v <= CURRENT_CONFIG_VERSION; v++) {
    const registry = CONFIG_VERSION_REGISTRY[v];
    if (!registry) continue;

    const versionMissing = [];
    for (const field of registry.fields) {
      if (getNestedValue(cfg, field) === undefined) {
        versionMissing.push(field);
      }
    }

    if (versionMissing.length > 0) {
      newVersions.push(v);
      missingFields.push(...versionMissing);
    }
  }

  // Also check for fields from current or earlier versions that are
  // somehow missing (e.g., config was hand-edited or corrupted)
  for (let v = 1; v <= storedVersion; v++) {
    const registry = CONFIG_VERSION_REGISTRY[v];
    if (!registry) continue;
    for (const field of registry.fields) {
      if (getNestedValue(cfg, field) === undefined && !missingFields.includes(field)) {
        missingFields.push(field);
      }
    }
  }

  return {
    needsMigration: storedVersion < CURRENT_CONFIG_VERSION || missingFields.length > 0,
    configMissing: false,
    storedVersion,
    currentVersion: CURRENT_CONFIG_VERSION,
    missingFields,
    newVersions,
  };
}

module.exports = {
  readConfig, writeConfig, configExists, getDefault, getConfigPath,
  checkConfigVersion, mergeDefaults, CURRENT_CONFIG_VERSION, CONFIG_VERSION_REGISTRY,
};
