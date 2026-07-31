const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./analyzeHeuristics");

test("normalizeForMatching strips accents and case without mutating input", () => {
  const input = "Camión Rápido";
  const result = h.normalizeForMatching(input);
  assert.equal(result, "camion rapido");
  assert.equal(input, "Camión Rápido"); // unchanged
});

test("capForAnalysis leaves short text untouched", () => {
  const short = "Haz el coche rojo";
  const { text, wasTruncated } = h.capForAnalysis(short);
  assert.equal(text, short);
  assert.equal(wasTruncated, false);
});

test("capForAnalysis truncates long text to the fixed limit and reports it", () => {
  const long = "a".repeat(50000);
  const { text, wasTruncated } = h.capForAnalysis(long);
  assert.equal(text.length, 2000);
  assert.equal(wasTruncated, true);
});

test("stripLeadingDeterminers removes only leading determiners/contractions", () => {
  assert.equal(h.stripLeadingDeterminers("el coche"), "coche");
  assert.equal(h.stripLeadingDeterminers("del fondo a acuarela"), "fondo a acuarela");
  assert.equal(h.stripLeadingDeterminers("coche"), "coche");
  assert.equal(h.stripLeadingDeterminers(""), "");
});

test("stripKnownAttributeValueSuffix splits off a recognized color but never a generic adjective", () => {
  assert.equal(h.stripKnownAttributeValueSuffix("coche rojo"), "coche");
  assert.equal(h.stripKnownAttributeValueSuffix("coche deportivo"), "coche deportivo");
  assert.equal(h.stripKnownAttributeValueSuffix("rojo"), "rojo"); // single word: never stripped to empty
});

test("extractConstraints detects each known constraint and masks the matched span", () => {
  const noText = h.extractConstraints("No añadas texto, gracias");
  assert.deepEqual(noText.constraints, ["no_text_overlay"]);
  assert.ok(!/añadas/i.test(noText.maskedText));

  const aspect = h.extractConstraints("Mejora esto sin cambiar el aspecto");
  assert.deepEqual(aspect.constraints, ["preserve_aspect_ratio"]);

  const watermark = h.extractConstraints("Hazlo mejor sin marca de agua");
  assert.deepEqual(watermark.constraints, ["no_watermark"]);

  const none = h.extractConstraints("Cambia el color del coche");
  assert.deepEqual(none.constraints, []);
});

test("splitIntoClauses separates the action zone from one or more protect zones", () => {
  const { actionZone, protectZones } = h.splitIntoClauses("Haz el coche rojo sin cambiar el fondo ni las ruedas");
  assert.equal(actionZone.trim(), "Haz el coche rojo");
  assert.deepEqual(protectZones, ["el fondo", "las ruedas"]);
});

test("splitIntoClauses returns everything as the action zone when there is no negation", () => {
  const { actionZone, protectZones } = h.splitIntoClauses("Mejora la iluminación");
  assert.equal(actionZone, "Mejora la iluminación");
  assert.deepEqual(protectZones, []);
});

test("detectAction — one clean case per action (generate_image is not part of this function's range)", () => {
  const cases = [
    { text: "Cambia el fondo por un atardecer", action: "replace_element" },
    { text: "Elimina el sombrero", action: "remove_element" },
    { text: "Añade un sombrero", action: "add_element" },
    { text: "Convierte esto en un cómic", action: "transform_style" },
    { text: "Cambia el encuadre", action: "adjust_composition" },
    { text: "Cambia el color del coche", action: "change_attribute" },
    { text: "Más bonito, por favor", action: "generic_improve" },
    { text: "Wobble the frobnicator", action: "unknown_edit" },
  ];
  for (const { text, action } of cases) {
    assert.equal(h.detectAction(text).action, action, `for input: "${text}"`);
  }
});

test("detectAction precedence: replace_element wins over change_attribute despite sharing the verb 'cambia'", () => {
  const result = h.detectAction("Cambia el fondo por un atardecer");
  assert.equal(result.action, "replace_element");
  assert.equal(result.target, "fondo");
});

test("detectAction precedence: transform_style wins over change_attribute", () => {
  const result = h.detectAction("Cambia el estilo del fondo a acuarela");
  assert.equal(result.action, "transform_style");
});

test("detectAction on 'Haz el coche rojo' resolves to change_attribute with target exactly 'coche'", () => {
  const result = h.detectAction("Haz el coche rojo");
  assert.equal(result.action, "change_attribute");
  assert.equal(result.target, "coche");
});

test("detectAction does not strip 'deportivo' — not a recognized attribute value", () => {
  const result = h.detectAction("Haz el coche deportivo");
  assert.equal(result.action, "change_attribute");
  assert.equal(result.target, "coche deportivo");
});

test("extractProtectEntries produces user-sourced element entries with determiners stripped", () => {
  const entries = h.extractProtectEntries(["el fondo", "las ruedas"]);
  assert.deepEqual(entries, [
    { type: "element", ref: "fondo", of: null, source: "user", note: null },
    { type: "element", ref: "ruedas", of: null, source: "user", note: null },
  ]);
});

test("detectAmbiguity flags spatial and collective references, and only those", () => {
  assert.equal(h.detectAmbiguity({ actionZone: "Elimina la persona de la izquierda", protectZones: [] }), true);
  assert.equal(h.detectAmbiguity({ actionZone: "Elimina la persona", protectZones: ["las demás"] }), true);
  assert.equal(h.detectAmbiguity({ actionZone: "Cambia el color del coche", protectZones: ["el fondo"] }), false);
});

test("detectContradiction reports overlap without resolving it, case/accent-insensitively", () => {
  const withOverlap = h.detectContradiction(["cielo"], [{ ref: "el Cíelo" }]);
  assert.equal(withOverlap.hasContradiction, true);
  assert.deepEqual(withOverlap.conflictingRefs, ["el Cíelo"]);

  const noOverlap = h.detectContradiction(["coche"], [{ ref: "fondo" }]);
  assert.equal(noOverlap.hasContradiction, false);
  assert.deepEqual(noOverlap.conflictingRefs, []);
});

test("scoreConfidence — full table of base cases and the hard contradiction cap", () => {
  const base = (overrides) =>
    h.scoreConfidence({ operation: "edit", action: "change_attribute", targets: ["coche"], hasContradiction: false, hasAmbiguity: false, ...overrides });

  assert.equal(h.scoreConfidence({ operation: "generate", action: "generate_image", targets: [], hasContradiction: false, hasAmbiguity: false }), 0.9);
  assert.equal(h.scoreConfidence({ operation: "edit", action: "unknown_edit", targets: [], hasContradiction: false, hasAmbiguity: false }), 0.15);
  assert.equal(h.scoreConfidence({ operation: "edit", action: "generic_improve", targets: [], hasContradiction: false, hasAmbiguity: false }), 0.25);
  assert.equal(h.scoreConfidence({ operation: "edit", action: "change_attribute", targets: [], hasContradiction: false, hasAmbiguity: false }), 0.4);
  assert.equal(base({}), 0.85);
  assert.equal(base({ hasAmbiguity: true }), 0.6);
  // Hard cap: even a "clean" 0.85-base case must clamp to <= 0.15 when contradictory.
  assert.equal(base({ hasContradiction: true }), 0.15);
  assert.equal(base({ hasAmbiguity: true, hasContradiction: true }), 0.15);
});

test("buildAssumptions produces exactly the expected strings per triggering condition", () => {
  assert.deepEqual(
    h.buildAssumptions({ operation: "edit", action: "change_attribute", wasTruncated: false, hasContradiction: false, conflictingRefs: [], hasAmbiguity: false }),
    []
  );
  assert.equal(
    h.buildAssumptions({ operation: "edit", action: "generic_improve", wasTruncated: false, hasContradiction: false, conflictingRefs: [], hasAmbiguity: false }).length,
    1
  );
  assert.equal(
    h.buildAssumptions({ operation: "edit", action: "change_attribute", wasTruncated: true, hasContradiction: false, conflictingRefs: [], hasAmbiguity: false }).length,
    1
  );
  assert.equal(
    h.buildAssumptions({ operation: "edit", action: "change_attribute", wasTruncated: false, hasContradiction: false, conflictingRefs: [], hasAmbiguity: true }).length,
    1
  );
  const contradictionAssumptions = h.buildAssumptions({
    operation: "edit", action: "change_attribute", wasTruncated: false, hasContradiction: true, conflictingRefs: ["cielo"], hasAmbiguity: false,
  });
  assert.equal(contradictionAssumptions.length, 1);
  assert.match(contradictionAssumptions[0], /cielo/);
});

test("detectAction: 'mejorar' alone (only a generic referent as target) reclassifies to generic_improve", () => {
  const genericCases = ["Mejora esto", "Mejora la imagen", "Mejora esta foto"];
  for (const text of genericCases) {
    const result = h.detectAction(text);
    assert.equal(result.action, "generic_improve", `for input: "${text}"`);
    assert.equal(result.target, null, `for input: "${text}"`);
  }
});

test("detectAction: 'mejorar' + a specific attribute/style/composition concept keeps a concrete action", () => {
  assert.equal(h.detectAction("Mejora la iluminación").action, "change_attribute");
  assert.equal(h.detectAction("Mejora el color del cielo").action, "change_attribute");
  assert.equal(h.detectAction("Mejora la composición").action, "adjust_composition");
  assert.equal(h.detectAction("Mejora el estilo de la imagen").action, "transform_style");
});

test("detectAction: 'Hazlo más bonito' and 'Dale un aspecto mejor' fall through to generic_improve with no verb match at all", () => {
  assert.equal(h.detectAction("Hazlo más bonito").action, "generic_improve");
  assert.equal(h.detectAction("Dale un aspecto mejor").action, "generic_improve");
});

test("no regex here is vulnerable to catastrophic backtracking on adversarial input", () => {
  const pathological = "a ".repeat(10000); // 20,000 chars, well past MAX_ANALYSIS_LENGTH
  const startedAt = Date.now();
  const result = h.analyzeEditText(pathological);
  const elapsedMs = Date.now() - startedAt;
  assert.ok(elapsedMs < 500, `analyzeEditText took ${elapsedMs}ms on adversarial input`);
  assert.equal(typeof result.confidence, "number");
});
