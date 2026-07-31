// INSPECTOR stage. Deterministic, local, purely structural — no Gemini call, no image decoding,
// no visual evaluation (see the INSPECTOR v1 design writeup). `resultMeta` stays lightweight
// (`{ mimeType, bytes }`) — this module never receives or touches the real image bytes, so there
// is no code path here through which raw data could be copied, logged, or serialized. Its return
// value is purely diagnostic: axionCore.js discards it and returns EXECUTE's result unchanged
// regardless of what's reported here (see ARCHITECTURE.md) — nothing computed in this module can
// block the pipeline, alter the public response, or touch the Intent.
//
// `inspectorHeuristics`/`configStore` are called via the module namespace (not destructured into
// local consts) so their properties remain replaceable in isolation by tests — this is what lets
// Developer Mode and an internal failure be exercised without any test-only branch in production
// code (see inspector.test.js).
const configStore = require("../services/configStore");
const editDebugLogger = require("../debug/editDebugLogger");
const inspectorHeuristics = require("./inspectorHeuristics");
const V = require("./inspectorVocabulary");

function inspectResult({ resultMeta, intent } = {}) {
  let report;
  try {
    report = inspectorHeuristics.buildReport({ resultMeta, intent });
  } catch {
    // Only reachable if something escapes inspectorHeuristics.js's own internal safeRead()
    // guards entirely — defense in depth, not an expected path.
    report = { status: V.STATUS.INSPECTION_ERROR, stage: V.STAGE.UNKNOWN, score: null, anomalies: [] };
  }

  try {
    if (configStore.getSettings().developerMode) {
      // Only the sanitized report — never resultMeta/intent themselves, which could carry the
      // user's own prompt text (see DESIGN_PHILOSOPHY.md: nothing technical/user-authored crosses
      // into a log outside a conscious developer-mode boundary, and even there, never raw content).
      editDebugLogger.log("[AXION CORE] Inspector report", { report });
    }
  } catch {
    // Logging is diagnostic only — it must never be able to affect the real result.
  }

  return report;
}

module.exports = { inspectResult };
