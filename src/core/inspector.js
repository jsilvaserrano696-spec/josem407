// INSPECTOR stage (stub). Will eventually evaluate a result against what ANALYZE/DIRECTOR
// expected. For now it never blocks or alters anything it's given — it only optionally logs, and
// only when Developer Mode is on (src/services/configStore.js), reusing the same debug logger the
// rest of the app already uses rather than introducing a second logging mechanism. `resultMeta`
// is expected to be lightweight (e.g. `{ mimeType, bytes }`), never raw image/base64 data.
const configStore = require("../services/configStore");
const editDebugLogger = require("../debug/editDebugLogger");

function inspectResult({ resultMeta, analysis, direction } = {}) {
  const report = { passed: true, score: null, notes: [] };

  try {
    if (configStore.getSettings().developerMode) {
      editDebugLogger.log("[AXION CORE] Inspector report (stub)", { resultMeta, analysis, direction, report });
    }
  } catch (error) {
    // Logging is diagnostic only — it must never be able to affect the real result.
  }

  return report;
}

module.exports = { inspectResult };
