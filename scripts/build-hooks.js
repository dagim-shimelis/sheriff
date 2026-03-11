#!/usr/bin/env node
'use strict';

/**
 * Bundles hook files with esbuild for distribution.
 * Hooks must be single-file bundles — no require() calls at runtime.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOOKS_SRC = path.join(ROOT, 'hooks');
const HOOKS_DIST = path.join(ROOT, 'hooks', 'dist');

fs.mkdirSync(HOOKS_DIST, { recursive: true });

const hookFiles = fs.readdirSync(HOOKS_SRC)
  .filter((f) => f.endsWith('.js') && !f.startsWith('dist'));

for (const file of hookFiles) {
  const src = path.join(HOOKS_SRC, file);
  const dest = path.join(HOOKS_DIST, file);

  console.log(`Bundling ${file}...`);
  execSync(
    `npx esbuild ${src} --bundle --platform=node --target=node18 --outfile=${dest}`,
    { stdio: 'inherit' },
  );
}

console.log(`\n✅ Built ${hookFiles.length} hook(s) to hooks/dist/`);
