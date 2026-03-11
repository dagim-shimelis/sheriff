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
 *   release-subphase <id>         Release a stale lock
 *   mark-complete <id> <result>   Mark subphase pass|fail|review
 *   write-handoff <agentId>       Read handoff content from stdin and write to file
 *   read-handoff <agentId>        Print handoff file content
 *   write-result <id>             Read result content from stdin and write
 *   assemble-results <phaseNum>   Concatenate all phase results into one file
 *   write-summary <phaseNum>      Read summary from stdin and write phase summary
 *   git-checkpoint <id>           Create a checkpoint git commit
 *   git-commit <id> [msg]         Create a success git commit
 *   git-rollback                  Reset to last commit
 *   check-stale-locks             List stale locks
 *   get-status                    Return overall progress
 *   init-project                  Create .sheriff/ dir structure
 *   read-config                   Print current .sheriff.json
 *   write-config                  Read config JSON from stdin and write
 *   config-exists                 Exit 0 if .sheriff.json exists, 1 otherwise
 *   print-banner                  Print the Sheriff ASCII banner with version
 *   check-update                  Check npm for newer version, exit 0 if up-to-date, 1 if update available
 *   current-version               Print the currently installed version
 */

const path = require('path');
const fs = require('fs');

const config = require('./lib/config');
const state = require('./lib/state');
const phases = require('./lib/phases');
const git = require('./lib/git');
const results = require('./lib/results');
const { printBanner } = require('./lib/banner');

const args = process.argv.slice(2);
const rawIndex = args.indexOf('--raw');
const raw = rawIndex !== -1;
if (raw) args.splice(rawIndex, 1);

const command = args[0];
const cwd = process.cwd();

function out(data) {
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

function readStdin() {
  return fs.readFileSync('/dev/stdin', 'utf8');
}

switch (command) {
  case 'init': {
    const stage = args[1];
    const subphaseId = args[2];
    if (!stage) err('init requires a stage argument');

    const cfg = config.readConfig(cwd);
    const phasesContent = state.readFile(state.PHASES_FILE, cwd);
    const testMap = state.readFile(state.TEST_MAP_FILE, cwd);
    const status = state.getStatus(cwd);

    let subphaseBlock = null;
    if (subphaseId && phasesContent) {
      const sectionMatch = phasesContent.match(
        new RegExp(`### ${subphaseId.replace(/\./g, '\\.')}[\\s\\S]*?(?=\\n### |$)`),
      );
      if (sectionMatch) subphaseBlock = sectionMatch[0];
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
    const [, , subphaseId, agentId] = args;
    if (!subphaseId || !agentId) err('claim-subphase requires <id> <agentId>');
    const result = phases.claimSubphase(subphaseId, agentId, cwd);
    out(result);
    break;
  }

  case 'release-subphase': {
    const subphaseId = args[1];
    if (!subphaseId) err('release-subphase requires <id>');
    const result = phases.releaseSubphase(subphaseId, cwd);
    out(result);
    break;
  }

  case 'mark-complete': {
    const [, , subphaseId, result] = args;
    if (!subphaseId || !result) err('mark-complete requires <id> <pass|fail|review>');
    if (!['pass', 'fail', 'review'].includes(result)) err('result must be pass, fail, or review');
    const r = phases.markComplete(subphaseId, result, cwd);
    out(r);
    break;
  }

  case 'write-handoff': {
    const agentId = args[1];
    if (!agentId) err('write-handoff requires <agentId>');
    const content = readStdin();
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
    const content = readStdin();
    const file = results.writeResult(subphaseId, content, cwd);
    out({ success: true, file });
    break;
  }

  case 'assemble-results': {
    const phaseNum = args[1];
    if (!phaseNum) err('assemble-results requires <phaseNum>');
    const assembled = results.assembleResults(phaseNum, cwd);
    if (!assembled) err(`No results found for phase ${phaseNum}`);
    out({ success: true, file: state.ASSEMBLED_FILE, length: assembled.length });
    break;
  }

  case 'write-summary': {
    const phaseNum = args[1];
    if (!phaseNum) err('write-summary requires <phaseNum>');
    const content = readStdin();
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
    const [, , subphaseId, ...msgParts] = args;
    if (!subphaseId) err('git-commit requires <id>');
    const msg = msgParts.join(' ') || null;
    const result = git.commitSuccess(subphaseId, msg, cwd);
    out(result);
    break;
  }

  case 'git-rollback': {
    const result = git.rollback(cwd);
    out(result);
    break;
  }

  case 'check-stale-locks': {
    const stale = phases.getStaleLocks(cwd);
    out(stale);
    break;
  }

  case 'get-status': {
    const status = state.getStatus(cwd);
    out(status);
    break;
  }

  case 'init-project': {
    state.ensureSheriffDir(cwd);
    fs.mkdirSync(path.join(cwd, results.RESULTS_DIR), { recursive: true });
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
    const content = readStdin();
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
  }

  case 'print-banner': {
    const version = require('../../package.json').version;
    printBanner(version);
    break;
  }

  case 'check-update': {
    const { execSync } = require('child_process');
    const currentVersion = require('../../package.json').version;
    const packageName = require('../../package.json').name;
    try {
      const latest = execSync(`npm view ${packageName} version`, {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const updateAvailable = latest !== currentVersion;
      out({ currentVersion, latestVersion: latest, updateAvailable });
      process.exit(updateAvailable ? 1 : 0);
    } catch (e) {
      // Network error or package not published yet — treat as up-to-date
      out({ currentVersion, latestVersion: null, updateAvailable: false, error: e.message });
      process.exit(0);
    }
  }

  case 'current-version': {
    const version = require('../../package.json').version;
    out({ version });
    break;
  }

  default:
    err(`Unknown command: ${command || '(none)'}\nRun with no args to see usage.`);
}
