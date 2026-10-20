'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');

function installPackage(project) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const destination = path.join(project, 'node_modules', pkg.name);
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify(pkg));
  for (const folder of ['dist', 'hooks/dist']) {
    fs.cpSync(path.join(ROOT, folder), path.join(destination, folder), { recursive: true });
  }
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ private: true, devDependencies: { [pkg.name]: pkg.version } }));
  return destination;
}

module.exports = { installPackage };
