/**
 * sheriff-statusline — Statusline hook
 *
 * Renders a compact status bar showing Sheriff progress and context usage.
 * Also writes context metrics to the bridge file for sheriff-context-monitor.
 *
 * Output format (statusline):
 *   🔫 Sheriff  Phase 2/5  ████████░░  3 running  12✅ 2⚠️
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let hookData;
try {
  hookData = JSON.parse(process.env.HOOK_DATA || fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const sessionId = hookData?.session_id;
if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) process.exit(0);
const bridgeFile = path.join(os.tmpdir(), `sheriff-ctx-${sessionId}.json`);

// Context window metrics from hook data
const remaining = hookData.context_window?.remaining_percentage;
const remainingPercent = typeof remaining === 'number' && Number.isFinite(remaining)
  ? Math.max(0, Math.min(100, Math.round(remaining))) : null;
const usedPercent = remainingPercent === null ? null : 100 - remainingPercent;

// Write bridge file for context monitor
try {
  fs.writeFileSync(bridgeFile, JSON.stringify({
    remainingPercent,
    usedPercent,
    timestamp: Date.now(),
  }));
} catch {}

// Read Sheriff status
const sheriffDir = path.join(hookData.cwd || process.cwd(), '.sheriff');
if (!fs.existsSync(sheriffDir)) {
  // Not a Sheriff project — show nothing
  process.exit(0);
}

let statusLine = '🔫 Sheriff';

try {
  const phasesFile = path.join(sheriffDir, 'PHASES.md');
  if (fs.existsSync(phasesFile)) {
    const content = fs.readFileSync(phasesFile, 'utf8');

    // Count statuses
    const passing = (content.match(/✅/g) || []).length;
    const review = (content.match(/⚠️/g) || []).length;
    const running = (content.match(/🔒/g) || []).length;
    const failed = (content.match(/❌/g) || []).length;

    // Current phase
    const phaseMatch = content.match(/## Phase (\d+)/g);
    const totalPhases = phaseMatch ? phaseMatch.length : 0;
    const donePhases = (content.match(/\| Phase \d+[^|]*\| ✅/g) || []).length;

    // Context bar (10 chars)
    const filled = Math.round(usedPercent / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    const parts = [`🔫 Sheriff`];
    if (totalPhases > 0) parts.push(`Phase ${donePhases + 1}/${totalPhases}`);
    if (remainingPercent !== null) parts.push(`ctx ${bar} ${remainingPercent}%`);
    if (running > 0) parts.push(`${running} running`);
    if (passing > 0) parts.push(`${passing}✅`);
    if (review > 0) parts.push(`${review}⚠️`);
    if (failed > 0) parts.push(`${failed}❌`);

    statusLine = parts.join('  ');
  }
} catch {}

console.log(statusLine);
process.exit(0);
