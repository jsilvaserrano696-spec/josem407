const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./directorHeuristics");
const V = require("./directorVocabulary");

test("classifyConfidence — boundary values", () => {
  assert.equal(h.classifyConfidence(0), "LOW");
  assert.equal(h.classifyConfidence(0.39), "LOW");
  assert.equal(h.classifyConfidence(0.4), "MEDIUM");
  assert.equal(h.classifyConfidence(0.69), "MEDIUM");
  assert.equal(h.classifyConfidence(0.7), "HIGH");
  assert.equal(h.classifyConfidence(1), "HIGH");
  assert.equal(h.classifyConfidence(null), "LOW");
});

test("resolveActionProfile — all 9 actions plus an unrecognized one falling back to unknown_edit", () => {
  const known = [
    "generate_image", "generic_improve", "add_element", "remove_element", "replace_element",
    "change_attribute", "transform_style", "adjust_composition", "unknown_edit",
  ];
  for (const action of known) {
    assert.equal(h.resolveActionProfile(action), V.ACTION_PROFILES[action]);
  }
  assert.equal(h.resolveActionProfile("something_analyze_might_add_later"), V.DEFAULT_ACTION_PROFILE);
});

test("computePriorities — base profile, no reordering, no user protection", () => {
  const profile = V.ACTION_PROFILES.change_attribute;
  const priorities = h.computePriorities({ profile, hasUserProtection: false, conservative: false });
  assert.deepEqual(priorities, [V.PRIORITIES.REQUESTED_CHANGE, V.PRIORITIES.PROTECTED_ELEMENTS]);
});

test("computePriorities — conservative moves protected_elements before requested_change", () => {
  const profile = V.ACTION_PROFILES.change_attribute;
  const priorities = h.computePriorities({ profile, hasUserProtection: false, conservative: true });
  assert.deepEqual(priorities, [V.PRIORITIES.PROTECTED_ELEMENTS, V.PRIORITIES.REQUESTED_CHANGE]);
});

test("computePriorities — explicit_user_protection always wins position 0, even combined with conservative", () => {
  const profile = V.ACTION_PROFILES.change_attribute;
  const priorities = h.computePriorities({ profile, hasUserProtection: true, conservative: true });
  assert.deepEqual(priorities, [
    V.PRIORITIES.EXPLICIT_USER_PROTECTION,
    V.PRIORITIES.PROTECTED_ELEMENTS,
    V.PRIORITIES.REQUESTED_CHANGE,
  ]);
});

test("computePriorities — multiple explicit user protections still yield explicit_user_protection exactly once", () => {
  const profile = V.ACTION_PROFILES.remove_element;
  const priorities = h.computePriorities({ profile, hasUserProtection: true, conservative: false });
  assert.equal(priorities.filter((p) => p === V.PRIORITIES.EXPLICIT_USER_PROTECTION).length, 1);
  assert.equal(priorities[0], V.PRIORITIES.EXPLICIT_USER_PROTECTION);
});

test("computeNotes — multiple constraints appear once each, in the order given", () => {
  const notes = h.computeNotes({
    profile: V.ACTION_PROFILES.change_attribute,
    targets: ["coche"],
    constraints: ["no_text_overlay", "preserve_aspect_ratio", "no_watermark"],
    confidenceBand: "HIGH",
    hasContradiction: false,
  });
  assert.deepEqual(notes, [
    V.NOTES.CHANGE_ATTRIBUTE,
    V.NOTES.CONSTRAINT_NO_TEXT_OVERLAY,
    V.NOTES.CONSTRAINT_PRESERVE_ASPECT_RATIO,
    V.NOTES.CONSTRAINT_NO_WATERMARK,
  ]);
});

test("computeNotes — duplicate constraint codes never produce a duplicate note", () => {
  const notes = h.computeNotes({
    profile: V.ACTION_PROFILES.change_attribute,
    targets: ["coche"],
    constraints: ["no_text_overlay", "no_text_overlay"],
    confidenceBand: "HIGH",
    hasContradiction: false,
  });
  assert.deepEqual(notes, [V.NOTES.CHANGE_ATTRIBUTE, V.NOTES.CONSTRAINT_NO_TEXT_OVERLAY]);
});

test("computeNotes — unknown constraint code is silently ignored, no invented note", () => {
  const notes = h.computeNotes({
    profile: V.ACTION_PROFILES.change_attribute,
    targets: ["coche"],
    constraints: ["some_future_constraint"],
    confidenceBand: "HIGH",
    hasContradiction: false,
  });
  assert.deepEqual(notes, [V.NOTES.CHANGE_ATTRIBUTE]);
});

test("computeNotes — LOW and MEDIUM confidence notes are mutually exclusive", () => {
  const base = { profile: V.ACTION_PROFILES.unknown_edit, targets: [], constraints: [], hasContradiction: false };
  assert.ok(h.computeNotes({ ...base, confidenceBand: "LOW" }).includes(V.NOTES.LOW_CONFIDENCE));
  assert.ok(!h.computeNotes({ ...base, confidenceBand: "LOW" }).includes(V.NOTES.MEDIUM_CONFIDENCE));
  assert.ok(h.computeNotes({ ...base, confidenceBand: "MEDIUM" }).includes(V.NOTES.MEDIUM_CONFIDENCE));
  assert.ok(!h.computeNotes({ ...base, confidenceBand: "MEDIUM" }).includes(V.NOTES.LOW_CONFIDENCE));
  assert.ok(!h.computeNotes({ ...base, confidenceBand: "HIGH" }).includes(V.NOTES.LOW_CONFIDENCE));
  assert.ok(!h.computeNotes({ ...base, confidenceBand: "HIGH" }).includes(V.NOTES.MEDIUM_CONFIDENCE));
});

test("computeNotes — NO_TARGET_IDENTIFIED only for actions that expect a target", () => {
  const expects = h.computeNotes({
    profile: V.ACTION_PROFILES.change_attribute, targets: [], constraints: [], confidenceBand: "HIGH", hasContradiction: false,
  });
  assert.ok(expects.includes(V.NOTES.NO_TARGET_IDENTIFIED));

  const doesNotExpect = h.computeNotes({
    profile: V.ACTION_PROFILES.generic_improve, targets: [], constraints: [], confidenceBand: "HIGH", hasContradiction: false,
  });
  assert.ok(!doesNotExpect.includes(V.NOTES.NO_TARGET_IDENTIFIED));
});

test("hasExplicitUserProtection / detectContradiction — accent/case-insensitive, only source:'user' counts", () => {
  assert.equal(h.hasExplicitUserProtection([{ ref: "fondo", source: "user" }]), true);
  assert.equal(h.hasExplicitUserProtection([{ ref: "composition", source: "inferred" }]), false);

  assert.equal(h.detectContradiction(["cielo"], [{ ref: "el Cíelo", source: "user" }]), true);
  assert.equal(h.detectContradiction(["cielo"], [{ ref: "cielo", source: "inferred" }]), false);
  assert.equal(h.detectContradiction(["coche"], [{ ref: "fondo", source: "user" }]), false);
});

test("detectContradiction — recognizes 'al'/'del' contractions, not just plain articles", () => {
  assert.equal(h.detectContradiction(["cielo"], [{ ref: "del cielo", source: "user" }]), true);
  assert.equal(h.detectContradiction(["coche"], [{ ref: "al coche", source: "user" }]), true);
  // Case/accent-insensitive combined with the contraction, and still gated on source:"user".
  assert.equal(h.detectContradiction(["cielo"], [{ ref: "Del Cíelo", source: "user" }]), true);
  assert.equal(h.detectContradiction(["cielo"], [{ ref: "del cielo", source: "inferred" }]), false);
});

test("moveBefore — no-op when either item is absent, never throws", () => {
  assert.deepEqual(h.moveBefore(["a", "b"], "x", "b"), ["a", "b"]);
  assert.deepEqual(h.moveBefore(["a", "b"], "a", "x"), ["a", "b"]);
  assert.deepEqual(h.moveBefore([], "a", "b"), []);
});

test("computeDirection — idempotent: same inputs always produce the same output", () => {
  const args = {
    action: "change_attribute", targets: ["coche"],
    protect: [{ ref: "fondo", source: "user" }], constraints: [], confidence: 0.85, styleId: null,
  };
  const first = h.computeDirection(args);
  const second = h.computeDirection(args);
  assert.deepEqual(first, second);
});
