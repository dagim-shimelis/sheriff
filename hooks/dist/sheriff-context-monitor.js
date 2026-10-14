/** Warn when a fresh statusline metric reports low context; check every five tool calls. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

let hookData;
try { hookData = JSON.parse(process.env.HOOK_DATA || fs.readFileSync(0, 'utf8')); }
catch { process.exit(0); }
// A statusline measures the parent context, never a subagent's independent context.
if (hookData?.agent_id !== undefined) process.exit(0);
const sessionId = hookData?.session_id;
if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(sessionId)) process.exit(0);
if (hookData.cwd !== undefined && typeof hookData.cwd !== 'string') process.exit(0);
const cwd = path.resolve(hookData.cwd || process.cwd());
const sheriffDir = path.join(cwd, '.sheriff');
if (!fs.existsSync(path.join(sheriffDir, '.sheriff.json'))) process.exit(0);

// Private, project-scoped cache avoids cross-project warnings and shared-temp symlink writes.
const uid = process.getuid?.();
const owner = uid ?? crypto.createHash('sha256').update(os.homedir()).digest('hex').slice(0, 16);
const cacheDir = path.join(os.tmpdir(), `sheriff-hooks-${owner}`);
try {
  fs.mkdirSync(cacheDir, { mode: 0o700 });
} catch (error) { if (error.code !== 'EEXIST') process.exit(0); }
try {
  const stat = fs.lstatSync(cacheDir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (uid !== undefined && (stat.uid !== uid || (stat.mode & 0o077)))) process.exit(0);
} catch { process.exit(0); }
const key = crypto.createHash('sha256').update(`${sessionId}\0${cwd}`).digest('hex');
const bridgeFile = path.join(cacheDir, `${key}.json`);
function writeCache(file, value) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally { try { fs.unlinkSync(temp); } catch {} }
}

let metrics;
try { metrics = JSON.parse(fs.readFileSync(bridgeFile, 'utf8')); }
catch { process.exit(0); }
const age = Date.now() - metrics?.timestamp;
const remaining = metrics?.remainingPercent;
if (metrics?.sessionId !== sessionId || metrics?.cwd !== cwd || !Number.isFinite(age) || age < 0 || age > 5 * 60 * 1000 ||
    !Number.isFinite(remaining) || remaining < 0 || remaining > 100) process.exit(0);

const counterFile = path.join(cacheDir, `${key}-counter.json`);
let count = 0;
try {
  const previous = JSON.parse(fs.readFileSync(counterFile, 'utf8'));
  if (Number.isInteger(previous.count) && previous.count >= 0 && previous.count < 5 && Date.now() - previous.timestamp < 5 * 60 * 1000) count = previous.count;
} catch {}
count = (count + 1) % 5;
try { writeCache(counterFile, { count, timestamp: Date.now() }); }
catch { process.exit(0); }
if (count !== 0 || remaining > 35) process.exit(0);

const message = remaining <= 25
  ? `SHERIFF CONTEXT CRITICAL: Only ${remaining}% orchestrator context remaining. Stop dispatching work. Ask active workers to checkpoint and stop, then write-handoff using each sub-phase ID with remaining work, measured results, and owned files. Only after its worker has stopped, release-subphase <id> --force returns unfinished work to pending. Preserve handoffs; do not mark paused work complete.`
  : `SHERIFF CONTEXT WARNING: ${remaining}% orchestrator context remaining. Finish the current coordination step, then checkpoint active sub-phases using their IDs before dispatching more work. Use the Sheriff tools path resolved by the current workflow.`;
console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } }));
