const test = require("node:test");
const assert = require("node:assert/strict");
const { extractDetectedElements } = require("./optimizerIntentBridge");

test("protect source:'user' + known constraints -> both extracted", () => {
  const intent = {
    protect: [
      { type: "element", ref: "fondo", of: null, source: "user", note: null },
      { type: "attribute", ref: "composition", of: null, source: "inferred", note: null },
    ],
    constraints: ["no_text_overlay", "preserve_aspect_ratio"],
  };
  assert.deepEqual(extractDetectedElements(intent), {
    protectedRefs: ["fondo"],
    constraintLabels: ["no añadir texto ni tipografía", "mantener la relación de aspecto original"],
  });
});

test("only inferred protect entries -> protectedRefs empty", () => {
  const intent = {
    protect: [{ type: "attribute", ref: "composition", of: null, source: "inferred", note: null }],
    constraints: [],
  };
  const result = extractDetectedElements(intent);
  assert.equal(result, null); // nothing safe to report at all
});

test("unknown constraint code is silently dropped, never invented as a label", () => {
  const intent = {
    protect: [{ type: "element", ref: "fondo", of: null, source: "user", note: null }],
    constraints: ["some_future_constraint"],
  };
  assert.deepEqual(extractDetectedElements(intent), { protectedRefs: ["fondo"], constraintLabels: [] });
});

test("nothing to report -> null, never an empty-but-present object", () => {
  assert.equal(extractDetectedElements({ protect: [], constraints: [] }), null);
});

test("intent null/undefined/non-object -> null, never throws", () => {
  assert.equal(extractDetectedElements(null), null);
  assert.equal(extractDetectedElements(undefined), null);
  assert.equal(extractDetectedElements("not an object"), null);
  assert.equal(extractDetectedElements(42), null);
});

test("protect/constraints not being arrays -> treated as empty, never throws", () => {
  assert.equal(extractDetectedElements({ protect: "oops", constraints: null }), null);
});

test("determinism: same input twice -> same output", () => {
  const intent = {
    protect: [{ type: "element", ref: "ruedas", of: null, source: "user", note: null }],
    constraints: ["no_watermark"],
  };
  assert.deepEqual(extractDetectedElements(intent), extractDetectedElements(intent));
});
