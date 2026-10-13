// hooks/sheriff-statusline.js
var fs = require("fs");
var path = require("path");
var os = require("os");
var hookData;
try {
  hookData = JSON.parse(process.env.HOOK_DATA || fs.readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
var sessionId = hookData?.session_id;
if (typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(sessionId))
  process.exit(0);
var bridgeFile = path.join(os.tmpdir(), `sheriff-ctx-${sessionId}.json`);
var remaining = hookData.context_window?.remaining_percentage;
var remainingPercent = typeof remaining === "number" && Number.isFinite(remaining) ? Math.max(0, Math.min(100, Math.round(remaining))) : null;
var usedPercent = remainingPercent === null ? null : 100 - remainingPercent;
try {
  fs.writeFileSync(bridgeFile, JSON.stringify({
    remainingPercent,
    usedPercent,
    timestamp: Date.now()
  }));
} catch {
}
var sheriffDir = path.join(hookData.cwd || process.cwd(), ".sheriff");
if (!fs.existsSync(sheriffDir)) {
  process.exit(0);
}
var statusLine = "\u{1F52B} Sheriff";
try {
  const phasesFile = path.join(sheriffDir, "PHASES.md");
  if (fs.existsSync(phasesFile)) {
    const content = fs.readFileSync(phasesFile, "utf8");
    const passing = (content.match(/✅/g) || []).length;
    const review = (content.match(/⚠️/g) || []).length;
    const running = (content.match(/🔒/g) || []).length;
    const failed = (content.match(/❌/g) || []).length;
    const phaseMatch = content.match(/## Phase (\d+)/g);
    const totalPhases = phaseMatch ? phaseMatch.length : 0;
    const donePhases = (content.match(/\| Phase \d+[^|]*\| ✅/g) || []).length;
    const filled = Math.round(usedPercent / 10);
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
    const parts = [`\u{1F52B} Sheriff`];
    if (totalPhases > 0)
      parts.push(`Phase ${donePhases + 1}/${totalPhases}`);
    if (remainingPercent !== null)
      parts.push(`ctx ${bar} ${remainingPercent}%`);
    if (running > 0)
      parts.push(`${running} running`);
    if (passing > 0)
      parts.push(`${passing}\u2705`);
    if (review > 0)
      parts.push(`${review}\u26A0\uFE0F`);
    if (failed > 0)
      parts.push(`${failed}\u274C`);
    statusLine = parts.join("  ");
  }
} catch {
}
console.log(statusLine);
process.exit(0);
