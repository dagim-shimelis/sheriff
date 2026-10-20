#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { stripVTControlCharacters } = require('node:util');
const { select } = require('./lib/select');
const { packageManager, installArgs } = require('./lib/package-manager');
const { spawnSync } = require('child_process');
const pkg = require('../package.json');
const ROOT = path.resolve(__dirname, '..');
const TOOLS = ['claude', 'codex'];
const HOOK_FILES = ['sheriff-context-monitor.js', 'sheriff-statusline.js'];
const SKILL_MARKER = '<!-- sheriff-managed: package -->';
const ACTION_MARKER = '<!-- sheriff-managed: action-skill -->';
const CODEX_ACTIONS = {
  run: 'Generate and run tests, or resume Sheriff coverage work.',
  audit: 'Inspect source code for issues with Sheriff.',
  sync: 'Update tests after code changes with Sheriff.',
  status: 'Show Sheriff progress and current test coverage work.',
  configure: 'Configure Sheriff for this project.',
  help: 'Explain Sheriff actions and usage.',
};
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
  console.log(`Sheriff installer\n\nUsage: npx ${pkg.name}@latest [--tool claude|codex|both] [--local|--global]\n\n  --tool claude,codex  Install for both tools (also: --tool both)\n  --local             Install the project dependency and register integrations\n  --global            Install for all your projects\n  --uninstall         Remove the selected integrations; keep project state and tests\n  --silent            Suppress progress output; requires an explicit scope\n  --help              Show this help\n\nLocal setup automatically installs ${pkg.name} when needed.\nWithout flags, choose tools and scope interactively. Existing --local/--global\ncommands without --tool continue to target Claude Code.`);
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

function isSheriffHook(hook, dir, scope) {
  if (typeof hook?.command !== 'string') return false;
  return HOOK_FILES.some((file) => {
    const target = path.join(dir, 'hooks', file);
    return (scope === 'local' && hook.command === localHookCommand(file)) ||
      [shellQuote(target), target, `"${target}"`].some((quoted) => hook.command === `node ${quoted}`);
  });
}

function cleanHooks(settings, dir, scope, previousStatusLine) {
  for (const [event, entries] of Object.entries(settings.hooks || {})) {
    settings.hooks[event] = entries.flatMap((entry) => {
      if (isSheriffHook(entry, dir, scope)) return [];
      if (!Array.isArray(entry?.hooks)) return [entry];
      const hooks = entry.hooks.filter((hook) => !isSheriffHook(hook, dir, scope));
      if (hooks.length === entry.hooks.length) return [entry];
      return hooks.length ? [{ ...entry, hooks }] : [];
    });
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  const previousIsSheriff = typeof previousStatusLine === 'string' && path.isAbsolute(previousStatusLine) &&
    path.basename(previousStatusLine) === HOOK_FILES[1] && path.basename(path.dirname(previousStatusLine)) === 'hooks' &&
    path.basename(path.dirname(path.dirname(previousStatusLine))) === '.claude';
  if (isSheriffHook(settings.statusLine, dir, scope) ||
    (previousIsSheriff && settings.statusLine?.command === `node ${shellQuote(previousStatusLine)}`)) delete settings.statusLine;
}

function localHookCommand(file) {
  return `node "${'${CLAUDE_PROJECT_DIR}'}/.claude/hooks/${file}"`;
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

function localDependencyRoot(base) {
  let directory = base;
  while (true) {
    const root = path.join(directory, 'node_modules', pkg.name);
    if (fs.existsSync(path.join(root, 'package.json'))) return root;
    const parent = path.dirname(directory);
    if (parent === directory || fs.existsSync(path.join(directory, '.git'))) return path.join(base, 'node_modules', pkg.name);
    directory = parent;
  }
}

function ensureProjectDependency(base, silent) {
  const projectFile = path.join(base, 'package.json');
  const project = fs.existsSync(projectFile) ? JSON.parse(fs.readFileSync(projectFile, 'utf8')) : {};
  if (!project || typeof project !== 'object' || Array.isArray(project)) throw new Error('Invalid project package.json.');
  if (project.name === pkg.name) throw new Error('Cannot install Sheriff as a dependency of its own source repository. Use a separate project or --global.');
  const declared = project.devDependencies?.[pkg.name] || project.dependencies?.[pkg.name];
  if (declared && fs.existsSync(path.join(localDependencyRoot(base), 'package.json'))) return;
  const manager = packageManager(base);
  const command = process.platform === 'win32' && manager !== 'bun' ? `${manager}.cmd` : manager;
  const args = installArgs(manager, `${pkg.name}@${pkg.version}`, declared);
  if (!declared && manager === 'pnpm' && fs.existsSync(path.join(base, 'pnpm-workspace.yaml'))) args.push('--workspace-root');
  if (manager === 'yarn') {
    const linker = spawnSync(command, ['config', 'get', 'nodeLinker'], { cwd: base, encoding: 'utf8', shell: process.platform === 'win32' });
    if (linker.error || linker.status !== 0) throw new Error(`Could not check Yarn's nodeLinker: ${linker.error?.message || linker.stderr}`);
    const nodeLinker = stripVTControlCharacters(linker.stdout).trim();
    if (nodeLinker === 'pnp') throw new Error('Local Sheriff installs require node_modules. This Yarn project uses Plug’n’Play; use Sheriff --global or configure nodeLinker: node-modules before local setup.');
    if (!declared && project.workspaces && nodeLinker === 'undefined') args.push('--ignore-workspace-root-check');
  }
  if (!silent) console.log(`${declared ? 'Restoring' : 'Installing'} ${pkg.name} project dependency with ${manager}…`);
  const result = spawnSync(command, args, {
    cwd: base, stdio: silent ? 'pipe' : 'inherit', encoding: 'utf8', shell: process.platform === 'win32',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Could not install the Sheriff project dependency: ${result.error?.message || result.stderr?.trim() || `${manager} exited with ${result.status}`}. Fix the ${manager} error and rerun setup.`);
  }
}

function projectDependency(base, tools) {
  const instruction = `Run npm install --save-dev ${pkg.name}@latest in this project, then rerun the Sheriff installer with --local.`;
  const projectFile = path.join(base, 'package.json');
  if (!fs.existsSync(projectFile)) throw new Error(`Local installs require a declared project dependency. ${instruction}`);
  const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  if (!project || !(project.devDependencies?.[pkg.name] || project.dependencies?.[pkg.name])) {
    throw new Error(`Local installs require ${pkg.name} in package.json dependencies or devDependencies. ${instruction}`);
  }
  const root = localDependencyRoot(base);
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (metadata.name !== pkg.name || typeof metadata.version !== 'string') throw new Error('invalid package metadata');
    for (const tool of tools) {
      const runtime = path.join(root, 'dist', tool);
      for (const file of ['runtime.md', 'package.json', 'bin/sheriff-tools.js', ...(tool === 'codex' ? ['SKILL.md'] : [])]) {
        if (!fs.statSync(path.join(runtime, file)).isFile()) throw new Error(`missing ${tool} runtime ${file}`);
      }
      const bundled = JSON.parse(fs.readFileSync(path.join(runtime, 'package.json'), 'utf8'));
      if (bundled.name !== metadata.name || bundled.version !== metadata.version) throw new Error(`mismatched ${tool} runtime metadata`);
      if (!Array.isArray(bundled.files) || !bundled.files.length) throw new Error(`missing ${tool} runtime inventory`);
      for (const file of bundled.files) {
        if (typeof file !== 'string' || !file || path.isAbsolute(file) || file.split(/[\\/]/).some((part) => part === '..' || part === '.')) {
          throw new Error(`invalid ${tool} runtime inventory path`);
        }
        if (!fs.statSync(path.join(runtime, file)).isFile()) throw new Error(`missing ${tool} runtime ${file}`);
      }
    }
    return { root, version: metadata.version };
  } catch (error) {
    throw new Error(`The project's Sheriff dependency is missing, incomplete, or predates package-backed installs (${error.message}). ${instruction}`);
  }
}

function wrapper(source, destination, skill = false) {
  const content = fs.readFileSync(source, 'utf8');
  const frontmatter = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0];
  if (!frontmatter) throw new Error(`Missing integration metadata: ${source}`);
  const relative = path.relative(path.dirname(destination), source).split(path.sep).join('/');
  return Buffer.from(`${frontmatter}\n${skill ? SKILL_MARKER + '\n\n' : ''}Read and follow [Sheriff instructions](${relative}), preserving the user's request and arguments. Resolve that document's resources relative to its own location, and execute project commands in the user's project root.\n\nIf the resource is missing, run \`npm install\` in the project to restore its declared Sheriff dependency before continuing.\n`);
}

function preflight(tool, base, scope, uninstall, dependency) {
  const dir = path.join(base, '.claude');
  const root = tool === 'claude' ? path.join(dir, 'sheriff') : path.join(base, '.agents', 'skills', 'sheriff');
  const manifestFile = path.join(root, '.install-manifest.json');
  const packageFile = path.join(root, 'package.json');
  const skillFile = path.join(root, 'SKILL.md');
  const actionFiles = tool === 'codex' ? Object.keys(CODEX_ACTIONS).map((action) =>
    path.join(path.dirname(root), `sheriff-${action}`, 'SKILL.md')) : [];
  const ownedActions = new Set();
  for (const file of actionFiles) {
    assertFile(file, base);
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').split(/\r?\n/).includes(ACTION_MARKER)) ownedActions.add(file);
  }
  assertFile(packageFile, base);
  assertFile(manifestFile, base);
  assertFile(skillFile, base);
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : null;
  if (fs.existsSync(manifestFile) && (!manifest || !Array.isArray(manifest.files))) throw new Error(`Invalid installation manifest: ${manifestFile}`);
  const markedSkill = tool === 'codex' && fs.existsSync(skillFile) && fs.readFileSync(skillFile, 'utf8').split(/\r?\n/).includes(SKILL_MARKER);
  const installed = fs.existsSync(root);
  const packageName = fs.existsSync(packageFile) ? JSON.parse(fs.readFileSync(packageFile, 'utf8')).name : null;
  if (installed && (packageName ? ![pkg.name, '@dagim_s/sheriff'].includes(packageName) :
    !markedSkill && !(manifest?.name === pkg.name && manifest.layout === 'package'))) {
    throw new Error(`Existing directory is not a Sheriff installation: ${root}`);
  }
  const legacyFiles = new Map();
  collect(path.join(ROOT, 'sheriff'), root, tool, scope, legacyFiles);
  collect(path.join(ROOT, 'workflows'), path.join(root, 'workflows'), tool, scope, legacyFiles);
  collect(path.join(ROOT, 'agents'), path.join(root, 'agents'), tool, scope, legacyFiles);
  collect(path.join(ROOT, 'package.json'), packageFile, tool, scope, legacyFiles);
  if (tool === 'codex') {
    collect(path.join(ROOT, 'commands', 'sheriff'), path.join(root, 'commands'), tool, scope, legacyFiles);
    collect(path.join(ROOT, 'integrations', 'codex', 'SKILL.md'), path.join(root, 'SKILL.md'), tool, scope, legacyFiles);
  } else {
    collect(path.join(ROOT, 'commands', 'sheriff'), path.join(dir, 'commands', 'sheriff'), tool, scope, legacyFiles);
    for (const file of agentFiles) collect(path.join(ROOT, 'agents', file), path.join(dir, 'agents', file), tool, scope, legacyFiles);
    for (const file of HOOK_FILES) collect(path.join(ROOT, 'hooks', 'dist', file), path.join(dir, 'hooks', file), tool, scope, legacyFiles);
  }
  const files = scope === 'global' ? legacyFiles : new Map();
  if (scope === 'local' && !uninstall) {
    const runtime = path.join(dependency.root, 'dist', tool);
    if (tool === 'codex') {
      const source = path.join(runtime, 'SKILL.md');
      files.set(skillFile, wrapper(source, skillFile, true));
    } else {
      for (const file of fs.readdirSync(path.join(runtime, 'commands'))) {
        const source = path.join(runtime, 'commands', file);
        const destination = path.join(dir, 'commands', 'sheriff', file);
        files.set(destination, wrapper(source, destination));
      }
      for (const file of fs.readdirSync(path.join(runtime, 'agents')).filter((file) => file.startsWith('sheriff-') && file.endsWith('.md'))) {
        const source = path.join(runtime, 'agents', file);
        const destination = path.join(dir, 'agents', file);
        files.set(destination, wrapper(source, destination));
      }
      for (const file of HOOK_FILES) {
        const source = path.join(dependency.root, 'hooks', 'dist', file);
        if (!fs.statSync(source).isFile()) throw new Error(`Missing Sheriff hook: ${source}`);
        const destination = path.join(dir, 'hooks', file);
        const relative = path.relative(path.dirname(destination), source).split(path.sep).join('/');
        files.set(destination, Buffer.from(`'use strict';\nrequire(${JSON.stringify(relative)});\n`));
      }
    }
  }

  if (tool === 'codex' && !uninstall) {
    for (const [index, [action, description]] of Object.entries(CODEX_ACTIONS).entries()) {
      const file = actionFiles[index];
      files.set(file, Buffer.from(`---\nname: sheriff-${action}\ndescription: ${description}\n---\n\n${ACTION_MARKER}\n\nRead and follow [Sheriff instructions](../sheriff/SKILL.md) as \`$sheriff ${action}\`, preserving the user's arguments and flags. Resolve resources relative to the referenced instruction file and execute commands in the user's project root.\n`));
    }
  }

  let owned = new Set();
  if (manifest) {
    if (!Array.isArray(manifest.files)) throw new Error(`Invalid installation manifest: ${manifestFile}`);
    for (const relative of manifest.files) {
      if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
        throw new Error(`Invalid installation manifest path: ${relative}`);
      }
      const file = path.resolve(base, relative);
      const withinRoot = file.startsWith(root + path.sep);
      const commandRoot = path.join(dir, 'commands', 'sheriff') + path.sep;
      const external = (tool === 'codex' && actionFiles.includes(file)) || tool === 'claude' && (file.startsWith(commandRoot) ||
        (path.dirname(file) === path.join(dir, 'agents') && /^sheriff-[\w-]+\.md$/.test(path.basename(file))) ||
        HOOK_FILES.some((name) => file === path.join(dir, 'hooks', name)));
      if (!withinRoot && !external) throw new Error(`Manifest path is outside Sheriff: ${relative}`);
      owned.add(file);
    }
  } else if (installed && packageName) {
    // Older releases had no inventory; migrate only paths in the known package layout.
    owned = new Set([...legacyFiles].filter(([file, content]) => {
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
  for (const file of ownedActions) owned.add(file);
  if (markedSkill) owned.add(skillFile);
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
  const inventory = { name: pkg.name, layout: scope === 'local' ? 'package' : 'copied', files: [...files.keys()].map((file) => path.relative(base, file)) };
  if (uninstall || (scope === 'local' && tool === 'codex')) {
    if (fs.existsSync(manifestFile)) changes.set(manifestFile, null);
  }
  if (tool === 'claude') {
    const settingsFile = path.join(dir, 'settings.json');
    assertFile(settingsFile, base);
    const settings = readSettings(dir);
    if (!uninstall || installed) {
      cleanHooks(settings, dir, scope, manifest?.statusLine);
      if (!uninstall) {
        const hookCommand = (file) => scope === 'local' ? localHookCommand(file) : `node ${shellQuote(path.join(dir, 'hooks', file))}`;
        settings.hooks ||= {};
        settings.hooks.PostToolUse ||= [];
        settings.hooks.PostToolUse.push({ hooks: [{ type: 'command', command: hookCommand(HOOK_FILES[0]) }] });
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
        if (isSheriffHook(settings.statusLine, dir, scope)) inventory.statusLine = path.join(dir, 'hooks', HOOK_FILES[1]);
      }
      if (!uninstall || fs.existsSync(settingsFile)) changes.set(settingsFile, Buffer.from(JSON.stringify(settings, null, 2) + '\n'));
    }
  }
  if (!uninstall && (scope === 'global' || tool === 'claude')) {
    changes.set(manifestFile, Buffer.from(JSON.stringify(inventory, null, 2) + '\n'));
  }
  return { tool, root, base, changes, cleanupRoots: [root, ...actionFiles.map((file) => path.dirname(file))] };
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
  for (const { cleanupRoots, changes } of targets) {
    const dirs = new Set();
    for (const file of changes.keys()) {
      for (let dir = path.dirname(file); cleanupRoots.some((root) => dir === root || dir.startsWith(root + path.sep)); dir = path.dirname(dir)) dirs.add(dir);
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
    if (!selected) {
      const tool = await select('AI tools', ['Claude Code', 'Codex', 'Both']);
      selected = [['claude'], ['codex'], TOOLS][tool];
    }
    if (!scope) {
      const choice = await select(options.uninstall ? 'Uninstall for' : 'Install for', ['This project (local)', 'All your projects (global)'], 1);
      scope = ['local', 'global'][choice];
    }
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
    if (scope === 'local' && !options.uninstall) ensureProjectDependency(base, options.silent);
    const dependency = scope === 'local' && !options.uninstall ? projectDependency(base, selected) : null;
    const targets = selected.map((tool) => preflight(tool, base, scope, options.uninstall, dependency));
    apply(targets);
    for (const { tool, root } of targets) {
      if (options.uninstall) log(`Uninstalled ${tool}. Project state, tests, and unowned files were preserved.`);
      else log(`Installed ${tool} → ${root}${dependency ? ` (project dependency ${dependency.version})` : ''}\n${tool === 'codex' ? 'Restart Codex in your project, then type $sheriff-run in its chat prompt, or $sheriff to choose an action.' : 'Run /sheriff:help in Claude Code.'}`);
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
