'use strict';

const { readFile, writeFile, fileExists, safePath } = require('./state');

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
  return safePath(CONFIG_FILE, cwd);
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

function validateConfig(cfg) {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(cfg)) throw new Error('Config must be a JSON object');
  for (const key of ['testRunner', 'framework', 'language', 'version']) {
    if (cfg[key] !== undefined && cfg[key] !== null && (typeof cfg[key] !== 'string' || !cfg[key].trim())) throw new Error(`${key} must be a nonempty string or null`);
  }
  for (const key of ['testRunners', 'testTypes', 'testRunnerSetup', 'models']) {
    if (cfg[key] !== undefined && !object(cfg[key])) throw new Error(`${key} must be an object`);
  }
  for (const key of ['sourceDirs', 'excludeDirs', 'excludePatterns']) {
    if (cfg[key] !== undefined && (!Array.isArray(cfg[key]) || cfg[key].some(value => typeof value !== 'string' || !value.trim()))) throw new Error(`${key} must be an array of nonempty strings`);
  }
  for (const key of ['configVersion', 'maxParallelAgents', 'staleLockMinutes']) {
    if (cfg[key] !== undefined && (!Number.isSafeInteger(cfg[key]) || cfg[key] < 1)) throw new Error(`${key} must be a positive integer`);
  }
  if (cfg.configVersion > CURRENT_CONFIG_VERSION) throw new Error('Config was written by a newer Sheriff version; update Sheriff first');
  for (const key of ['unit', 'e2e']) {
    if (cfg.testTypes?.[key] !== undefined && typeof cfg.testTypes[key] !== 'boolean') throw new Error(`testTypes.${key} must be boolean`);
    for (const group of ['testRunners', 'testRunnerSetup']) {
      if (cfg[group]?.[key] !== undefined && cfg[group][key] !== null && (typeof cfg[group][key] !== 'string' || !cfg[group][key].trim())) throw new Error(`${group}.${key} must be a nonempty string or null`);
    }
  }
  for (const [key, values] of Object.entries({phaseStrategy: ['risk', 'domain', 'complexity'], onTestFailure: ['flag', 'fix', 'fix+notify', 'fix-and-notify'], confidence: ['high', 'low']})) {
    if (cfg[key] !== undefined && !values.includes(cfg[key])) throw new Error(`Invalid ${key}`);
  }
  for (const key of ['light', 'medium', 'heavy']) {
    if (cfg.models?.[key] !== undefined && (typeof cfg.models[key] !== 'string' || !cfg.models[key].trim())) throw new Error(`models.${key} must be a nonempty string`);
  }
  return cfg;
}

function readStoredConfig(cwd) {
  const content = readFile(CONFIG_FILE, cwd);
  return content === null ? null : validateConfig(JSON.parse(content));
}

function readConfig(cwd = process.cwd()) {
  const cfg = readStoredConfig(cwd);
  if (!cfg) return null;
  // Older single-runner configurations remain useful after defaults are filled.
  if (cfg.testRunner && cfg.testRunners?.unit === undefined) cfg.testRunners = { ...cfg.testRunners, unit: cfg.testRunner };
  return mergeDefaults(cfg);
}

function writeConfig(config, cwd = process.cwd()) {
  validateConfig(config);
  writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', cwd);
}

function configExists(cwd = process.cwd()) { return fileExists(CONFIG_FILE, cwd); }

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
  const cfg = readStoredConfig(cwd);
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

  const storedVersion = cfg.configVersion ?? 0;

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
  checkConfigVersion, mergeDefaults, validateConfig, CURRENT_CONFIG_VERSION, CONFIG_VERSION_REGISTRY,
};
