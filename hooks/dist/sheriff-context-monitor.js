// hooks/sheriff-context-monitor.js
var fs = require("fs");
var path = require("path");
var os = require("os");
var hookData = JSON.parse(process.env.HOOK_DATA || "{}");
var sessionId = hookData.session_id || "unknown";
var bridgeFile = path.join(os.tmpdir(), `sheriff-ctx-${sessionId}.json`);
var counterFile = path.join(os.tmpdir(), `sheriff-counter-${sessionId}.json`);
var counter = 0;
try {
  counter = JSON.parse(fs.readFileSync(counterFile, "utf8")).count || 0;
} catch {
}
counter++;
fs.writeFileSync(counterFile, JSON.stringify({ count: counter }));
if (counter % 5 !== 0) {
  process.exit(0);
}
var metrics = null;
try {
  metrics = JSON.parse(fs.readFileSync(bridgeFile, "utf8"));
} catch {
  process.exit(0);
}
if (!metrics || typeof metrics.remainingPercent !== "number") {
  process.exit(0);
}
var remaining = metrics.remainingPercent;
var isSheriffProject = fs.existsSync(path.join(process.cwd(), ".sheriff", ".sheriff.json"));
if (!isSheriffProject) {
  process.exit(0);
}
if (remaining <= 25) {
  const message = [
    "\u{1F6A8} SHERIFF CONTEXT CRITICAL: Only " + remaining + "% context remaining.",
    "You MUST write a handoff note NOW and mark your sub-phase complete.",
    "Run: node {SHERIFF_TOOLS} write-handoff {agentId} then mark-complete {subphaseId} review",
    "Do not write any more test cases. Write the handoff note immediately."
  ].join("\n");
  console.log(JSON.stringify({ additionalContext: message }));
} else if (remaining <= 35) {
  const message = [
    "\u26A0\uFE0F  SHERIFF CONTEXT WARNING: " + remaining + "% context remaining.",
    "Finish your current test case, then write a handoff note before starting the next one.",
    "Run: node {SHERIFF_TOOLS} write-handoff {agentId} when ready to hand off."
  ].join("\n");
  console.log(JSON.stringify({ additionalContext: message }));
}
process.exit(0);
