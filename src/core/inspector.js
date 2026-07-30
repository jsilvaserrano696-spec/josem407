// INSPECTOR stage (stub). Never blocks or alters anything it's given — only optionally logs, and
// only when Developer Mode is on (src/services/configStore.js), reusing the same debug logger the
// rest of the app already uses. `resultMeta` stays lightweight (e.g. `{ mimeType, bytes }`), never
// raw image/base64 data. `intent` is now the full AXION Intent (src/core/intentSchema.js) instead
// of separate analysis/direction objects, but the stub's own behavior is unchanged: still just a
// diagnostic log, still always returns the same neutral report.
const configStore = require("../services/configStore");
const editDebugLogger = require("../debug/editDebugLogger");

function inspectResult({ resultMeta, intent } = {}) {
  const report = { passed: true, score: null, notes: [] };

  try {
    if (configStore.getSettings().developerMode) {
      editDebugLogger.log("[AXION CORE] Inspector report (stub)", { resultMeta, intent, report });
    }
  } catch (error) {
    // Logging is diagnostic only — it must never be able to affect the real result.
  }

  return report;
}

module.exports = { inspectResult };
