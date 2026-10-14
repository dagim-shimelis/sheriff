'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');
const { safePath, validateId } = require('./state');
const { withLock } = require('./lock');

function run(args, cwd = process.cwd()) {
  return execFileSync('git', ['--literal-pathspecs', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function isGitRepo(cwd = process.cwd()) {
  try { return run(['rev-parse', '--is-inside-work-tree'], cwd) === 'true'; } catch { return false; }
}
function getCurrentHash(cwd = process.cwd()) {
  try { return run(['rev-parse', 'HEAD'], cwd); } catch { return null; }
}
function checkpoint(subphaseId, cwd = process.cwd()) {
  validateId(subphaseId, 'subphase');
  if (!isGitRepo(cwd)) return { skipped: true, reason: 'not a git repo' };
  return { success: true, hash: getCurrentHash(cwd), dirty: hasUncommittedChanges(cwd), readOnly: true };
}
function commitSuccess(subphaseId, summary, cwd = process.cwd(), files = []) {
  validateId(subphaseId, 'subphase');
  if (!isGitRepo(cwd)) return { skipped: true, reason: 'not a git repo' };
  if (!files.length) return { success: false, reason: 'Explicit file paths after -- are required; no files were staged' };
  try {
    for (const file of files) {
      if (file.split(/[\\/]/).includes('.git')) throw new Error('Cannot commit Git metadata');
      const full = safePath(file, cwd);
      if (fs.existsSync(full) && !fs.statSync(full).isFile()) throw new Error('Commit paths must name individual files');
    }
    return withLock('.sheriff/.git.lock', cwd, () => {
      if (run(['diff', '--cached', '--name-only'], cwd)) return { success: false, reason: 'Index contains staged changes; preserve them and commit manually' };
      const message = summary ? `sheriff: sub-phase ${subphaseId} — ${summary}` : `sheriff: sub-phase ${subphaseId} complete`;
      run(['add', '--', ...files], cwd);
      try {
        run(['commit', '--only', '-m', message, '--', ...files], cwd);
      } catch (error) {
        // Unstage only our paths; never reset working files or remove untracked work.
        try { run(['reset', '--', ...files], cwd); } catch { /* A failed first commit may have no HEAD. */ }
        throw error;
      }
      return { success: true, hash: getCurrentHash(cwd), files };
    });
  } catch (error) { return { success: false, error: error.message }; }
}
function rollback(cwd = process.cwd()) {
  if (!isGitRepo(cwd)) return { skipped: true, reason: 'not a git repo' };
  return { success: false, reason: 'Automatic rollback is disabled: preserve changes and review the explicit diff with the user' };
}
function hasUncommittedChanges(cwd = process.cwd()) {
  try { return run(['status', '--porcelain'], cwd).length > 0; } catch { return false; }
}
module.exports = { isGitRepo, getCurrentHash, checkpoint, commitSuccess, rollback, hasUncommittedChanges };
