/**
 * sheriff-context-monitor — PostToolUse hook
 *
 * Monitors context window usage and injects warnings to the agent
 * at 35% and 25% remaining thresholds.
 *
 * Reads metrics from the bridge file written by sheriff-statusline.js.
 * Debounced: fires at most every 5 tool calls per session.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const hookData = JSON.parse(process.env.HOOK_DATA || '{}');
const sessionId = hookData.session_id || 'unknown';
const bridgeFile = path.join(os.tmpdir(), `sheriff-ctx-${sessionId}.json`);

// Debounce: only check every 5 tool calls
const counterFile = path.join(os.tmpdir(), `sheriff-counter-${sessionId}.json`);
let counter = 0;
try {
  counter = JSON.parse(fs.readFileSync(counterFile, 'utf8')).count || 0;
} catch {}
counter++;
fs.writeFileSync(counterFile, JSON.stringify({ count: counter }));

if (counter % 5 !== 0) {
  process.exit(0);
}

// Read metrics from bridge file
let metrics = null;
try {
  metrics = JSON.parse(fs.readFileSync(bridgeFile, 'utf8'));
} catch {
  process.exit(0);
}

if (!metrics || typeof metrics.remainingPercent !== 'number') {
  process.exit(0);
}

const remaining = metrics.remainingPercent;

// Only inject if Sheriff is active in this project
const isSheriffProject = fs.existsSync(path.join(process.cwd(), '.sheriff', '.sheriff.json'));
if (!isSheriffProject) {
  process.exit(0);
}

if (remaining <= 25) {
  const message = [
    '🚨 SHERIFF CONTEXT CRITICAL: Only ' + remaining + '% context remaining.',
    'You MUST write a handoff note NOW and mark your sub-phase complete.',
    'Run: node {SHERIFF_TOOLS} write-handoff {agentId} then mark-complete {subphaseId} review',
    'Do not write any more test cases. Write the handoff note immediately.',
  ].join('\n');

  console.log(JSON.stringify({ additionalContext: message }));
} else if (remaining <= 35) {
  const message = [
    '⚠️  SHERIFF CONTEXT WARNING: ' + remaining + '% context remaining.',
    'Finish your current test case, then write a handoff note before starting the next one.',
    'Run: node {SHERIFF_TOOLS} write-handoff {agentId} when ready to hand off.',
  ].join('\n');

  console.log(JSON.stringify({ additionalContext: message }));
}

process.exit(0);
