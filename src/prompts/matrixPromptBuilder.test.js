const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMatrixReferencePrompt } = require("./matrixPromptBuilder");

test("matrix/reference prompt labels source then reference when there is no original anchor", () => {
  const result = buildMatrixReferencePrompt({ userPrompt: "usa su luz", hasOriginalAnchor: false });

  assert.match(result, /Image 1 — SOURCE IMAGE \/ MATRIX/);
  assert.match(result, /Image 2 — REFERENCE IMAGE \/ REFERENCE/);
  assert.doesNotMatch(result, /ORIGINAL FIDELITY ANCHOR/);
  assert.ok(result.endsWith("usa su luz"));
});

test("matrix/reference prompt gives the optional anchor its own deterministic position", () => {
  const result = buildMatrixReferencePrompt({ userPrompt: "cambia el fondo", hasOriginalAnchor: true });

  const sourceAt = result.indexOf("Image 1 — SOURCE IMAGE");
  const anchorAt = result.indexOf("Image 2 — ORIGINAL FIDELITY ANCHOR");
  const referenceAt = result.indexOf("Image 3 — REFERENCE IMAGE");
  assert.ok(sourceAt < anchorAt && anchorAt < referenceAt);
});

test("matrix/reference prompt preserves the user's text literally", () => {
  const userPrompt = "línea 1\n### etiqueta propia \"sin cambios\"";
  const result = buildMatrixReferencePrompt({ userPrompt });

  assert.ok(result.endsWith(userPrompt));
});
