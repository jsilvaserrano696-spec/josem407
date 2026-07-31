// ANALYZE stage. Builds an AXION Intent v1 (src/core/intentSchema.js) from the data the pipeline
// already has. `operation` is passed in by axionCore.js (which already knows which pipeline is
// running) rather than inferred here, so `operation`/`hasImage` can never disagree with each other
// by construction — the heuristic classifier below never touches either field, and never touches
// `request.text`/`request.styleId` (both are set here, verbatim, before the classifier even runs).
//
// The interpretation itself — action/targets/protect/constraints/assumptions/confidence — is a
// deterministic, local, regex-based classifier (analyzeHeuristics.js + analyzeVocabulary.js): no
// Gemini call, no network, no state. See the ANALYZE v1 design writeup for why a local classifier
// was chosen over a semantic (Gemini-based) one at this stage: the Intent still doesn't drive
// EXECUTE/Gemini/the visual result, so spending real latency/cost on it isn't justified yet.
const { buildIntent } = require("./intentSchema");
const { analyzeEditText, analyzeGenerateText } = require("./analyzeHeuristics");

function analyzeRequest({ operation, userPrompt, currentImage, styleId } = {}) {
  const hasImage = operation === "generate" ? false : Boolean(currentImage?.base64);
  const resolvedOperation = operation ?? (hasImage ? "edit" : "generate");
  const text = userPrompt ?? "";

  const result = resolvedOperation === "generate" ? analyzeGenerateText(text) : analyzeEditText(text);

  return buildIntent({
    operation: resolvedOperation,
    hasImage,
    request: {
      text,
      styleId: styleId ?? null,
    },
    analysis: {
      targets: result.targets,
      action: result.action,
      assumptions: result.assumptions,
      confidence: result.confidence,
    },
    protect: result.protect,
    constraints: result.constraints,
    metadata: {
      createdAt: Date.now(),
      source: "analyze.js@heuristic-v1",
    },
  });
}

module.exports = { analyzeRequest };
