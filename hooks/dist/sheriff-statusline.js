// hooks/sheriff-statusline.js
var fs = require("fs");
var path = require("path");
var os = require("os");
var hookData = JSON.parse(process.env.HOOK_DATA || "{}");
var sessionId = hookData.session_id || "unknown";
var bridgeFile = path.join(os.tmpdir(), `sheriff-ctx-${sessionId}.json`);
var contextTokensUsed = hookData.context_tokens_used || 0;
var contextTokensMax = hookData.context_tokens_max || 2e5;
var remainingPercent = Math.round((contextTokensMax - contextTokensUsed) / contextTokensMax * 100);
var usedPercent = 100 - remainingPercent;
try {
  fs.writeFileSync(bridgeFile, JSON.stringify({
    remainingPercent,
    usedPercent,
    contextTokensUsed,
    contextTokensMax,
    timestamp: Date.now()
  }));
} catch {
}
var sheriffDir = path.join(process.cwd(), ".sheriff");
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
