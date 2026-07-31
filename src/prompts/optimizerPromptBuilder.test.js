const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOptimizerMetaPrompt } = require("./optimizerPromptBuilder");

test("no detectedElements -> meta-prompt is unchanged from the pre-existing shape (no new section)", () => {
  const withUndefined = buildOptimizerMetaPrompt({ userPrompt: "Cambia el color del coche", styleFragment: null, priorEdits: null, hasImage: false });
  const withNull = buildOptimizerMetaPrompt({ userPrompt: "Cambia el color del coche", styleFragment: null, priorEdits: null, hasImage: false, detectedElements: null });
  assert.equal(withUndefined, withNull);
  assert.ok(!withUndefined.includes("Elementos detectados"));
});

test("protectedRefs present -> rendered quoted, under the closed-vocabulary section", () => {
  const prompt = buildOptimizerMetaPrompt({
    userPrompt: "Haz el coche rojo",
    styleFragment: null,
    priorEdits: null,
    hasImage: true,
    detectedElements: { protectedRefs: ["fondo", "ruedas"], constraintLabels: [] },
  });
  assert.ok(prompt.includes("Elementos detectados automáticamente"));
  assert.ok(prompt.includes('Proteger explícitamente: "fondo", "ruedas"'));
  assert.ok(!prompt.includes("Restricciones:"));
});

test("constraintLabels present -> rendered as human-readable labels, never raw codes", () => {
  const prompt = buildOptimizerMetaPrompt({
    userPrompt: "Mejora la imagen",
    styleFragment: null,
    priorEdits: null,
    hasImage: false,
    detectedElements: { protectedRefs: [], constraintLabels: ["no añadir texto ni tipografía"] },
  });
  assert.ok(prompt.includes('Restricciones: "no añadir texto ni tipografía"'));
  assert.ok(!prompt.includes("no_text_overlay"));
});

test("userPrompt stays complete and literal, quoted, regardless of detectedElements", () => {
  const userPrompt = "Cambia el color del coche sin tocar el fondo";
  const prompt = buildOptimizerMetaPrompt({
    userPrompt, styleFragment: null, priorEdits: null, hasImage: true,
    detectedElements: { protectedRefs: ["fondo"], constraintLabels: [] },
  });
  assert.ok(prompt.includes(`User instruction: "${userPrompt}"`));
});

test("the detected-elements section is always the last thing in the meta-prompt", () => {
  const prompt = buildOptimizerMetaPrompt({
    userPrompt: "Cambia el color del coche",
    styleFragment: "in an ultra-realistic photographic style",
    priorEdits: ["edicion anterior 1"],
    hasImage: true,
    detectedElements: { protectedRefs: ["fondo"], constraintLabels: ["no añadir marcas de agua"] },
  });
  const sectionIndex = prompt.indexOf("Elementos detectados automáticamente");
  assert.ok(sectionIndex > -1);
  assert.equal(prompt.slice(sectionIndex).includes("Requested visual style"), false);
  assert.equal(prompt.slice(sectionIndex).includes("Changes already applied"), false);
});
