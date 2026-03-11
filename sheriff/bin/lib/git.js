'use strict';

const { execSync } = require('child_process');

function run(cmd, cwd = process.cwd()) {
  return execSync(cmd, { cwd, encoding: 'utf8' }).trim();
}

function isGitRepo(cwd = process.cwd()) {
  try {
    run('git rev-parse --git-dir', cwd);
    return true;
  } catch {
    return false;
  }
}

function getCurrentHash(cwd = process.cwd()) {
  try {
    return run('git rev-parse HEAD', cwd);
  } catch {
    return null;
  }
}

function checkpoint(subphaseId, cwd = process.cwd()) {
  if (!isGitRepo(cwd)) return { skipped: true, reason: 'not a git repo' };
  try {
    run('git add -A', cwd);
    const hash = run(
      `git commit -m "sheriff: checkpoint — starting sub-phase ${subphaseId}" --allow-empty`,
      cwd,
    );
    return { success: true, hash: getCurrentHash(cwd) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function commitSuccess(subphaseId, summary, cwd = process.cwd()) {
  if (!isGitRepo(cwd)) return { skipped: true, reason: 'not a git repo' };
  try {
    run('git add -A', cwd);
    const msg = summary
      ? `sheriff: ✅ sub-phase ${subphaseId} — ${summary}`
      : `sheriff: ✅ sub-phase ${subphaseId} complete`;
    run(`git commit -m "${msg}" --allow-empty`, cwd);
    return { success: true, hash: getCurrentHash(cwd) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function rollback(cwd = process.cwd()) {
  if (!isGitRepo(cwd)) return { skipped: true, reason: 'not a git repo' };
  try {
    run('git reset --hard HEAD', cwd);
    run('git clean -fd', cwd);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function hasUncommittedChanges(cwd = process.cwd()) {
  try {
    const status = run('git status --porcelain', cwd);
    return status.length > 0;
  } catch {
    return false;
  }
}

module.exports = {
  isGitRepo,
  getCurrentHash,
  checkpoint,
  commitSuccess,
  rollback,
  hasUncommittedChanges,
};
