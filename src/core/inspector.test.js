const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectResult } = require("./inspector");
const inspectorHeuristics = require("./inspectorHeuristics");
const V = require("./inspectorVocabulary");
const { buildIntent } = require("./intentSchema");
const configStore = require("../services/configStore");
const editDebugLogger = require("../debug/editDebugLogger");

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
    Object.freeze(value);
  }
  return value;
}

function validEditIntent() {
  return buildIntent({
    operation: "edit", hasImage: true,
    request: { text: "Cambia el color del coche", styleId: null },
    analysis: { targets: ["coche"], action: "change_attribute", assumptions: [], confidence: 0.85 },
    protect: [{ type: "element", ref: "fondo", of: null, source: "user", note: null }],
    constraints: [], metadata: { createdAt: null, source: "test" },
  });
}

test("18. Full flow with a real ANALYZE+DIRECTOR-shaped Intent -> passed", () => {
  const report = inspectResult({ resultMeta: { mimeType: "image/png", bytes: 50000 }, intent: validEditIntent() });
  assert.deepEqual(report, { status: V.STATUS.PASSED, stage: V.STAGE.EDIT, score: 1, anomalies: [] });
});

test("19. Spy — inspectResult never touches any resultMeta property beyond bytes/mimeType", () => {
  // Deliberately NOT deep-frozen / structuredCloned: freezing or cloning an object with getters
  // would itself invoke them, falsifying this exact test — see the implementation note.
  let dataTouched = false;
  let base64Touched = false;
  const resultMeta = {
    mimeType: "image/png",
    bytes: 50000,
    get data() { dataTouched = true; return Buffer.from("x".repeat(1000)); },
    get base64() { base64Touched = true; return "x".repeat(1000); },
  };

  inspectResult({ resultMeta, intent: validEditIntent() });

  assert.equal(dataTouched, false);
  assert.equal(base64Touched, false);
});

test("20. Spy — Developer Mode logging carries only the sanitized report, never intent/resultMeta/prompt", (t) => {
  const originalGetSettings = configStore.getSettings;
  const originalLog = editDebugLogger.log;
  const calls = [];
  configStore.getSettings = () => ({ developerMode: true });
  editDebugLogger.log = (label, data) => calls.push({ label, data });
  t.after(() => {
    configStore.getSettings = originalGetSettings;
    editDebugLogger.log = originalLog;
  });

  const intent = validEditIntent();
  inspectResult({ resultMeta: { mimeType: "image/png", bytes: 50000 }, intent });

  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].data), ["report"]);
  const serialized = JSON.stringify(calls[0]);
  assert.ok(!serialized.includes(intent.request.text)); // the user's prompt never appears
  assert.ok(!serialized.includes("fondo")); // no protect ref content either
  assert.ok(!serialized.includes("base64"));
});

test("Developer Mode off -> no log call at all", (t) => {
  const originalGetSettings = configStore.getSettings;
  const originalLog = editDebugLogger.log;
  const calls = [];
  configStore.getSettings = () => ({ developerMode: false });
  editDebugLogger.log = (label, data) => calls.push({ label, data });
  t.after(() => {
    configStore.getSettings = originalGetSettings;
    editDebugLogger.log = originalLog;
  });

  inspectResult({ resultMeta: { mimeType: "image/png", bytes: 50000 }, intent: validEditIntent() });
  assert.equal(calls.length, 0);
});

test("21. resultMeta and intent are not mutated — deep-freeze + structuredClone/deepStrictEqual + strictEqual", () => {
  const resultMeta = deepFreeze({ mimeType: "image/png", bytes: 50000 });
  const intent = deepFreeze(validEditIntent());
  const resultMetaSnapshot = structuredClone(resultMeta);
  const intentSnapshot = structuredClone(intent);
  const protectRef = intent.protect;
  const analysisRef = intent.analysis;

  assert.doesNotThrow(() => inspectResult({ resultMeta, intent }));

  assert.deepStrictEqual(resultMeta, resultMetaSnapshot);
  assert.deepStrictEqual(intent, intentSnapshot);
  assert.strictEqual(intent.protect, protectRef);
  assert.strictEqual(intent.analysis, analysisRef);
});

test("22. inspectResult() with no arguments never throws", () => {
  assert.doesNotThrow(() => inspectResult());
  assert.doesNotThrow(() => inspectResult({}));
  const report = inspectResult();
  // missing resultMeta is an error-severity anomaly -> dominates over the intent_invalid warning
  assert.equal(report.status, V.STATUS.FAILED_STRUCTURAL_CHECK);
  assert.deepEqual(report.anomalies, [V.ANOMALIES.MISSING_RESULT, V.ANOMALIES.INTENT_INVALID]);
});

test("23. Forced internal exception -> inspection_error, never propagates, no test-only hook in production code", (t) => {
  const original = inspectorHeuristics.buildReport;
  inspectorHeuristics.buildReport = () => { throw new Error("forced failure for test"); };
  t.after(() => { inspectorHeuristics.buildReport = original; });

  let report;
  assert.doesNotThrow(() => { report = inspectResult({ resultMeta: { mimeType: "image/png", bytes: 50000 }, intent: validEditIntent() }); });
  assert.deepEqual(report, { status: V.STATUS.INSPECTION_ERROR, stage: V.STAGE.UNKNOWN, score: null, anomalies: [] });
});

test("Idempotent end-to-end: calling inspectResult twice with the same inputs yields the same report", () => {
  const args = { resultMeta: { mimeType: "image/jpeg", bytes: 999 }, intent: validEditIntent() };
  assert.deepEqual(inspectResult(args), inspectResult(args));
});
