#!/usr/bin/env node
'use strict';

/**
 * sheriff-tools — state engine CLI
 * All agent state mutations go through here.
 *
 * Usage: node sheriff-tools.js <command> [args] [--raw]
 *
 * Commands:
 *   init <stage> [subphaseId]     Return all context needed to start a stage
 *   claim-subphase <id> <agentId> Lock a subphase for an executor
 *   release-subphase <id>         Release a stale lock (--force to skip safety check)
 *   check-release <id>            Check if a subphase is safe to release
 *   mark-complete <id> <result>   Mark subphase pass|fail|review
 *   write-handoff <agentId>       Read handoff content from stdin and write to file
 *   read-handoff <agentId>        Print handoff file content
 *   write-result <id>             Read result content from stdin and write
 *   assemble-results <phaseNum>   Concatenate all phase results into one file
 *   write-summary <phaseNum>      Read summary from stdin and write phase summary
 *   git-checkpoint <id>           Read the current git HEAD without changing files
 *   git-commit <id> [msg] -- <files...> Commit explicit files only
 *   git-rollback                  Refuse unsafe automatic rollback
 *   update-testmap <file> <type> <status>  Update TEST_MAP.md coverage (type: unit|e2e, status: tested|review|failed)
 *   check-stale-locks             List stale locks and orphaned lock files
 *   cleanup-handoffs              Delete all handoff files
 *   get-status                    Return overall progress
 *   init-project                  Create .sheriff/ dir structure
 *   read-config                   Print current .sheriff.json
 *   write-config                  Read config JSON from stdin and write
 *   config-exists                 Exit 0 if .sheriff.json exists, 1 otherwise
 *   check-config-version          Compare stored config version against current, report missing fields
 *   print-banner                  Print the Sheriff ASCII banner with version
 *   check-update                  Check npm for newer version, exit 0 if up-to-date, 1 if update available
 *   current-version               Print the currently installed version
 */

const path = require('path');
const fs = require('fs');

const config = require('./lib/config');
const state = require('./lib/state');
const phases = require('./lib/phases');
const testmap = require('./lib/testmap');
const git = require('./lib/git');
const results = require('./lib/results');
const { printBanner } = require('./lib/banner');

function findPackageJson() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (pkg.name && pkg.name.includes('sheriff')) return pkg;
    }
    dir = path.dirname(dir);
  }
  throw new Error('Could not find sheriff package.json');
}

const args = process.argv.slice(2);
const separator = args.indexOf('--');
const rawIndex = args.findIndex((arg, index) => arg === '--raw' && (separator < 0 || index < separator));
const raw = rawIndex !== -1;
if (raw) args.splice(rawIndex, 1);

const command = args[0];
if (!command || command === '--help' || command === '-h') {
  process.stdout.write(fs.readFileSync(__filename, 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, '').trim() + '\n');
  process.exit(0);
}
const cwd = process.cwd();

function out(data) {
  if (data?.success === false) process.exitCode = 1;
  if (raw || typeof data !== 'string') {
    process.stdout.write(JSON.stringify(data) + '\n');
  } else {
    process.stdout.write(data + '\n');
  }
}

function err(msg) {
  process.stderr.write(`sheriff-tools error: ${msg}\n`);
  process.exit(1);
}

async function readStdin() {
  process.stdin.setEncoding('utf8');
  let content = '';
  for await (const chunk of process.stdin) content += chunk;
  return content;
}

// Guard: commands that require .sheriff/ directory to exist
const requiresSheriffDir = new Set([
  'claim-subphase', 'release-subphase', 'check-release', 'mark-complete', 'update-testmap',
  'write-result', 'write-handoff', 'read-handoff', 'assemble-results',
  'write-summary', 'check-stale-locks', 'cleanup-handoffs', 'get-status',
  'git-checkpoint', 'git-commit',
]);

async function main() {
if (requiresSheriffDir.has(command) && !state.fileExists('.sheriff', cwd)) {
  err('.sheriff/ directory not found. Run init-project first.');
}

const arity = { init: [1, 2], 'claim-subphase': [2, 2], 'release-subphase': [1, 2], 'check-release': [1, 1], 'mark-complete': [2, 2], 'write-handoff': [1, 1], 'read-handoff': [1, 1], 'write-result': [1, 1], 'assemble-results': [1, 1], 'write-summary': [1, 1], 'git-checkpoint': [1, 1], 'git-rollback': [0, 1], 'update-testmap': [3, 3] };
const noArgs = ['check-stale-locks', 'cleanup-handoffs', 'get-status', 'init-project', 'read-config', 'write-config', 'config-exists', 'check-config-version', 'print-banner', 'check-update', 'current-version'];
if (noArgs.includes(command)) arity[command] = [0, 0];
if (arity[command] && (args.length - 1 < arity[command][0] || args.length - 1 > arity[command][1])) throw new Error(`Invalid number of arguments for ${command}`);
if (command === 'release-subphase' && args.length === 3 && !args.includes('--force')) throw new Error('release-subphase only accepts --force');
if (command !== 'git-commit' && args.slice(1).some(arg => arg.startsWith('--') && !(command === 'release-subphase' && arg === '--force'))) throw new Error('Unknown option');
switch (command) {
  case 'init': {
    const stage = args[1];
    const subphaseId = args[2];
    if (!stage) err('init requires a stage argument');

    const cfg = config.readConfig(cwd);
    const phasesContent = state.readFile(state.PHASES_FILE, cwd);
    const status = state.getStatus(cwd);

    let subphaseBlock = null;
    if (subphaseId && phasesContent) {
      state.validateId(subphaseId, 'subphase');
      subphaseBlock = phases.parseSubphases(phasesContent).find(phase => phase.id === subphaseId)?.block || null;
    }

    const handoff = subphaseId ? state.readHandoff(subphaseId, cwd) : null;

    out({
      stage,
      subphaseId: subphaseId || null,
      config: cfg,
      status,
      subphaseBlock,
      hasHandoff: !!handoff,
      handoff: handoff || null,
      phasesPath: state.PHASES_FILE,
      testMapPath: state.TEST_MAP_FILE,
      assembledPath: state.ASSEMBLED_FILE,
    });
    break;
  }

  case 'claim-subphase': {
    const [, subphaseId, agentId] = args;
    if (!subphaseId || !agentId) err('claim-subphase requires <id> <agentId>');
    const result = phases.claimSubphase(subphaseId, agentId, cwd);
    out(result);
    break;
  }

  case 'release-subphase': {
    const forceIndex = args.indexOf('--force');
    const force = forceIndex !== -1;
    const releaseArgs = args.filter((a) => a !== '--force');
    const subphaseId = releaseArgs[1];
    if (!subphaseId) err('release-subphase requires <id>');
    const result = phases.releaseSubphase(subphaseId, cwd, force);
    out(result);
    break;
  }

  case 'check-release': {
    const subphaseId = args[1];
    if (!subphaseId) err('check-release requires <subphaseId>');
    const result = phases.getSafeToRelease(subphaseId, cwd);
    out(result);
    break;
  }

  case 'mark-complete': {
    const [, subphaseId, result] = args;
    if (!subphaseId || !result) err('mark-complete requires <id> <pass|fail|review>');
    if (!['pass', 'fail', 'review'].includes(result)) err('result must be pass, fail, or review');
    const r = phases.markComplete(subphaseId, result, cwd);
    out(r);
    break;
  }

  case 'write-handoff': {
    const agentId = args[1];
    if (!agentId) err('write-handoff requires <agentId>');
    const content = await readStdin();
    const file = state.writeHandoff(agentId, content, cwd);
    out({ success: true, file });
    break;
  }

  case 'read-handoff': {
    const agentId = args[1];
    if (!agentId) err('read-handoff requires <agentId>');
    const content = state.readHandoff(agentId, cwd);
    if (!content) err(`No handoff found for agent ${agentId}`);
    process.stdout.write(content);
    break;
  }

  case 'write-result': {
    const subphaseId = args[1];
    if (!subphaseId) err('write-result requires <id>');
    const content = await readStdin();
    const file = results.writeResult(subphaseId, content, cwd);
    out({ success: true, file });
    break;
  }

  case 'assemble-results': {
    const phaseNum = args[1];
    if (!phaseNum) err('assemble-results requires <phaseNum>');
    const assembled = results.assembleResults(phaseNum, cwd);
    if (!assembled) err(`No results found for phase ${phaseNum}`);
    out({
      success: true,
      file: state.ASSEMBLED_FILE,
      length: assembled.content.length,
      total: assembled.total,
      found: assembled.found,
      missing: assembled.missing,
    });
    break;
  }

  case 'write-summary': {
    const phaseNum = args[1];
    if (!phaseNum) err('write-summary requires <phaseNum>');
    const content = await readStdin();
    const file = results.writePhaseSummary(phaseNum, content, cwd);
    out({ success: true, file });
    break;
  }

  case 'git-checkpoint': {
    const subphaseId = args[1];
    if (!subphaseId) err('git-checkpoint requires <id>');
    const result = git.checkpoint(subphaseId, cwd);
    out(result);
    break;
  }

  case 'git-commit': {
    const end = args.indexOf('--');
    const files = end < 0 ? [] : args.slice(end + 1);
    const [, subphaseId, ...msgParts] = end < 0 ? args : args.slice(0, end);
    if (!subphaseId) err('git-commit requires <id>');
    const msg = msgParts.join(' ') || null;
    const result = git.commitSuccess(subphaseId, msg, cwd, files);
    out(result);
    break;
  }

  case 'git-rollback': {
    const result = git.rollback(cwd);
    out(result);
    break;
  }

  case 'update-testmap': {
    const [, sourceFile, testType, status] = args;
    if (!sourceFile || !testType || !status) err('update-testmap requires <sourceFile> <unit|e2e> <tested|review|failed>');
    if (!['unit', 'e2e'].includes(testType)) err('testType must be unit or e2e');
    if (!['tested', 'review', 'failed'].includes(status)) err('status must be tested, review, or failed');
    const r = testmap.updateCoverage(sourceFile, testType, status, cwd);
    out(r);
    break;
  }

  case 'check-stale-locks': {
    const stale = phases.getStaleLocks(cwd);
    const orphaned = phases.getOrphanedLockFiles(cwd);
    out({ staleLocks: stale, orphanedLockFiles: orphaned });
    break;
  }

  case 'cleanup-handoffs': {
    const result = state.cleanupHandoffs(cwd);
    out(result);
    break;
  }

  case 'get-status': {
    const status = state.getStatus(cwd);
    out(status);
    break;
  }

  case 'init-project': {
    state.ensureSheriffDir(cwd);
    out({ success: true, dir: state.SHERIFF_DIR });
    break;
  }

  case 'read-config': {
    const cfg = config.readConfig(cwd);
    if (!cfg) err('.sheriff.json not found');
    out(cfg);
    break;
  }

  case 'write-config': {
    const content = await readStdin();
    let cfg;
    try {
      cfg = JSON.parse(content);
    } catch {
      err('Invalid JSON for config');
    }
    config.writeConfig(cfg, cwd);
    out({ success: true, file: config.getConfigPath(cwd) });
    break;
  }

  case 'config-exists': {
    process.exit(config.configExists(cwd) ? 0 : 1);
    break; // unreachable, but prevents fall-through if process.exit is refactored
  }

  case 'check-config-version': {
    const result = config.checkConfigVersion(cwd);
    out(result);
    process.exit(result.needsMigration ? 1 : 0);
    break;
  }

  case 'print-banner': {
    const version = findPackageJson().version;
    printBanner(version);
    break;
  }

  case 'check-update': {
    const { execFileSync } = require('child_process');
    const pkg = findPackageJson();
    const currentVersion = pkg.version;
    const packageName = pkg.name;
    try {
      const latest = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['view', packageName, 'version'], {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const parse = value => /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null;
      const current = parse(currentVersion), remote = parse(latest);
      const difference = current && remote ? remote.findIndex((value, index) => value !== current[index]) : -1;
      const updateAvailable = difference >= 0 && remote[difference] > current[difference];
      out({ currentVersion, latestVersion: latest, updateAvailable });
      process.exit(updateAvailable ? 1 : 0);
    } catch (e) {
      // Network error or package not published yet — treat as up-to-date
      out({ currentVersion, latestVersion: null, updateAvailable: false, error: e.message });
      process.exit(0);
    }
    break;
  }

  case 'current-version': {
    const version = findPackageJson().version;
    out({ version });
    break;
  }

  default:
    err(`Unknown command: ${command}. Run --help to see usage.`);
}

}

main().catch(error => err(error.message));
