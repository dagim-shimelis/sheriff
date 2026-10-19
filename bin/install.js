#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { printBanner } = require('../sheriff/bin/lib/banner');
const pkg = require('../package.json');
const ROOT = path.resolve(__dirname, '..');
const TOOLS = ['claude', 'codex'];
const HOOK_FILES = ['sheriff-context-monitor.js', 'sheriff-statusline.js'];
const agentFiles = fs.readdirSync(path.join(ROOT, 'agents')).filter((f) => f.startsWith('sheriff-'));

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tool' || arg.startsWith('--tool=')) {
      if (options.tools) throw new Error('Use one --tool flag; separate tools with commas.');
      const value = arg === '--tool' ? args[++i] : arg.slice(7);
      const names = value === 'both' ? TOOLS : (value || '').split(',');
      if (names.some((name) => !TOOLS.includes(name))) {
        throw new Error('--tool must be claude, codex, both, or claude,codex.');
      }
      options.tools = [...new Set(names)];
    } else if (['--local', '--global', '--uninstall', '--silent', '--help'].includes(arg)) {
      options[arg.slice(2)] = true;
    } else {
      throw new Error(`Unknown argument: ${arg}. Use --help for usage.`);
    }
  }
  if (options.local && options.global) throw new Error('Choose either --local or --global.');
  return options;
}

function help() {
  console.log(`Sheriff installer\n\nUsage: npx ${pkg.name} [--tool claude|codex|both] [--local|--global]\n\n  --tool claude,codex  Install for both tools (also: --tool both)\n  --local             Install for the current project\n  --global            Install for all your projects\n  --uninstall         Remove the selected integrations; keep project state and tests\n  --silent            Suppress progress output; requires an explicit scope\n  --help              Show this help\n\nWithout flags, choose tools and scope interactively. Existing --local/--global\ncommands without --tool continue to target Claude Code.`);
}

function ask(rl, question) {
  return new Promise((resolve, reject) => {
    const onClose = () => reject(new Error('Installation cancelled before a selection was made.'));
    rl.once('close', onClose);
    rl.question(question, (answer) => {
      rl.removeListener('close', onClose);
      resolve(answer.trim().toLowerCase());
    });
  });
}

function readSettings(dir) {
  const file = path.join(dir, 'settings.json');
  if (!fs.existsSync(file)) return {};
  const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error(`Expected an object in ${file}; no settings were changed.`);
  }
  if (settings.hooks !== undefined && (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks))) {
    throw new Error(`Invalid hooks in ${file}; no settings were changed.`);
  }
  for (const entries of Object.values(settings.hooks || {})) {
    if (!Array.isArray(entries)) throw new Error(`Invalid hook list in ${file}; no settings were changed.`);
  }
  return settings;
}

function isSheriffHook(hook, dir) {
  if (typeof hook?.command !== 'string') return false;
  return HOOK_FILES.some((file) => {
    const target = path.join(dir, 'hooks', file);
    return [shellQuote(target), target, `"${target}"`].some((quoted) => hook.command === `node ${quoted}`);
  });
}

function cleanHooks(settings, dir) {
  for (const [event, entries] of Object.entries(settings.hooks || {})) {
    settings.hooks[event] = entries.flatMap((entry) => {
      if (isSheriffHook(entry, dir)) return [];
      if (!Array.isArray(entry?.hooks)) return [entry];
      const hooks = entry.hooks.filter((hook) => !isSheriffHook(hook, dir));
      if (hooks.length === entry.hooks.length) return [entry];
      return hooks.length ? [{ ...entry, hooks }] : [];
    });
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  if (isSheriffHook(settings.statusLine, dir)) delete settings.statusLine;
}

function shellQuote(value) {
  if (process.platform === 'win32') return `"${value.replaceAll('"', '')}"`;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function assertFile(target, base) {
  let current = target;
  while (current !== base) {
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat && (stat.isSymbolicLink() || (current === target ? !stat.isFile() : !stat.isDirectory()))) {
      throw new Error(`Refusing to modify an unexpected file or symlink: ${current}`);
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Path escapes installation: ${target}`);
    current = parent;
  }
}

function collect(src, dest, tool, scope, files) {
  if (fs.statSync(src).isDirectory()) {
    for (const file of fs.readdirSync(src)) collect(path.join(src, file), path.join(dest, file), tool, scope, files);
  } else {
    files.set(dest, src.endsWith('.md') ? Buffer.from(render(fs.readFileSync(src, 'utf8'), tool, scope)) : fs.readFileSync(src));
  }
}

function preflight(tool, base, scope, uninstall) {
  const dir = path.join(base, '.claude');
  const root = tool === 'claude' ? path.join(dir, 'sheriff') : path.join(base, '.agents', 'skills', 'sheriff');
  const manifestFile = path.join(root, '.install-manifest.json');
  const packageFile = path.join(root, 'package.json');
  assertFile(packageFile, base);
  assertFile(manifestFile, base);
  const installed = fs.existsSync(root);
  if (installed && (!fs.existsSync(packageFile) || ![pkg.name, '@dagim_s/sheriff'].includes(JSON.parse(fs.readFileSync(packageFile, 'utf8')).name))) {
    throw new Error(`Existing directory is not a Sheriff installation: ${root}`);
  }
  const files = new Map();
  collect(path.join(ROOT, 'sheriff'), root, tool, scope, files);
  collect(path.join(ROOT, 'workflows'), path.join(root, 'workflows'), tool, scope, files);
  collect(path.join(ROOT, 'agents'), path.join(root, 'agents'), tool, scope, files);
  collect(path.join(ROOT, 'package.json'), packageFile, tool, scope, files);
  if (tool === 'codex') {
    collect(path.join(ROOT, 'commands', 'sheriff'), path.join(root, 'commands'), tool, scope, files);
    collect(path.join(ROOT, 'integrations', 'codex', 'SKILL.md'), path.join(root, 'SKILL.md'), tool, scope, files);
  } else {
    collect(path.join(ROOT, 'commands', 'sheriff'), path.join(dir, 'commands', 'sheriff'), tool, scope, files);
    for (const file of agentFiles) collect(path.join(ROOT, 'agents', file), path.join(dir, 'agents', file), tool, scope, files);
    for (const file of HOOK_FILES) collect(path.join(ROOT, 'hooks', 'dist', file), path.join(dir, 'hooks', file), tool, scope, files);
  }

  let owned = new Set();
  if (fs.existsSync(manifestFile)) {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (!Array.isArray(manifest.files)) throw new Error(`Invalid installation manifest: ${manifestFile}`);
    for (const relative of manifest.files) {
      if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
        throw new Error(`Invalid installation manifest path: ${relative}`);
      }
      const file = path.resolve(base, relative);
      const withinRoot = file.startsWith(root + path.sep);
      const commandRoot = path.join(dir, 'commands', 'sheriff') + path.sep;
      const external = tool === 'claude' && (file.startsWith(commandRoot) ||
        (path.dirname(file) === path.join(dir, 'agents') && /^sheriff-[\w-]+\.md$/.test(path.basename(file))) ||
        HOOK_FILES.some((name) => file === path.join(dir, 'hooks', name)));
      if (!withinRoot && !external) throw new Error(`Manifest path is outside Sheriff: ${relative}`);
      owned.add(file);
    }
  } else if (installed) {
    // Older releases had no inventory; migrate only paths in the known package layout.
    owned = new Set([...files].filter(([file, content]) => {
      if (file.startsWith(root + path.sep)) return true;
      if (!fs.existsSync(file)) return false;
      assertFile(file, base);
      const previous = fs.readFileSync(file);
      const basename = path.basename(file);
      const oldAgent = path.join(root, 'agents', basename);
      const legacyCommand = path.dirname(file) === path.join(dir, 'commands', 'sheriff') &&
        previous.toString('utf8').startsWith(`---\nname: sheriff:${path.basename(file, '.md')}\n`);
      const legacyHook = path.dirname(file) === path.join(dir, 'hooks') && HOOK_FILES.includes(basename) &&
        previous.toString('utf8').startsWith(`// hooks/${basename}\n`);
      return previous.equals(content) || legacyCommand || legacyHook ||
        (path.dirname(file) === path.join(dir, 'agents') && fs.existsSync(oldAgent) && previous.equals(fs.readFileSync(oldAgent)));
    }).map(([file]) => file));
  }
  const changes = new Map();
  for (const file of new Set([...files.keys(), ...owned])) {
    assertFile(file, base);
    if (uninstall) {
      if (owned.has(file)) changes.set(file, null);
    } else {
      if (files.has(file) && fs.existsSync(file) && !owned.has(file)) throw new Error(`Refusing to overwrite an unowned file: ${file}`);
      changes.set(file, files.get(file) ?? null);
    }
  }
  if (uninstall) {
    if (installed) changes.set(manifestFile, null);
  } else {
    changes.set(manifestFile, Buffer.from(JSON.stringify({ files: [...files.keys()].map((file) => path.relative(base, file)) }, null, 2) + '\n'));
  }
  if (tool === 'claude') {
    const settingsFile = path.join(dir, 'settings.json');
    assertFile(settingsFile, base);
    const settings = readSettings(dir);
    if (!uninstall || installed) {
      cleanHooks(settings, dir);
      if (!uninstall) {
        settings.hooks ||= {};
        settings.hooks.PostToolUse ||= [];
        settings.hooks.PostToolUse.push({ hooks: [{ type: 'command', command: `node ${shellQuote(path.join(dir, 'hooks', HOOK_FILES[0]))}` }] });
        let inheritedStatusLine = false;
        if (scope === 'local') {
          try {
            const globalSettings = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8'));
            inheritedStatusLine = globalSettings !== null && Object.hasOwn(globalSettings, 'statusLine');
          } catch {}
        }
        if (!Object.hasOwn(settings, 'statusLine') && !inheritedStatusLine) {
          settings.statusLine = { type: 'command', command: `node ${shellQuote(path.join(dir, 'hooks', HOOK_FILES[1]))}` };
        }
      }
      if (!uninstall || fs.existsSync(settingsFile)) changes.set(settingsFile, Buffer.from(JSON.stringify(settings, null, 2) + '\n'));
    }
  }
  return { tool, root, base, changes };
}

function writeAtomic(file, content, mode) {
  const temp = `${file}.sheriff-${process.pid}-${require('crypto').randomUUID()}.tmp`;
  let created = false;
  try {
    fs.writeFileSync(temp, content, { flag: 'wx', mode });
    created = true;
    fs.renameSync(temp, file);
  } finally {
    if (created && fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function apply(targets) {
  const backups = [];
  const createdDirs = [];
  try {
    for (const { base, changes } of targets) {
      for (const [file, content] of changes) {
        assertFile(file, base);
        const stat = fs.statSync(file, { throwIfNoEntry: false });
        if (content === null && !stat) continue;
        const missing = [];
        for (let dir = path.dirname(file); !fs.existsSync(dir); dir = path.dirname(dir)) missing.push(dir);
        for (const dir of missing.reverse()) { fs.mkdirSync(dir); createdDirs.push(dir); }
        backups.push({ file, content: stat ? fs.readFileSync(file) : null, mode: stat?.mode });
        if (content === null) fs.unlinkSync(file);
        else writeAtomic(file, content, stat?.mode ?? 0o600);
      }
    }
  } catch (error) {
    const failures = [];
    for (const backup of backups.reverse()) {
      try {
        if (backup.content === null) fs.rmSync(backup.file, { force: true });
        else writeAtomic(backup.file, backup.content, backup.mode);
      } catch (failure) { failures.push(`${backup.file}: ${failure.message}`); }
    }
    for (const dir of createdDirs.reverse()) { try { fs.rmdirSync(dir); } catch {} }
    if (failures.length) error.message += `; rollback could not restore: ${failures.join('; ')}`;
    throw error;
  }
  // Remove only empty directories; personal files are never recursively deleted.
  for (const { root, changes } of targets) {
    const dirs = new Set();
    for (const file of changes.keys()) {
      for (let dir = path.dirname(file); dir === root || dir.startsWith(root + path.sep); dir = path.dirname(dir)) dirs.add(dir);
    }
    for (const dir of [...dirs].sort((a, b) => b.length - a.length)) { try { fs.rmdirSync(dir); } catch {} }
  }
}

function render(content, tool, scope) {
  content = content.replaceAll('{INSTALL_TOOL}', tool).replaceAll('{INSTALL_SCOPE}', scope)
    .replaceAll('{SHERIFF_RUNTIME}', tool === 'claude' ? '../../sheriff/runtime.md' : '../runtime.md');
  if (tool === 'codex') content = content.replaceAll('/sheriff:', '$sheriff ');
  return content;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return help();
  const log = options.silent ? () => {} : console.log;
  let scope = options.local ? 'local' : options.global ? 'global' : null;
  let selected = options.tools;
  // Existing automation used --local/--global without specifying a tool.
  if (!selected && scope) selected = ['claude'];
  if (!selected || !scope) {
    if (options.silent || !process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('Non-interactive setup requires --tool claude|codex|both and --local or --global.');
    }
    printBanner(pkg.version);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', () => rl.close());
    try {
      while (!selected) {
        const answer = await ask(rl, 'AI tools: (1) Claude Code, (2) Codex, (3) Both [1/2/3, default: 1]: ');
        const value = { '': 'claude', '1': 'claude', '2': 'codex', '3': 'both' }[answer] || answer;
        try { selected = parseArgs(['--tool', value]).tools; }
        catch { log('Choose claude, codex, or both.'); }
      }
      while (!scope) {
        const answer = await ask(rl, `${options.uninstall ? 'Uninstall' : 'Install'} for (l) this project or (g) all your projects? [l/g, default: g]: `);
        if (['l', 'local'].includes(answer)) scope = 'local';
        else if (['', 'g', 'global'].includes(answer)) scope = 'global';
        else log('Choose l or g.');
      }
    } finally { rl.close(); }
  }
  const base = scope === 'local' ? process.cwd() : os.homedir();
  const lock = path.join(base, '.sheriff-installer.lock');
  let descriptor;
  try { descriptor = fs.openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another installer may be running. Inspect the PID in ${lock}; only if it has stopped, remove the lock and retry.`);
    throw error;
  }
  try {
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    const targets = selected.map((tool) => preflight(tool, base, scope, options.uninstall));
    apply(targets);
    for (const { tool, root } of targets) {
      if (options.uninstall) log(`Uninstalled ${tool}. Project state, tests, and unowned files were preserved.`);
      else log(`Installed ${tool} → ${root}\nRun ${tool === 'codex' ? '$sheriff help in Codex (restart to discover the skill).' : '/sheriff:help in Claude Code.'}`);
    }
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(lock);
  }
}

main().catch((error) => {
  console.error('Sheriff setup failed:', error.message);
  process.exitCode = 1;
});
