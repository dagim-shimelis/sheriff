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
const commandFiles = fs.readdirSync(path.join(ROOT, 'commands', 'sheriff'));
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
  console.log(`Sheriff installer\n\nUsage: npx @dagim_s/sheriff [--tool claude|codex|both] [--local|--global]\n\n  --tool claude,codex  Install for both tools (also: --tool both)\n  --local             Install for the current project\n  --global            Install for all your projects\n  --uninstall         Remove the selected integrations; keep project state and tests\n  --silent            Suppress progress output; requires an explicit scope\n  --help              Show this help\n\nWithout flags, choose tools and scope interactively. Existing --local/--global\ncommands without --tool continue to target Claude Code.`);
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

function isSheriffHook(hook) {
  return typeof hook?.command === 'string' && /^node\s/.test(hook.command) && HOOK_FILES.some((file) =>
    ['/', '\\'].some((separator) => ['', "'", '"'].some((quote) => hook.command.endsWith(`${separator}${file}${quote}`))));
}

function cleanHooks(settings) {
  for (const [event, entries] of Object.entries(settings.hooks || {})) {
    settings.hooks[event] = entries.flatMap((entry) => {
      if (isSheriffHook(entry)) return [];
      if (!Array.isArray(entry?.hooks)) return [entry];
      const hooks = entry.hooks.filter((hook) => !isSheriffHook(hook));
      if (hooks.length === entry.hooks.length) return [entry];
      return hooks.length ? [{ ...entry, hooks }] : [];
    });
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  if (isSheriffHook(settings.statusLine)) delete settings.statusLine;
}

function shellQuote(value) {
  if (process.platform === 'win32') return `"${value.replaceAll('"', '')}"`;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function writeSettings(dir, settings) {
  const file = path.join(dir, 'settings.json');
  const temp = `${file}.sheriff-${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(settings, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function assertNoSymlink(target) {
  if (!fs.existsSync(target) && !fs.lstatSync(target, { throwIfNoEntry: false })) return;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to modify a symlink: ${target}`);
  if (stat.isDirectory()) {
    for (const file of fs.readdirSync(target)) assertNoSymlink(path.join(target, file));
  }
}

function preflight(tool, base, uninstall) {
  const root = tool === 'claude' ? path.join(base, '.claude', 'sheriff') : path.join(base, '.agents', 'skills', 'sheriff');
  // Check only paths this installer owns or writes; unrelated integrations stay untouched.
  const parents = tool === 'claude' ? ['.claude', '.claude/commands', '.claude/agents', '.claude/hooks'] : ['.agents', '.agents/skills'];
  for (const parent of parents) {
    const target = path.join(base, parent);
    const stat = fs.lstatSync(target, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`Expected a real directory: ${target}`);
  }
  assertNoSymlink(root);
  if (fs.existsSync(root)) {
    const manifest = path.join(root, 'package.json');
    if (!fs.existsSync(manifest) || JSON.parse(fs.readFileSync(manifest, 'utf8')).name !== pkg.name) {
      throw new Error(`Existing directory is not a Sheriff installation: ${root}`);
    }
  }
  if (tool === 'claude') {
    const dir = path.join(base, '.claude');
    assertNoSymlink(path.join(dir, 'settings.json'));
    assertNoSymlink(path.join(dir, 'commands', 'sheriff'));
    for (const file of agentFiles) assertNoSymlink(path.join(dir, 'agents', file));
    for (const file of HOOK_FILES) {
      assertNoSymlink(path.join(dir, 'hooks', file));
      if (!uninstall && !fs.existsSync(path.join(ROOT, 'hooks', 'dist', file))) {
        throw new Error('Built hooks are missing. Run npm run build:hooks first.');
      }
    }
    return { tool, root, dir, settings: readSettings(dir) };
  }
  return { tool, root };
}

function render(content, tool, scope) {
  content = content.replaceAll('{INSTALL_TOOL}', tool).replaceAll('{INSTALL_SCOPE}', scope)
    .replaceAll('{SHERIFF_RUNTIME}', tool === 'claude' ? '../../sheriff/runtime.md' : '../runtime.md');
  if (tool === 'codex') content = content.replaceAll('/sheriff:', '$sheriff ');
  return content;
}

function copy(src, dest, tool, scope) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) copy(path.join(src, file), path.join(dest, file), tool, scope);
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (src.endsWith('.md')) fs.writeFileSync(dest, render(fs.readFileSync(src, 'utf8'), tool, scope));
    else fs.copyFileSync(src, dest);
  }
}

function install(target, scope, log) {
  const { tool, root, dir, settings } = target;
  copy(path.join(ROOT, 'sheriff'), root, tool, scope);
  copy(path.join(ROOT, 'workflows'), path.join(root, 'workflows'), tool, scope);
  copy(path.join(ROOT, 'agents'), path.join(root, 'agents'), tool, scope);
  copy(path.join(ROOT, 'package.json'), path.join(root, 'package.json'), tool, scope);

  if (tool === 'codex') {
    copy(path.join(ROOT, 'commands', 'sheriff'), path.join(root, 'commands'), tool, scope);
    copy(path.join(ROOT, 'integrations', 'codex', 'SKILL.md'), path.join(root, 'SKILL.md'), tool, scope);
    log(`Installed Codex skill → ${root}\nRun $sheriff help in Codex. Restart Codex if the skill is not listed.`);
    return;
  }

  copy(path.join(ROOT, 'commands', 'sheriff'), path.join(dir, 'commands', 'sheriff'), tool, scope);
  for (const file of agentFiles) copy(path.join(ROOT, 'agents', file), path.join(dir, 'agents', file), tool, scope);
  for (const file of HOOK_FILES) copy(path.join(ROOT, 'hooks', 'dist', file), path.join(dir, 'hooks', file), tool, scope);
  cleanHooks(settings);
  settings.hooks ||= {};
  settings.hooks.PostToolUse ||= [];
  settings.hooks.PostToolUse.push({ hooks: [{ type: 'command', command: `node ${shellQuote(path.join(dir, 'hooks', HOOK_FILES[0]))}` }] });
  // Keep the user's own statusline instead of replacing it.
  settings.statusLine ||= { type: 'command', command: `node ${shellQuote(path.join(dir, 'hooks', HOOK_FILES[1]))}` };
  writeSettings(dir, settings);
  log(`Installed Claude Code commands → ${dir}\nRun /sheriff:help in Claude Code.`);
}

function uninstall(target, log) {
  const { tool, root, dir, settings } = target;
  if (tool === 'claude') {
    // Validate and update settings before removing the files they refer to.
    if (fs.existsSync(path.join(dir, 'settings.json'))) {
      cleanHooks(settings);
      writeSettings(dir, settings);
    }
    for (const file of commandFiles) fs.rmSync(path.join(dir, 'commands', 'sheriff', file), { force: true });
    for (const file of agentFiles) fs.rmSync(path.join(dir, 'agents', file), { force: true });
    for (const file of HOOK_FILES) fs.rmSync(path.join(dir, 'hooks', file), { force: true });
  }
  fs.rmSync(root, { recursive: true, force: true });
  log(`Uninstalled ${tool}. Your .sheriff/ project state and test files were not touched.`);
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
  const targets = selected.map((tool) => preflight(tool, base, options.uninstall));
  for (const target of targets) {
    if (options.uninstall) uninstall(target, log);
    else install(target, scope, log);
  }
}

main().catch((error) => {
  console.error('Sheriff setup failed:', error.message);
  process.exitCode = 1;
});
