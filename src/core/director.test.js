const test = require("node:test");
const assert = require("node:assert/strict");
const { decideDirection } = require("./director");
const { analyzeRequest } = require("./analyze");
const { validateIntent, buildIntent } = require("./intentSchema");
const V = require("./directorVocabulary");

// Deep-freezes a plain object/array tree (Intent-shaped data only: objects, arrays, primitives —
// no need to handle other types here).
function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
    Object.freeze(value);
  }
  return value;
}

function assertSameReferences(output, input) {
  assert.equal(output.request, input.request);
  assert.equal(output.analysis, input.analysis);
  assert.equal(output.protect, input.protect);
  assert.equal(output.constraints, input.constraints);
  assert.equal(output.metadata, input.metadata);
  assert.equal(output.operation, input.operation);
  assert.equal(output.hasImage, input.hasImage);
  assert.equal(output.schemaVersion, input.schemaVersion);
}

test("11. 'Haz el coche rojo sin cambiar el fondo ni las ruedas' -> explicit_user_protection first, no confidence note", () => {
  const intent = analyzeRequest({ operation: "edit", userPrompt: "Haz el coche rojo sin cambiar el fondo ni las ruedas", currentImage: { base64: "x" }, styleId: null });
  const before = JSON.stringify(intent);
  const result = decideDirection({ intent });
  assert.equal(JSON.stringify(intent), before); // input not mutated
  assertSameReferences(result, intent);
  assert.deepEqual(result.direction.priorities, [
    V.PRIORITIES.EXPLICIT_USER_PROTECTION, V.PRIORITIES.REQUESTED_CHANGE, V.PRIORITIES.PROTECTED_ELEMENTS,
  ]);
  assert.deepEqual(result.direction.notes, [V.NOTES.CHANGE_ATTRIBUTE]);
});

test("12. 'Elimina a la persona de la izquierda y conserva las demás' -> medium confidence note, user protection first", () => {
  const intent = analyzeRequest({ operation: "edit", userPrompt: "Elimina a la persona de la izquierda y conserva las demás", currentImage: { base64: "x" }, styleId: null });
  const result = decideDirection({ intent });
  assertSameReferences(result, intent);
  assert.equal(result.direction.priorities[0], V.PRIORITIES.EXPLICIT_USER_PROTECTION);
  assert.ok(result.direction.notes.includes(V.NOTES.MEDIUM_CONFIDENCE));
});

test("13. 'Hazlo más bonito' -> low confidence, generic_improve base order is already conservative (no-op reorder)", () => {
  const intent = analyzeRequest({ operation: "edit", userPrompt: "Hazlo más bonito", currentImage: { base64: "x" }, styleId: null });
  const result = decideDirection({ intent });
  assertSameReferences(result, intent);
  assert.deepEqual(result.direction.priorities, [V.PRIORITIES.PROTECTED_ELEMENTS, V.PRIORITIES.OVERALL_QUALITY]);
  assert.ok(result.direction.notes.includes(V.NOTES.GENERIC_IMPROVEMENT));
  assert.ok(result.direction.notes.includes(V.NOTES.LOW_CONFIDENCE));
});

test("14. 'Mejora el cielo sin tocar el cielo' -> contradiction note AND low confidence note coexist, targets/protect untouched", () => {
  const intent = analyzeRequest({ operation: "edit", userPrompt: "Mejora el cielo sin tocar el cielo", currentImage: { base64: "x" }, styleId: null });
  const result = decideDirection({ intent });
  assertSameReferences(result, intent);
  assert.deepEqual(result.analysis.targets, ["cielo"]);
  assert.ok(result.protect.some((p) => p.source === "user" && p.ref === "cielo"));
  assert.ok(result.direction.notes.includes(V.NOTES.CONTRADICTION));
  assert.ok(result.direction.notes.includes(V.NOTES.LOW_CONFIDENCE));
  // "cielo" is also a user-sourced protect entry here, so explicit_user_protection outranks even
  // the conservative reordering — protected_elements is still ahead of requested_change right
  // after it.
  assert.deepEqual(result.direction.priorities, [
    V.PRIORITIES.EXPLICIT_USER_PROTECTION, V.PRIORITIES.PROTECTED_ELEMENTS, V.PRIORITIES.REQUESTED_CHANGE,
  ]);
});

test("15. Generate: 'Un bosque encantado al atardecer' -> creative_brief only, no notes", () => {
  const intent = analyzeRequest({ operation: "generate", userPrompt: "Un bosque encantado al atardecer", currentImage: null, styleId: "fantasy" });
  const result = decideDirection({ intent });
  assertSameReferences(result, intent);
  assert.deepEqual(result.direction.priorities, [V.PRIORITIES.CREATIVE_BRIEF]);
  assert.deepEqual(result.direction.notes, []);
  assert.equal(result.direction.styleId, "fantasy");
});

test("16. Confidence boundary values fabricated directly, isolated from ANALYZE's own scoring", () => {
  const makeIntent = (confidence) => buildIntent({
    operation: "edit", hasImage: true,
    request: { text: "x", styleId: null },
    analysis: { targets: ["coche"], action: "change_attribute", assumptions: [], confidence },
    protect: [], constraints: [], metadata: { createdAt: null, source: "test" },
  });
  assert.equal(decideDirection({ intent: makeIntent(0.4) }).direction.notes.includes(V.NOTES.MEDIUM_CONFIDENCE), true);
  assert.equal(decideDirection({ intent: makeIntent(0.7) }).direction.notes.includes(V.NOTES.MEDIUM_CONFIDENCE), false);
  assert.equal(decideDirection({ intent: makeIntent(0.7) }).direction.notes.includes(V.NOTES.LOW_CONFIDENCE), false);
  assert.equal(decideDirection({ intent: makeIntent(null) }).direction.notes.includes(V.NOTES.LOW_CONFIDENCE), true);
});

test("17. Explicit user protection wins position 0 even with high confidence (rule is unconditional)", () => {
  const intent = buildIntent({
    operation: "edit", hasImage: true,
    request: { text: "x", styleId: null },
    analysis: { targets: ["coche"], action: "change_attribute", assumptions: [], confidence: 0.9 },
    protect: [{ type: "element", ref: "ruedas", of: null, source: "user", note: null }],
    constraints: [], metadata: { createdAt: null, source: "test" },
  });
  const result = decideDirection({ intent });
  assert.equal(result.direction.priorities[0], V.PRIORITIES.EXPLICIT_USER_PROTECTION);
});

test("18. Object.freeze — deeply frozen Intent never throws and produces the correct result", () => {
  const intent = analyzeRequest({ operation: "edit", userPrompt: "Haz el coche rojo sin cambiar el fondo ni las ruedas", currentImage: { base64: "x" }, styleId: null });
  deepFreeze(intent);
  const result = decideDirection({ intent });
  assert.deepEqual(result.direction.priorities, [
    V.PRIORITIES.EXPLICIT_USER_PROTECTION, V.PRIORITIES.REQUESTED_CHANGE, V.PRIORITIES.PROTECTED_ELEMENTS,
  ]);
});

test("19. Idempotencia: llamar dos veces con el mismo Intent, y alimentar la salida como entrada de nuevo, produce el mismo direction", () => {
  const intent = analyzeRequest({ operation: "edit", userPrompt: "Elimina a la persona de la izquierda y conserva las demás", currentImage: { base64: "x" }, styleId: null });
  const first = decideDirection({ intent });
  const second = decideDirection({ intent });
  assert.deepEqual(first.direction, second.direction);

  const third = decideDirection({ intent: first }); // feed the output back in
  assert.deepEqual(third.direction, first.direction);
});

test("20. Intent inválido — cuatro variantes, siempre se devuelve la misma referencia sin reparar", () => {
  const invalidOperation = buildIntent({ operation: "not_a_real_operation", hasImage: true });
  assert.equal(decideDirection({ intent: invalidOperation }), invalidOperation);

  const missingAnalysis = { ...buildIntent({ operation: "edit", hasImage: true }) };
  delete missingAnalysis.analysis;
  assert.equal(decideDirection({ intent: missingAnalysis }), missingAnalysis);

  const badProtectType = buildIntent({
    operation: "edit", hasImage: true,
    protect: [{ type: "not_a_valid_type", ref: "x", of: null, source: "user", note: null }],
  });
  assert.equal(decideDirection({ intent: badProtectType }), badProtectType);

  const corruptDirection = {
    ...buildIntent({ operation: "edit", hasImage: true }),
    direction: { styleId: 123, priorities: "no-es-array", notes: null },
  };
  assert.equal(decideDirection({ intent: corruptDirection }), corruptDirection);
});

test("21. Campos adicionales inesperados sobreviven intactos, tanto en la raíz como anidados", () => {
  const intent = analyzeRequest({ operation: "edit", userPrompt: "Cambia el color del coche", currentImage: { base64: "x" }, styleId: null });
  intent.foo = "bar";
  intent.analysis.bar = "baz";
  const result = decideDirection({ intent });
  assert.equal(result.foo, "bar");
  assert.equal(result.analysis.bar, "baz");
});

test("22. Ausencia de direction previa real: el direction vacío por defecto de ANALYZE se sustituye por completo", () => {
  const intent = analyzeRequest({ operation: "edit", userPrompt: "Cambia el color del coche", currentImage: { base64: "x" }, styleId: null });
  assert.deepEqual(intent.direction, { styleId: null, priorities: [], notes: [] });
  const result = decideDirection({ intent });
  assert.notDeepEqual(result.direction.priorities, []);
});

test("23. direction previa corrupta (pero por lo demás válida) hace que el Intent completo se trate como inválido", () => {
  const intent = {
    ...analyzeRequest({ operation: "edit", userPrompt: "Cambia el color del coche", currentImage: { base64: "x" }, styleId: null }),
    direction: { styleId: null, priorities: [42], notes: [] },
  };
  assert.equal(validateIntent(intent).valid, false);
  const result = decideDirection({ intent });
  assert.equal(result, intent);
  assert.deepEqual(result.direction, { styleId: null, priorities: [42], notes: [] }); // untouched, not "fixed"
});

test("24. Invariante transversal: request/operation/hasImage/analysis/protect/constraints/metadata/schemaVersion son la misma referencia, no solo deep-equal", () => {
  const intent = analyzeRequest({ operation: "edit", userPrompt: "Mejora la composición sin tocar el fondo", currentImage: { base64: "x" }, styleId: "cinematic" });
  const result = decideDirection({ intent });
  assertSameReferences(result, intent);
  assert.equal(result.request, intent.request);
});

test("decideDirection nunca lanza excepción, incluso llamado sin argumentos", () => {
  assert.doesNotThrow(() => decideDirection());
  assert.doesNotThrow(() => decideDirection({}));
  assert.doesNotThrow(() => decideDirection({ intent: null }));
  assert.doesNotThrow(() => decideDirection({ intent: "not an object" }));
});
