'use strict';

const fs = require('fs');
const path = require('path');

const LOCKFILES = {
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
  pnpm: ['pnpm-lock.yaml', 'node_modules/.modules.yaml'],
  yarn: ['yarn.lock', '.yarnrc.yml', '.pnp.cjs'],
  bun: ['bun.lock', 'bun.lockb'],
};

function packageManager(base) {
  let directory = base;
  while (true) {
    const file = path.join(directory, 'package.json');
    const project = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    if (project.packageManager) {
      const manager = typeof project.packageManager === 'string' && project.packageManager.split('@')[0];
      if (!Object.hasOwn(LOCKFILES, manager)) throw new Error(`Unsupported packageManager: ${project.packageManager}. Install Sheriff with that manager, then rerun setup.`);
      return manager;
    }
    const detected = Object.entries(LOCKFILES).filter(([, files]) => files.some((name) => fs.existsSync(path.join(directory, name)))).map(([name]) => name);
    if (detected.length > 1) throw new Error(`Multiple package managers detected (${detected.join(', ')}). Set packageManager in package.json so Sheriff can choose safely.`);
    if (detected.length) return detected[0];
    if (fs.existsSync(path.join(directory, '.git'))) return 'npm';
    const parent = path.dirname(directory);
    if (parent === directory) return 'npm';
    directory = parent;
  }
}

function installArgs(manager, spec, declared) {
  if (manager === 'npm') return ['install', '--prefix', '.', '--include=dev', '--no-audit', '--no-fund', ...(!declared ? ['--save-dev', spec] : [])];
  if (declared) return manager === 'pnpm' ? ['install', '--prod=false'] : ['install'];
  return ['add', manager === 'pnpm' ? '--save-dev' : '--dev', spec];
}

module.exports = { packageManager, installArgs };
