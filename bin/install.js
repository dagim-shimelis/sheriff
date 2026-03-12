#!/usr/bin/env node
'use strict';

/**
 * @dagim_s/sheriff — npx installer
 *
 * Usage:
 *   npx @dagim_s/sheriff              # interactive
 *   npx @dagim_s/sheriff --global     # install globally (~/.claude/)
 *   npx @dagim_s/sheriff --local      # install locally (./.claude/)
 *   npx @dagim_s/sheriff --uninstall  # remove Sheriff files
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { printBanner } = require('../sheriff/bin/lib/banner');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const SHERIFF_DIR_NAME = 'sheriff';
const VERSION = require('../package.json').version;

const args = process.argv.slice(2);
const isGlobal = args.includes('--global');
const isLocal = args.includes('--local');
const isUninstall = args.includes('--uninstall');
const isSilent = args.includes('--silent');

function log(msg) {
  if (!isSilent) console.log(msg);
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function removeDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function getClaudeDirs() {
  const home = process.env.HOME || process.env.USERPROFILE;
  return {
    global: path.join(home, '.claude'),
    local: path.join(process.cwd(), '.claude'),
  };
}

function install(claudeDir, { skipBanner = false } = {}) {
  const target = path.join(claudeDir, SHERIFF_DIR_NAME);

  if (!isSilent && !skipBanner) printBanner(VERSION);
  log(`  Installing to ${claudeDir}/`);
  log('');

  // 1. Copy commands
  const commandsSrc = path.join(PACKAGE_ROOT, 'commands', 'sheriff');
  const commandsDest = path.join(claudeDir, 'commands', 'sheriff');
  if (fs.existsSync(commandsSrc)) {
    copyDir(commandsSrc, commandsDest);
    log(`  ✅ Commands   → ${commandsDest}`);
  }

  // 2. Copy agents
  const agentsSrc = path.join(PACKAGE_ROOT, 'agents');
  const agentsDest = path.join(claudeDir, 'agents');
  fs.mkdirSync(agentsDest, { recursive: true });
  for (const file of fs.readdirSync(agentsSrc)) {
    if (file.startsWith('sheriff-')) {
      fs.copyFileSync(path.join(agentsSrc, file), path.join(agentsDest, file));
    }
  }
  log(`  ✅ Agents     → ${agentsDest}`);

  // 3. Copy hooks (pre-built dist)
  const hooksSrc = path.join(PACKAGE_ROOT, 'hooks', 'dist');
  const hooksDest = path.join(claudeDir, 'hooks');
  if (fs.existsSync(hooksSrc)) {
    fs.mkdirSync(hooksDest, { recursive: true });
    for (const file of fs.readdirSync(hooksSrc)) {
      if (file.startsWith('sheriff-')) {
        fs.copyFileSync(path.join(hooksSrc, file), path.join(hooksDest, file));
      }
    }
    log(`  ✅ Hooks      → ${hooksDest}`);
  } else {
    // Fallback: copy raw hooks if dist not built
    const hooksRawSrc = path.join(PACKAGE_ROOT, 'hooks');
    fs.mkdirSync(hooksDest, { recursive: true });
    for (const file of fs.readdirSync(hooksRawSrc)) {
      if (file.startsWith('sheriff-') && file.endsWith('.js')) {
        fs.copyFileSync(path.join(hooksRawSrc, file), path.join(hooksDest, file));
      }
    }
    log(`  ✅ Hooks      → ${hooksDest} (raw — run scripts/build-hooks.js to bundle)`);
  }

  // 4. Copy sheriff/ directory (tools, templates, references, workflows)
  const sheriffSrc = path.join(PACKAGE_ROOT, 'sheriff');
  copyDir(sheriffSrc, target);
  log(`  ✅ Tools      → ${target}`);

  // 5. Copy workflows
  const workflowsSrc = path.join(PACKAGE_ROOT, 'workflows');
  const workflowsDest = path.join(target, 'workflows');
  if (fs.existsSync(workflowsSrc)) {
    copyDir(workflowsSrc, workflowsDest);
    log(`  ✅ Workflows  → ${workflowsDest}`);
  }

  // 6. Copy package.json so sheriff-tools.js can read version/name
  const pkgSrc = path.join(PACKAGE_ROOT, 'package.json');
  const pkgDest = path.join(target, 'package.json');
  if (fs.existsSync(pkgSrc)) {
    fs.copyFileSync(pkgSrc, pkgDest);
  }

  // 7. Inject hook config into settings.json
  injectHookConfig(claudeDir);

  const { GOLD, RESET, GRAY, GREEN } = require('../sheriff/bin/lib/banner');
  log('');
  log(`  ${GOLD}Done!${RESET}`);
  log('');
  log(`  Run ${GOLD}/sheriff:help${RESET} inside Claude Code to get started.`);
  log('');
}

function injectHookConfig(claudeDir) {
  const settingsFile = path.join(claudeDir, 'settings.json');
  let settings = {};

  if (fs.existsSync(settingsFile)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch {}
  }

  settings.hooks = settings.hooks || {};
  settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];
  settings.hooks.Statusline = settings.hooks.Statusline || [];

  // Avoid duplicates
  const contextMonitorCmd = `node ${path.join(claudeDir, 'hooks', 'sheriff-context-monitor.js')}`;
  const statuslineCmd = `node ${path.join(claudeDir, 'hooks', 'sheriff-statusline.js')}`;

  const hasContextMonitor = settings.hooks.PostToolUse.some(
    (h) => typeof h === 'object' && h.command && h.command.includes('sheriff-context-monitor'),
  );
  const hasStatusline = settings.hooks.Statusline.some(
    (h) => typeof h === 'object' && h.command && h.command.includes('sheriff-statusline'),
  );

  if (!hasContextMonitor) {
    settings.hooks.PostToolUse.push({
      // SHERIFF_HOOK_START
      command: contextMonitorCmd,
      // SHERIFF_HOOK_END
    });
  }

  if (!hasStatusline) {
    settings.hooks.Statusline.push({
      // SHERIFF_HOOK_START
      command: statuslineCmd,
      // SHERIFF_HOOK_END
    });
  }

  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  log(`  ✅ Hooks      → ${settingsFile}`);
}

function uninstall(claudeDir) {
  log('');
  log(`Uninstalling @dagim_s/sheriff from ${claudeDir}/`);

  // Remove commands
  removeDir(path.join(claudeDir, 'commands', 'sheriff'));

  // Remove agents
  const agentsDir = path.join(claudeDir, 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const file of fs.readdirSync(agentsDir)) {
      if (file.startsWith('sheriff-')) {
        fs.unlinkSync(path.join(agentsDir, file));
      }
    }
  }

  // Remove hooks
  const hooksDir = path.join(claudeDir, 'hooks');
  if (fs.existsSync(hooksDir)) {
    for (const file of fs.readdirSync(hooksDir)) {
      if (file.startsWith('sheriff-')) {
        fs.unlinkSync(path.join(hooksDir, file));
      }
    }
  }

  // Remove sheriff/ directory
  removeDir(path.join(claudeDir, SHERIFF_DIR_NAME));

  // Remove hook config entries from settings.json
  const settingsFile = path.join(claudeDir, 'settings.json');
  if (fs.existsSync(settingsFile)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      if (settings.hooks) {
        for (const event of Object.keys(settings.hooks)) {
          settings.hooks[event] = (settings.hooks[event] || []).filter(
            (h) => !(typeof h === 'object' && h.command && h.command.includes('sheriff-')),
          );
        }
      }
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    } catch {}
  }

  log('✅ Sheriff uninstalled. Your .sheriff/ project files were not touched.');
  log('');
}

async function main() {
  const dirs = getClaudeDirs();

  let targetDir;

  if (isUninstall) {
    if (isGlobal) targetDir = dirs.global;
    else if (isLocal) targetDir = dirs.local;
    else {
      const answer = await prompt('Uninstall from (g)lobal or (l)ocal? [g/l]: ');
      targetDir = answer.toLowerCase() === 'l' ? dirs.local : dirs.global;
    }
    uninstall(targetDir);
    return;
  }

  if (isGlobal) {
    targetDir = dirs.global;
    install(targetDir);
  } else if (isLocal) {
    targetDir = dirs.local;
    install(targetDir);
  } else {
    if (!isSilent) printBanner(VERSION);

    const { GOLD, RESET, GRAY } = require('../sheriff/bin/lib/banner');
    log(`  Where would you like to install Sheriff?`);
    log('');
    log(`    ${GOLD}g)${RESET} Global  ${GRAY}~/.claude/ — available in all projects${RESET}`);
    log(`    ${GOLD}l)${RESET} Local   ${GRAY}./.claude/ — scoped to this project only${RESET}`);
    log('');

    const answer = await prompt('  Your choice [g/l, default: g]: ');
    log('');
    targetDir = answer.toLowerCase() === 'l' ? dirs.local : dirs.global;

    install(targetDir, { skipBanner: true });
  }
}

main().catch((e) => {
  console.error('Install failed:', e.message);
  process.exit(1);
});
