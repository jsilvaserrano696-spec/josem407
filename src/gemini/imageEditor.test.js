// In-memory tests only: no real network, no real Electron, no persistent configuration, no
// writes to user files. Every external dependency editImage()/generateImage() calls through a
// module namespace (geminiClient, configStore, editDebugLogger) is monkey-patched per test and
// restored in t.after() — there is no test-only flag or branch in imageEditor.js itself.
//
// Cross-file isolation for node --test is automatic (verified empirically outside this repo: an
// unrestored patch in one test file never leaks into another). Within this single file, tests
// share the require() cache and run sequentially by default (no concurrency configured), so the
// per-test patch+restore pattern below is what prevents interference between tests here.
const test = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("@google/genai");
const { editImage, generateImage, DEFAULT_MODEL } = require("./imageEditor");
const geminiClient = require("./geminiClient");
const configStore = require("../services/configStore");
const editDebugLogger = require("../debug/editDebugLogger");

const originalGetClient = geminiClient.getClient;
const originalDescribeGeminiError = geminiClient.describeGeminiError;
const originalGetSettings = configStore.getSettings;
const originalLog = editDebugLogger.log;
const originalLogError = editDebugLogger.logError;

function patch(t, obj, key, fn) {
  const original = obj[key];
  obj[key] = fn;
  t.after(() => {
    obj[key] = original;
  });
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
    Object.freeze(value);
  }
  return value;
}

const FAKE_BASE64 = Buffer.from("fake-bytes").toString("base64");

function fakeImageResponse({ mimeType = "image/png", data = FAKE_BASE64 } = {}) {
  return { candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }] };
}
function fakeTextOnlyResponse(text = "no puedo generar eso") {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}
function fakeEmptyResponse() {
  return {};
}

function fakeGeminiClient({ response, error, capture }) {
  return {
    models: {
      generateContent: async ({ model, contents }) => {
        capture.calls += 1;
        capture.model = model;
        capture.contents = contents;
        if (error) throw error;
        return response;
      },
    },
  };
}

function newCapture() {
  return { calls: 0, model: undefined, contents: undefined };
}

function mockLogger(t) {
  const logs = [];
  patch(t, editDebugLogger, "log", (label, data) => logs.push({ label, data }));
  patch(t, editDebugLogger, "logError", (label, error) => logs.push({ label, error }));
  return logs;
}

// --- Success cases -----------------------------------------------------------------------

test("1. editImage without originalImage -> success, no second reference image in contents", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  const result = await editImage({ prompt: "x", currentImage: { base64: "AAA", mimeType: "image/png" } });

  assert.equal(capture.contents.length, 3);
  assert.equal(result.mimeType, "image/png");
});

test("2. editImage with originalImage -> success, includes the second reference image", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  await editImage({
    prompt: "x",
    currentImage: { base64: "AAA", mimeType: "image/png" },
    originalImage: { base64: "BBB", mimeType: "image/png" },
  });

  assert.equal(capture.contents.length, 5);
});

test("3. generateImage -> contents is exactly [{ text: prompt }]", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  await generateImage({ prompt: "un bosque encantado" });

  assert.deepEqual(capture.contents, [{ text: "un bosque encantado" }]);
});

test("4. mimeType present in response is preserved", async (t) => {
  patch(t, geminiClient, "getClient", () =>
    fakeGeminiClient({ response: fakeImageResponse({ mimeType: "image/jpeg" }), capture: newCapture() })
  );

  const result = await generateImage({ prompt: "x" });

  assert.equal(result.mimeType, "image/jpeg");
});

test("5. mimeType absent in response defaults to image/png", async (t) => {
  const response = fakeImageResponse();
  delete response.candidates[0].content.parts[0].inlineData.mimeType;
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response, capture: newCapture() }));

  const result = await generateImage({ prompt: "x" });

  assert.equal(result.mimeType, "image/png");
});

test("6. byte extraction: result.data is a Buffer decoding the response's base64", async (t) => {
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture: newCapture() }));

  const result = await generateImage({ prompt: "x" });

  assert.ok(Buffer.isBuffer(result.data));
  assert.equal(result.data.toString(), "fake-bytes");
});

test("7. exactly one call to the model per invocation", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  await generateImage({ prompt: "x" });

  assert.equal(capture.calls, 1);
});

test("8. the model sent is always DEFAULT_MODEL", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  await generateImage({ prompt: "x" });

  assert.equal(capture.model, DEFAULT_MODEL);
  assert.equal(DEFAULT_MODEL, "gemini-2.5-flash-image");
});

// --- Error cases ---------------------------------------------------------------------------

test("9. geminiClient.getClient() throwing propagates the same error", async (t) => {
  const boom = new Error("simulated missing API key");
  patch(t, geminiClient, "getClient", () => {
    throw boom;
  });

  await assert.rejects(() => generateImage({ prompt: "x" }), (error) => error === boom);
});

test("10. empty response object -> throws (exact English text not asserted)", async (t) => {
  patch(t, configStore, "getSettings", () => ({ language: "es", developerMode: false }));
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeEmptyResponse(), capture: newCapture() }));

  await assert.rejects(() => generateImage({ prompt: "x" }), (error) => error instanceof Error);
});

test("11. unexpected structure (parts not an array / content missing) -> same failure as empty response", async (t) => {
  patch(t, configStore, "getSettings", () => ({ language: "es", developerMode: false }));
  const response = { candidates: [{ content: {} }] }; // no `parts` at all
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response, capture: newCapture() }));

  await assert.rejects(() => generateImage({ prompt: "x" }), (error) => error instanceof Error);
});

test("12. text-only response (no image) -> throws, and the model's text is logged", async (t) => {
  patch(t, configStore, "getSettings", () => ({ language: "es", developerMode: false }));
  const logs = mockLogger(t);
  patch(t, geminiClient, "getClient", () =>
    fakeGeminiClient({ response: fakeTextOnlyResponse("no puedo hacer eso"), capture: newCapture() })
  );

  await assert.rejects(() => generateImage({ prompt: "x" }), (error) => error instanceof Error);

  const noImageLog = logs.find((l) => l.label === "Gemini returned no image (developer mode detail)");
  assert.ok(noImageLog);
  assert.equal(noImageLog.data.modelText, "no puedo hacer eso");
});

test("13. inlineData present with mimeType absent -> success with default (explicit edge case)", async (t) => {
  const response = fakeImageResponse();
  delete response.candidates[0].content.parts[0].inlineData.mimeType;
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response, capture: newCapture() }));

  const result = await editImage({ prompt: "x", currentImage: { base64: "AAA", mimeType: "image/png" } });

  assert.equal(result.mimeType, "image/png");
});

test("14. generic network error (plain Error, not ApiError) is rethrown unchanged, no configStore needed", async (t) => {
  const networkError = new Error("simulated network failure");
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ error: networkError, capture: newCapture() }));

  await assert.rejects(() => generateImage({ prompt: "x" }), (error) => error === networkError);
});

test("15. ApiError (model/API error) is translated, never exposing the raw message/status", async (t) => {
  patch(t, configStore, "getSettings", () => ({ language: "es", developerMode: false }));
  const apiError = new ApiError({ message: "simulated model error", status: 500 });
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ error: apiError, capture: newCapture() }));

  await assert.rejects(
    () => generateImage({ prompt: "x" }),
    (error) => {
      assert.notEqual(error, apiError);
      assert.ok(!error.message.includes("simulated model error"));
      assert.ok(!("status" in error));
      return true;
    }
  );
});

test("16. empty/whitespace prompt throws synchronously before calling Gemini (exact text not asserted)", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  await assert.rejects(() => editImage({ prompt: "", currentImage: { base64: "AAA", mimeType: "image/png" } }), Error);
  await assert.rejects(() => generateImage({ prompt: "   " }), Error);
  assert.equal(capture.calls, 0);
});

test("17. missing currentImage/base64 in editImage throws before calling Gemini", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  await assert.rejects(() => editImage({ prompt: "x", currentImage: undefined }), Error);
  await assert.rejects(() => editImage({ prompt: "x", currentImage: {} }), Error);
  assert.equal(capture.calls, 0);
});

// --- Privacy --------------------------------------------------------------------------------

test("18. successful-call logs never contain the input base64", async (t) => {
  const logs = mockLogger(t);
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture: newCapture() }));

  await editImage({
    prompt: "x",
    currentImage: { base64: "CURRENT_SECRET_BASE64", mimeType: "image/png" },
    originalImage: { base64: "ORIGINAL_SECRET_BASE64", mimeType: "image/png" },
  });

  const serialized = JSON.stringify(logs);
  assert.ok(!serialized.includes("CURRENT_SECRET_BASE64"));
  assert.ok(!serialized.includes("ORIGINAL_SECRET_BASE64"));
});

test("19. 'no image' log carries only modelText, nothing else", async (t) => {
  patch(t, configStore, "getSettings", () => ({ language: "es", developerMode: false }));
  const logs = mockLogger(t);
  patch(t, geminiClient, "getClient", () =>
    fakeGeminiClient({ response: fakeTextOnlyResponse("texto del modelo"), capture: newCapture() })
  );

  await assert.rejects(() => generateImage({ prompt: "instrucción secreta del usuario" }), Error);

  const noImageLog = logs.find((l) => l.label === "Gemini returned no image (developer mode detail)");
  assert.deepEqual(Object.keys(noImageLog.data), ["modelText"]);
  assert.ok(!JSON.stringify(logs).includes("instrucción secreta del usuario"));
});

test("20. the final error for an ApiError never carries the raw crude message", async (t) => {
  patch(t, configStore, "getSettings", () => ({ language: "es", developerMode: false }));
  const apiError = new ApiError({ message: "RAW_CRUDE_API_DETAIL", status: 401 });
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ error: apiError, capture: newCapture() }));

  await assert.rejects(
    () => editImage({ prompt: "x", currentImage: { base64: "AAA", mimeType: "image/png" } }),
    (error) => {
      assert.ok(!error.message.includes("RAW_CRUDE_API_DETAIL"));
      return true;
    }
  );
});

test("21. spy: a marker embedded in the source image never reaches any captured log", async (t) => {
  const MARKER = "SPY_MARKER_SHOULD_NEVER_BE_LOGGED";
  const logs = mockLogger(t);
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture: newCapture() }));

  await editImage({ prompt: "x", currentImage: { base64: MARKER, mimeType: "image/png" } });

  assert.ok(!JSON.stringify(logs).includes(MARKER));
});

// --- Non-mutation -----------------------------------------------------------------------------

test("22. currentImage/originalImage are not mutated by a successful editImage call", async (t) => {
  const currentImage = deepFreeze({ base64: "AAA", mimeType: "image/png" });
  const originalImage = deepFreeze({ base64: "BBB", mimeType: "image/png" });
  const currentSnapshot = structuredClone(currentImage);
  const originalSnapshot = structuredClone(originalImage);
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture: newCapture() }));

  await assert.doesNotReject(() => editImage({ prompt: "x", currentImage, originalImage }));

  assert.deepStrictEqual(currentImage, currentSnapshot);
  assert.deepStrictEqual(originalImage, originalSnapshot);
});

test("23. exact shape of a successful result", async (t) => {
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture: newCapture() }));

  const result = await generateImage({ prompt: "x" });

  assert.deepEqual(Object.keys(result).sort(), ["data", "mimeType"]);
  assert.ok(Buffer.isBuffer(result.data));
  assert.equal(typeof result.mimeType, "string");
});

test("documents (without changing) Buffer.from's tolerant behavior on invalid base64: never throws", async (t) => {
  patch(t, geminiClient, "getClient", () =>
    fakeGeminiClient({ response: fakeImageResponse({ data: "not-valid-base64!!!" }), capture: newCapture() })
  );

  await assert.doesNotReject(() => generateImage({ prompt: "x" }));
});

// --- Closing invariant ----------------------------------------------------------------------

test("24. all patched dependencies are restored to their original references after every test", () => {
  assert.equal(geminiClient.getClient, originalGetClient);
  assert.equal(geminiClient.describeGeminiError, originalDescribeGeminiError);
  assert.equal(configStore.getSettings, originalGetSettings);
  assert.equal(editDebugLogger.log, originalLog);
  assert.equal(editDebugLogger.logError, originalLogError);
});
