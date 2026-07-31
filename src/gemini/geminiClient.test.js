// In-memory tests only: no real network, no real Electron, no persistent configuration. Every
// external dependency (configStore, editDebugLogger) is monkey-patched per test and restored in
// t.after() — there is no test-only flag or branch in geminiClient.js itself. Constructing real
// `GoogleGenAI`/`ApiError` instances from @google/genai is safe here (verified: synchronous,
// instantaneous, no network) — only *calling* a method on the client would reach the network, and
// no test here ever does that.
//
// Cross-file isolation for node --test is automatic (verified empirically for this suite: an
// unrestored patch in one test file never leaks into another). Within this file, tests share the
// require() cache and run sequentially by default, so resetClient() + patch/restore is what
// prevents interference between tests here.
const test = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("@google/genai");
const geminiClient = require("./geminiClient");
const configStore = require("../services/configStore");
const editDebugLogger = require("../debug/editDebugLogger");

const originalGetApiKey = configStore.getApiKey;
const originalGetSettings = configStore.getSettings;
const originalLog = editDebugLogger.log;

function patch(t, obj, key, fn) {
  const original = obj[key];
  obj[key] = fn;
  t.after(() => {
    obj[key] = original;
  });
}

function withApiKey(t, value) {
  patch(t, configStore, "getApiKey", () => value);
}

function withSettings(t, settings = { language: "es", developerMode: false }) {
  patch(t, configStore, "getSettings", () => settings);
}

function mockLogger(t) {
  const logs = [];
  patch(t, editDebugLogger, "log", (label, data) => logs.push({ label, data }));
  return logs;
}

function apiErrorWithThrowingStatusGetter(message, error) {
  Object.defineProperty(error, "status", {
    get() {
      throw new Error("status getter boom");
    },
  });
  return error;
}

// --- getClient() ----------------------------------------------------------------------------

test("1. valid API key -> returns a client without throwing", (t) => {
  geminiClient.resetClient();
  t.after(() => geminiClient.resetClient());
  withApiKey(t, "AIzaSyValidKeyForTesting");

  const client = geminiClient.getClient();

  assert.equal(typeof client.models, "object");
});

test("2. missing API key (null) -> MissingApiKeyError", (t) => {
  geminiClient.resetClient();
  t.after(() => geminiClient.resetClient());
  withApiKey(t, null);
  withSettings(t);

  assert.throws(() => geminiClient.getClient(), geminiClient.MissingApiKeyError);
});

test("3. empty API key -> MissingApiKeyError", (t) => {
  geminiClient.resetClient();
  t.after(() => geminiClient.resetClient());
  withApiKey(t, "");
  withSettings(t);

  assert.throws(() => geminiClient.getClient(), geminiClient.MissingApiKeyError);
});

test("4. whitespace-only API key -> MissingApiKeyError (fixed behavior)", (t) => {
  geminiClient.resetClient();
  t.after(() => geminiClient.resetClient());
  withApiKey(t, "   ");
  withSettings(t);

  assert.throws(() => geminiClient.getClient(), geminiClient.MissingApiKeyError);
});

test("5. valid key with accidental surrounding whitespace -> succeeds, trimmed", (t) => {
  geminiClient.resetClient();
  t.after(() => geminiClient.resetClient());
  withApiKey(t, "  AIzaSyValidKeyForTesting  ");

  assert.doesNotThrow(() => geminiClient.getClient());
});

test("6. padded key then unpadded same key -> same cached client (normalization applied to cache key too)", (t) => {
  geminiClient.resetClient();
  t.after(() => geminiClient.resetClient());
  withApiKey(t, "  AIzaSyValidKeyForTesting  ");
  const first = geminiClient.getClient();

  configStore.getApiKey = () => "AIzaSyValidKeyForTesting";
  const second = geminiClient.getClient();

  assert.equal(first, second);
});

test("7. changing the API key produces a different client", (t) => {
  geminiClient.resetClient();
  t.after(() => geminiClient.resetClient());
  withApiKey(t, "AIzaSyFirstKeyForTesting");
  const first = geminiClient.getClient();

  configStore.getApiKey = () => "AIzaSySecondKeyForTesting";
  const second = geminiClient.getClient();

  assert.notEqual(first, second);
});

test("8. configStore.getApiKey() throwing propagates unchanged", (t) => {
  geminiClient.resetClient();
  t.after(() => geminiClient.resetClient());
  const boom = new Error("simulated configStore failure");
  patch(t, configStore, "getApiKey", () => {
    throw boom;
  });

  assert.throws(() => geminiClient.getClient(), (error) => error === boom);
});

test("9. resetClient() followed by the same key produces a new client instance", (t) => {
  geminiClient.resetClient();
  t.after(() => geminiClient.resetClient());
  withApiKey(t, "AIzaSySameKeyForTesting");
  const first = geminiClient.getClient();

  geminiClient.resetClient();
  const second = geminiClient.getClient();

  assert.notEqual(first, second);
});

// --- describeGeminiError() -------------------------------------------------------------------

test("10. ApiError 401 -> invalid-key message, log category 'auth'", (t) => {
  withSettings(t);
  const logs = mockLogger(t);
  const error = new ApiError({ message: "irrelevant", status: 401 });

  const result = geminiClient.describeGeminiError(error);

  assert.ok(result instanceof Error);
  assert.notEqual(result, error);
  assert.equal(logs[0].data.status, 401);
  assert.equal(logs[0].data.category, "auth");
});

test("11. ApiError 403 -> same invalid-key message, log category 'auth'", (t) => {
  withSettings(t);
  const logs = mockLogger(t);
  const error = new ApiError({ message: "irrelevant", status: 403 });

  geminiClient.describeGeminiError(error);

  assert.equal(logs[0].data.category, "auth");
});

test("12. ApiError 500 -> generic message, log category 'server_error'", (t) => {
  withSettings(t);
  const logs = mockLogger(t);
  const error = new ApiError({ message: "irrelevant", status: 500 });

  geminiClient.describeGeminiError(error);

  assert.equal(logs[0].data.category, "server_error");
});

test("13. ApiError 429 -> log category 'rate_limit'", (t) => {
  withSettings(t);
  const logs = mockLogger(t);
  const error = new ApiError({ message: "irrelevant", status: 429 });

  geminiClient.describeGeminiError(error);

  assert.equal(logs[0].data.category, "rate_limit");
});

test("14. ApiError 404 -> log category 'client_error'", (t) => {
  withSettings(t);
  const logs = mockLogger(t);
  const error = new ApiError({ message: "irrelevant", status: 404 });

  geminiClient.describeGeminiError(error);

  assert.equal(logs[0].data.category, "client_error");
});

test("15. ApiError with no status -> log category 'unknown'", (t) => {
  withSettings(t);
  const logs = mockLogger(t);
  const error = new ApiError({ message: "irrelevant" });

  geminiClient.describeGeminiError(error);

  assert.equal(logs[0].data.category, "unknown");
});

test("16. a plain Error (not ApiError) is returned unchanged", () => {
  const plain = new Error("network hiccup");

  assert.equal(geminiClient.describeGeminiError(plain), plain);
});

test("17. a string as error is returned unchanged", () => {
  assert.equal(geminiClient.describeGeminiError("just a string"), "just a string");
});

test("18. null/undefined as error is returned unchanged", () => {
  assert.equal(geminiClient.describeGeminiError(null), null);
  assert.equal(geminiClient.describeGeminiError(undefined), undefined);
});

test("19. sensitive markers in error.message never reach the log or the return value", (t) => {
  withSettings(t);
  const logs = mockLogger(t);
  const secretMarkers = [
    "AIzaSy_MARKER_SECRET_KEY",
    "prompt marcador secreto del usuario",
    "ZmFrZS1iYXNlNjQtbWFya2Vy", // fake base64 marker
    "/ruta/secreta/del/usuario/foto.png",
  ];
  const error = new ApiError({ message: secretMarkers.join(" | "), status: 500 });

  const result = geminiClient.describeGeminiError(error);

  const serializedLogs = JSON.stringify(logs);
  const serializedResult = String(result.message);
  for (const marker of secretMarkers) {
    assert.ok(!serializedLogs.includes(marker), `marker leaked into logs: ${marker}`);
    assert.ok(!serializedResult.includes(marker), `marker leaked into return value: ${marker}`);
  }
  assert.deepEqual(Object.keys(logs[0].data).sort(), ["category", "status"]);
});

test("20. an object impersonating ApiError via duck-typing (not a real instance) is returned unchanged", () => {
  const fake = { name: "ApiError", status: 401, message: "not a real ApiError" };

  assert.equal(geminiClient.describeGeminiError(fake), fake);
});

test("21. ApiError with a throwing 'message' getter never affects the sanitized log (message is never read)", (t) => {
  withSettings(t);
  const logs = mockLogger(t);
  const error = new ApiError({ message: "placeholder", status: 500 });
  Object.defineProperty(error, "message", {
    get() {
      throw new Error("message getter boom");
    },
  });

  assert.doesNotThrow(() => geminiClient.describeGeminiError(error));
  assert.equal(logs[0].data.category, "server_error");
});

test("22. ApiError with a throwing 'status' getter falls back to the generic category, never propagates", (t) => {
  withSettings(t);
  const logs = mockLogger(t);
  const error = apiErrorWithThrowingStatusGetter("placeholder", new ApiError({ message: "placeholder", status: 401 }));

  let result;
  assert.doesNotThrow(() => {
    result = geminiClient.describeGeminiError(error);
  });

  assert.equal(logs[0].data.category, "unknown");
  assert.equal(logs[0].data.status, undefined);
  assert.equal(result.message, geminiClient.describeGeminiError(new ApiError({ message: "x", status: 999 })).message);
});

// --- Closing invariant ------------------------------------------------------------------------

test("23. all patched dependencies are restored to their original references after every test", () => {
  assert.equal(configStore.getApiKey, originalGetApiKey);
  assert.equal(configStore.getSettings, originalGetSettings);
  assert.equal(editDebugLogger.log, originalLog);
});
