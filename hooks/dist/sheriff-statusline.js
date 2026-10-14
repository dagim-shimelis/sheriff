/** Show Sheriff phase progress and publish context metrics for the monitor. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

let hookData;
try { hookData = JSON.parse(process.env.HOOK_DATA || fs.readFileSync(0, 'utf8')); }
catch { process.exit(0); }
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

const remaining = hookData.context_window?.remaining_percentage;
const remainingPercent = Number.isFinite(remaining) ? Math.max(0, Math.min(100, Math.round(remaining))) : null;
try { writeCache(bridgeFile, { remainingPercent, sessionId, cwd, timestamp: Date.now() }); }
catch {}

const parts = ['🔫 Sheriff'];
try {
  const content = fs.readFileSync(path.join(sheriffDir, 'PHASES.md'), 'utf8');
  const phaseIds = [...content.matchAll(/^## Phase ([1-9]\d*)\b/gm)].map((match) => match[1]);
  const icons = { pending: '[ ]', in_progress: '🔒', pass: '✅', review: '⚠️', fail: '❌' };
  const headings = [...content.matchAll(/^### ([1-9]\d*\.[1-9]\d*)(?=\s|$)[^\n]*$/gm)];
  const legacyRows = [...content.matchAll(/^\|\s*([1-9]\d*\.[1-9]\d*)\s*\|[^|]*\|([^|]*)\|/gm)];
  const subphases = headings.map((match, index) => {
    const block = content.slice(match.index, headings[index + 1]?.index ?? content.length).split(/\n## /)[0];
    const metadata = block.match(/^```[^\n]*\n([\s\S]*?)^```/m)?.[1] || '';
    const status = metadata.match(/^status:[ \t]*([^\n]*)/m)?.[1].trim();
    const legacy = legacyRows.find((row) => row[1] === match[1])?.[2];
    const locked = metadata.match(/^lock:[ \t]*([^\n]*)/m)?.[1].trim();
    return { id: match[1], status: icons[status] || legacy || (locked && locked !== '—' ? icons.in_progress : icons.pending) };
  });
  if (!headings.length) subphases.push(...legacyRows.map((row) => ({ id: row[1], status: row[2] })));
  const completed = phaseIds.filter((id) => {
    const children = subphases.filter((phase) => phase.id.split('.')[0] === id);
    return children.length && children.every((phase) => phase.status.includes('✅'));
  });
  if (phaseIds.length) {
    if (completed.length === phaseIds.length) parts.push(`Phases ${phaseIds.length}/${phaseIds.length} complete`);
    else parts.push(`Phase ${phaseIds.find((id) => !completed.includes(id))}/${phaseIds.length}`);
  }
  for (const [symbol, label] of [['🔒', ' running'], ['✅', '✅'], ['⚠️', '⚠️'], ['❌', '❌']]) {
    const count = subphases.filter((phase) => phase.status.includes(symbol)).length;
    if (count) parts.push(`${count}${label}`);
  }
} catch {}
if (remainingPercent !== null) {
  const filled = Math.round((100 - remainingPercent) / 10);
  parts.push(`ctx ${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${remainingPercent}%`);
}
console.log(parts.join('  '));
