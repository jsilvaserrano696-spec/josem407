// DIRECTOR stage. Receives the Intent ANALYZE built and decides ONLY `direction` — a deterministic,
// local, closed-vocabulary decision (directorVocabulary.js + directorHeuristics.js): no Gemini
// call, no network, no state, no logging of the Intent/prompt/image data. Every other field
// (`request`, `operation`, `hasImage`, `analysis`, `protect`, `constraints`, `metadata`,
// `schemaVersion`) is immutable here — the output reuses the exact same references the input
// carried, never a copy, so nothing here can silently drift from what ANALYZE produced.
//
// Validity is a single gate at the top, reusing intentSchema.js's own validateIntent() (never a
// second, drifting notion of "valid"): an invalid Intent is returned exactly as received — same
// reference, no repair attempt, no `direction` computed over data that doesn't meet the contract.
// A well-formed-but-still-neutral `direction` (e.g. straight out of ANALYZE, with empty
// priorities/notes) is valid input like any other — it's fully recomputed here regardless, since
// this function never reads the Intent's own prior `direction` as an input to its decision.
const { validateIntent } = require("./intentSchema");
const { computeDirection } = require("./directorHeuristics");

function decideDirection({ intent } = {}) {
  const { valid } = validateIntent(intent);
  if (!valid) {
    return intent;
  }

  const direction = computeDirection({
    action: intent.analysis.action,
    targets: intent.analysis.targets,
    protect: intent.protect,
    constraints: intent.constraints,
    confidence: intent.analysis.confidence,
    styleId: intent.request.styleId,
  });

  return { ...intent, direction };
}

module.exports = { decideDirection };
