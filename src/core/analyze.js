// ANALYZE stage. Builds an AXION Intent v1 (src/core/intentSchema.js) from the data the pipeline
// already has — no Gemini call, no real semantic analysis yet. `operation` is passed in by
// axionCore.js (which already knows which pipeline is running) rather than inferred here, so
// `operation`/`hasImage` can never disagree with each other by construction. `action` is a fixed,
// generic placeholder until real interpretation exists; targets/protect/constraints/assumptions
// and all of `direction` stay empty/neutral — DIRECTOR's job, not ANALYZE's.
const { buildIntent } = require("./intentSchema");

function analyzeRequest({ operation, userPrompt, currentImage, styleId } = {}) {
  const hasImage = operation === "generate" ? false : Boolean(currentImage?.base64);
  const action = operation === "generate" ? "generate_image" : "edit_image";

  return buildIntent({
    operation: operation ?? (hasImage ? "edit" : "generate"),
    hasImage,
    request: {
      text: userPrompt ?? "",
      styleId: styleId ?? null,
    },
    analysis: {
      targets: [],
      action,
      assumptions: [],
      confidence: null,
    },
    protect: [],
    constraints: [],
    metadata: {
      createdAt: Date.now(),
      source: "analyze.js@stub-v1",
    },
  });
}

module.exports = { analyzeRequest };
