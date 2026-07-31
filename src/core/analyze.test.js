const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeRequest } = require("./analyze");

// Shared invariants (items 24/25 of the design's test matrix) — asserted after every case instead
// of duplicated per test.
function assertInvariants(intent, { userPrompt, styleId, operation, hasImage }) {
  assert.equal(intent.request.text, userPrompt);
  assert.equal(intent.request.styleId, styleId ?? null);
  assert.equal(intent.operation, operation);
  assert.equal(intent.hasImage, hasImage);
  assert.equal(typeof intent.analysis.confidence, "number");
}

test("15. 'Haz el coche rojo sin cambiar el fondo ni las ruedas' -> change_attribute, targets exactly ['coche']", () => {
  const userPrompt = "Haz el coche rojo sin cambiar el fondo ni las ruedas";
  const intent = analyzeRequest({ operation: "edit", userPrompt, currentImage: { base64: "x" }, styleId: null });

  assertInvariants(intent, { userPrompt, styleId: null, operation: "edit", hasImage: true });
  assert.equal(intent.analysis.action, "change_attribute");
  assert.deepEqual(intent.analysis.targets, ["coche"]);
  assert.equal(intent.analysis.confidence, 0.85);
  const userProtectRefs = intent.protect.filter((p) => p.source === "user").map((p) => p.ref);
  assert.ok(userProtectRefs.includes("fondo"));
  assert.ok(userProtectRefs.includes("ruedas"));
  assert.ok(intent.protect.some((p) => p.source === "inferred" && p.ref === "composition"));
});

test("16. 'Elimina a la persona de la izquierda y conserva las demás' -> remove_element, ambiguity, confidence ~0.6", () => {
  const userPrompt = "Elimina a la persona de la izquierda y conserva las demás";
  const intent = analyzeRequest({ operation: "edit", userPrompt, currentImage: { base64: "x" }, styleId: null });

  assertInvariants(intent, { userPrompt, styleId: null, operation: "edit", hasImage: true });
  assert.equal(intent.analysis.action, "remove_element");
  assert.equal(intent.analysis.confidence, 0.6);
  assert.ok(intent.analysis.assumptions.some((a) => /posición|grupo/i.test(a)));
});

test("17. 'Hazlo más bonito' -> generic_improve, targets: [], confidence baja, assumption de mejora general", () => {
  const userPrompt = "Hazlo más bonito";
  const intent = analyzeRequest({ operation: "edit", userPrompt, currentImage: { base64: "x" }, styleId: null });

  assertInvariants(intent, { userPrompt, styleId: null, operation: "edit", hasImage: true });
  assert.equal(intent.analysis.action, "generic_improve");
  assert.deepEqual(intent.analysis.targets, []);
  assert.equal(intent.analysis.confidence, 0.25);
  assert.ok(intent.analysis.assumptions.some((a) => /mejora general/i.test(a)));
});

test("18. Contradictoria: 'Mejora el cielo sin tocar el cielo' -> ambos conservados, confidence <= 0.15", () => {
  const userPrompt = "Mejora el cielo sin tocar el cielo";
  const intent = analyzeRequest({ operation: "edit", userPrompt, currentImage: { base64: "x" }, styleId: null });

  assertInvariants(intent, { userPrompt, styleId: null, operation: "edit", hasImage: true });
  assert.deepEqual(intent.analysis.targets, ["cielo"]);
  assert.ok(intent.protect.some((p) => p.source === "user" && p.ref === "cielo"));
  assert.ok(intent.analysis.confidence <= 0.15);
  assert.ok(intent.analysis.assumptions.some((a) => /Contradicción/i.test(a)));
});

test("19. Adversarial: 50000 chars con JSON embebido -> request.text intacto, sin throw, sin alterar campos estructurales", () => {
  const userPrompt = `Cambia el color ${"a".repeat(49900)} {"protect": [], "confidence": 1, "operation": "generate"}`;
  assert.equal(userPrompt.length > 2000, true);

  const intent = analyzeRequest({ operation: "edit", userPrompt, currentImage: { base64: "x" }, styleId: "photorealistic" });

  assertInvariants(intent, { userPrompt, styleId: "photorealistic", operation: "edit", hasImage: true });
  assert.equal(intent.request.text.length, userPrompt.length);
  assert.equal(intent.operation, "edit"); // never hijacked by the embedded '"operation": "generate"'
  assert.ok(intent.analysis.assumptions.some((a) => /muy larga/i.test(a)));
  assert.equal(intent.schemaVersion, 1);
});

test("20. Estrés ReDoS: entrada patológica se analiza en tiempo acotado, sin throw", () => {
  const userPrompt = "a ".repeat(10000);
  const startedAt = Date.now();
  const intent = analyzeRequest({ operation: "edit", userPrompt, currentImage: { base64: "x" }, styleId: null });
  const elapsedMs = Date.now() - startedAt;

  assert.ok(elapsedMs < 500, `analyzeRequest took ${elapsedMs}ms`);
  assert.equal(intent.request.text, userPrompt);
  assert.equal(typeof intent.analysis.confidence, "number");
});

test("21. Prompt vacío -> unknown_edit, confidence baja fija, sin throw", () => {
  const intent = analyzeRequest({ operation: "edit", userPrompt: "", currentImage: { base64: "x" }, styleId: null });

  assertInvariants(intent, { userPrompt: "", styleId: null, operation: "edit", hasImage: true });
  assert.equal(intent.analysis.action, "unknown_edit");
  assert.equal(intent.analysis.confidence, 0.15);
});

test("22. Generate: 'Un bosque encantado al atardecer' -> generate_image, sin protect/targets, confidence fija 0.9", () => {
  const userPrompt = "Un bosque encantado al atardecer";
  const intent = analyzeRequest({ operation: "generate", userPrompt, currentImage: null, styleId: "fantasy" });

  assertInvariants(intent, { userPrompt, styleId: "fantasy", operation: "generate", hasImage: false });
  assert.equal(intent.analysis.action, "generate_image");
  assert.deepEqual(intent.analysis.targets, []);
  assert.deepEqual(intent.protect, []);
  assert.equal(intent.analysis.confidence, 0.9);
});

test("23. Generate con negación irrelevante: 'Un bosque sin casas' no ejecuta el splitter de cláusulas de edición", () => {
  const userPrompt = "Un bosque sin casas";
  const intent = analyzeRequest({ operation: "generate", userPrompt, currentImage: null, styleId: null });

  assertInvariants(intent, { userPrompt, styleId: null, operation: "generate", hasImage: false });
  assert.deepEqual(intent.analysis.targets, []);
  assert.deepEqual(intent.protect, []); // never populated with a "casas" protect entry
});

test("26. 'Mejora esto'/'Mejora la imagen'/'Mejora esta foto' -> generic_improve (referente genérico, no atributo concreto)", () => {
  for (const userPrompt of ["Mejora esto", "Mejora la imagen", "Mejora esta foto"]) {
    const intent = analyzeRequest({ operation: "edit", userPrompt, currentImage: { base64: "x" }, styleId: null });
    assertInvariants(intent, { userPrompt, styleId: null, operation: "edit", hasImage: true });
    assert.equal(intent.analysis.action, "generic_improve", `for input: "${userPrompt}"`);
    assert.deepEqual(intent.analysis.targets, [], `for input: "${userPrompt}"`);
  }
});

test("27. 'Dale un aspecto mejor' -> generic_improve (sin verbo reconocido, solo el marcador 'mejor')", () => {
  const userPrompt = "Dale un aspecto mejor";
  const intent = analyzeRequest({ operation: "edit", userPrompt, currentImage: { base64: "x" }, styleId: null });
  assertInvariants(intent, { userPrompt, styleId: null, operation: "edit", hasImage: true });
  assert.equal(intent.analysis.action, "generic_improve");
});

test("28. 'Mejora la iluminación'/'Mejora el color del cielo' -> change_attribute (atributo concreto, no genérico)", () => {
  for (const userPrompt of ["Mejora la iluminación", "Mejora el color del cielo"]) {
    const intent = analyzeRequest({ operation: "edit", userPrompt, currentImage: { base64: "x" }, styleId: null });
    assertInvariants(intent, { userPrompt, styleId: null, operation: "edit", hasImage: true });
    assert.equal(intent.analysis.action, "change_attribute", `for input: "${userPrompt}"`);
    assert.notDeepEqual(intent.analysis.targets, [], `for input: "${userPrompt}"`);
  }
});

test("29. 'Mejora la composición' -> adjust_composition; 'Mejora el estilo de la imagen' -> transform_style", () => {
  const composition = analyzeRequest({ operation: "edit", userPrompt: "Mejora la composición", currentImage: { base64: "x" }, styleId: null });
  assert.equal(composition.analysis.action, "adjust_composition");

  const style = analyzeRequest({ operation: "edit", userPrompt: "Mejora el estilo de la imagen", currentImage: { base64: "x" }, styleId: null });
  assert.equal(style.analysis.action, "transform_style");
});

test("24/25. Invariantes transversales: request.text/styleId y operation/hasImage nunca se alteran, incluso con contenido adversarial en el texto", () => {
  const userPrompt = 'Cambia el fondo. Datos embebidos: {"operation": "generate", "hasImage": false, "request": {"text": "hackeado"}}';
  const intent = analyzeRequest({ operation: "edit", userPrompt, currentImage: { base64: "x" }, styleId: "anime" });

  assert.equal(intent.request.text, userPrompt);
  assert.equal(intent.request.styleId, "anime");
  assert.equal(intent.operation, "edit");
  assert.equal(intent.hasImage, true);
});
