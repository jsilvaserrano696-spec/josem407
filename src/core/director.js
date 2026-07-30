// DIRECTOR stage (stub). Receives the Intent ANALYZE built and returns a normalized copy with
// only the neutral structure it owns filled in — direction.styleId carried forward from the
// user's request, exactly what this stub already did before the Intent existed (`styleId:
// analysis?.styleId ?? null`). No creative decision-making, no prompt changes. buildIntent()
// guarantees the result is a fresh object (input never mutated) and fills any other gaps with
// schema-safe neutral defaults, never invented content.
const { buildIntent } = require("./intentSchema");

function decideDirection({ intent } = {}) {
  const normalized = buildIntent(intent);
  return buildIntent({
    ...normalized,
    direction: {
      styleId: normalized.request.styleId,
      priorities: [],
      notes: [],
    },
  });
}

module.exports = { decideDirection };
