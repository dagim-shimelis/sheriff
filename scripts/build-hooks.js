#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const source = path.resolve(__dirname, '..', 'hooks');
const destination = path.join(source, 'dist');
const files = ['sheriff-context-monitor.js', 'sheriff-statusline.js'];

// Hooks use only Node built-ins; copy readable scripts instead of bundling them.
for (const file of files) execFileSync(process.execPath, ['--check', path.join(source, file)]);
fs.mkdirSync(destination, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(source, file), path.join(destination, file));
console.log(`Built ${files.length} standalone hooks.`);
