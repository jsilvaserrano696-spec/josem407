const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./inspectorHeuristics");
const V = require("./inspectorVocabulary");
const { buildIntent } = require("./intentSchema");

function validEditIntent() {
  return buildIntent({
    operation: "edit", hasImage: true,
    request: { text: "x", styleId: null },
    analysis: { targets: ["coche"], action: "change_attribute", assumptions: [], confidence: 0.85 },
    protect: [], constraints: [], metadata: { createdAt: null, source: "test" },
  });
}

test("checkResultMeta — valid resultMeta, known mimeType, plausible size -> no anomalies", () => {
  const result = h.checkResultMeta({ mimeType: "image/png", bytes: 50000 });
  assert.deepEqual(result.anomalies, []);
});

test("checkResultMeta — resultMeta not an object -> MISSING_RESULT only", () => {
  assert.deepEqual(h.checkResultMeta(null).anomalies, [V.ANOMALIES.MISSING_RESULT]);
  assert.deepEqual(h.checkResultMeta(undefined).anomalies, [V.ANOMALIES.MISSING_RESULT]);
  assert.deepEqual(h.checkResultMeta("not an object").anomalies, [V.ANOMALIES.MISSING_RESULT]);
});

test("checkResultMeta — bytes absent/wrong type -> MISSING_DATA_LENGTH", () => {
  assert.deepEqual(h.checkResultMeta({ mimeType: "image/png" }).anomalies, [V.ANOMALIES.MISSING_DATA_LENGTH]);
  assert.deepEqual(h.checkResultMeta({ mimeType: "image/png", bytes: "5000" }).anomalies, [V.ANOMALIES.MISSING_DATA_LENGTH]);
});

test("checkResultMeta — bytes === 0 -> EMPTY_DATA", () => {
  assert.deepEqual(h.checkResultMeta({ mimeType: "image/png", bytes: 0 }).anomalies, [V.ANOMALIES.EMPTY_DATA]);
});

test("checkResultMeta — bytes below threshold -> UNUSUALLY_SMALL_DATA (warning only)", () => {
  const result = h.checkResultMeta({ mimeType: "image/png", bytes: 10 });
  assert.deepEqual(result.anomalies, [V.ANOMALIES.UNUSUALLY_SMALL_DATA]);
  assert.equal(V.ANOMALY_SEVERITY[V.ANOMALIES.UNUSUALLY_SMALL_DATA], V.SEVERITY.WARNING);
});

test("checkResultMeta — mimeType absent -> MISSING_MIME_TYPE", () => {
  assert.deepEqual(h.checkResultMeta({ bytes: 50000 }).anomalies, [V.ANOMALIES.MISSING_MIME_TYPE]);
});

test("checkResultMeta — mimeType unsupported -> UNSUPPORTED_MIME_TYPE", () => {
  assert.deepEqual(h.checkResultMeta({ mimeType: "text/plain", bytes: 50000 }).anomalies, [V.ANOMALIES.UNSUPPORTED_MIME_TYPE]);
});

test("checkResultMeta — multiple anomalies, deterministic order (size before mimeType)", () => {
  const result = h.checkResultMeta({ mimeType: "text/plain", bytes: 10 });
  assert.deepEqual(result.anomalies, [V.ANOMALIES.UNUSUALLY_SMALL_DATA, V.ANOMALIES.UNSUPPORTED_MIME_TYPE]);
});

test("checkIntentValidity — valid intent, operation reflected as stage", () => {
  const editResult = h.checkIntentValidity(validEditIntent());
  assert.deepEqual(editResult, { anomalies: [], stage: V.STAGE.EDIT });

  const generateIntent = buildIntent({ operation: "generate", hasImage: false });
  assert.equal(h.checkIntentValidity(generateIntent).stage, V.STAGE.GENERATE);
});

test("checkIntentValidity — invalid intent -> INTENT_INVALID, stage unknown", () => {
  const invalid = buildIntent({ operation: "not_real", hasImage: true });
  assert.deepEqual(h.checkIntentValidity(invalid), { anomalies: [V.ANOMALIES.INTENT_INVALID], stage: V.STAGE.UNKNOWN });
  assert.deepEqual(h.checkIntentValidity(null), { anomalies: [V.ANOMALIES.INTENT_INVALID], stage: V.STAGE.UNKNOWN });
  assert.deepEqual(h.checkIntentValidity(undefined), { anomalies: [V.ANOMALIES.INTENT_INVALID], stage: V.STAGE.UNKNOWN });
});

// Getters that throw — deliberately NOT passed through deepFreeze/structuredClone anywhere, since
// either operation could itself trigger the getter and falsify the test (see the design writeup's
// precision note). These are constructed and used directly, read-only, once.
test("safeRead / checkResultMeta — throwing getters degrade to 'absent', never propagate", () => {
  const poisoned = {
    get bytes() { throw new Error("boom"); },
    get mimeType() { throw new Error("boom"); },
  };
  assert.doesNotThrow(() => h.checkResultMeta(poisoned));
  assert.deepEqual(h.checkResultMeta(poisoned).anomalies, [V.ANOMALIES.MISSING_DATA_LENGTH, V.ANOMALIES.MISSING_MIME_TYPE]);
});

test("checkIntentValidity — throwing intent property degrades to intent_invalid, never propagates", () => {
  const poisoned = {
    get operation() { throw new Error("boom"); },
    get hasImage() { throw new Error("boom"); },
    get request() { throw new Error("boom"); },
    get analysis() { throw new Error("boom"); },
    get direction() { throw new Error("boom"); },
    get protect() { throw new Error("boom"); },
    get constraints() { throw new Error("boom"); },
    get metadata() { throw new Error("boom"); },
    get schemaVersion() { throw new Error("boom"); },
  };
  assert.doesNotThrow(() => h.checkIntentValidity(poisoned));
  assert.deepEqual(h.checkIntentValidity(poisoned), { anomalies: [V.ANOMALIES.INTENT_INVALID], stage: V.STAGE.UNKNOWN });
});

test("checkResultMeta — Object.freeze does not affect the result (read-only access)", () => {
  const resultMeta = Object.freeze({ mimeType: "image/png", bytes: 50000 });
  assert.deepEqual(h.checkResultMeta(resultMeta).anomalies, []);
});

test("computeStatus — a single error anomaly dominates any number of warnings", () => {
  assert.equal(h.computeStatus([]), V.STATUS.PASSED);
  assert.equal(h.computeStatus([V.ANOMALIES.UNUSUALLY_SMALL_DATA]), V.STATUS.PASSED_WITH_WARNINGS);
  assert.equal(h.computeStatus([V.ANOMALIES.MISSING_MIME_TYPE, V.ANOMALIES.INTENT_INVALID]), V.STATUS.PASSED_WITH_WARNINGS);
  assert.equal(h.computeStatus([V.ANOMALIES.EMPTY_DATA]), V.STATUS.FAILED_STRUCTURAL_CHECK);
  assert.equal(
    h.computeStatus([V.ANOMALIES.UNUSUALLY_SMALL_DATA, V.ANOMALIES.MISSING_MIME_TYPE, V.ANOMALIES.EMPTY_DATA]),
    V.STATUS.FAILED_STRUCTURAL_CHECK
  );
});

test("computeScore — fixed mapping per status, never a weighted average", () => {
  assert.equal(h.computeScore(V.STATUS.PASSED), 1);
  assert.equal(h.computeScore(V.STATUS.PASSED_WITH_WARNINGS), 0.5);
  assert.equal(h.computeScore(V.STATUS.FAILED_STRUCTURAL_CHECK), 0);
  assert.equal(h.computeScore(V.STATUS.INSPECTION_ERROR), null);
});

test("buildReport — passed case, deterministic anomaly order, idempotent", () => {
  const args = { resultMeta: { mimeType: "image/png", bytes: 50000 }, intent: validEditIntent() };
  const first = h.buildReport(args);
  const second = h.buildReport(args);
  assert.deepEqual(first, { status: V.STATUS.PASSED, stage: V.STAGE.EDIT, score: 1, anomalies: [] });
  assert.deepEqual(first, second);
});

test("buildReport — resultMeta anomalies always precede the intent-derived one", () => {
  const report = h.buildReport({
    resultMeta: { mimeType: "text/plain", bytes: 10 },
    intent: buildIntent({ operation: "bad", hasImage: true }),
  });
  assert.deepEqual(report.anomalies, [
    V.ANOMALIES.UNUSUALLY_SMALL_DATA, V.ANOMALIES.UNSUPPORTED_MIME_TYPE, V.ANOMALIES.INTENT_INVALID,
  ]);
  assert.equal(report.status, V.STATUS.PASSED_WITH_WARNINGS);
  assert.equal(report.stage, V.STAGE.UNKNOWN);
});

test("buildReport — no Date.now()/randomness: same call twice is deep-equal", () => {
  const args = { resultMeta: { mimeType: "image/webp", bytes: 12345 }, intent: validEditIntent() };
  assert.deepEqual(h.buildReport(args), h.buildReport(args));
});
