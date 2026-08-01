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

test("reference protocol blocks unrequested text, logos, subjects, and scene content", () => {
  const result = buildMatrixReferencePrompt({ userPrompt: "usa únicamente el acabado del metal" });

  assert.match(result, /Never copy or introduce its text, lettering, captions, logos, watermarks, symbols/);
  assert.match(result, /people, faces, animals, objects, buildings, scenery, or composition/);
  assert.match(result, /If text or lettering is not explicitly requested, add no text/);
  assert.match(result, /complete transfer whitelist/);
});

test("matrix remains the owner of existing text, logos, layout, and content", () => {
  const result = buildMatrixReferencePrompt({ userPrompt: "aplica su iluminación" });

  assert.match(result, /MATRIX and owns all final-image content/);
  assert.match(result, /text, logos, symbols/);
  assert.match(result, /Remove every new element/);
});
