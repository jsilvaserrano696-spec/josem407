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
const { editImage, generateImage, DEFAULT_MODEL, OUTPUT_IMAGE_SIZE } = require("./imageEditor");
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
      generateContent: async ({ model, contents, config }) => {
        capture.calls += 1;
        capture.model = model;
        capture.contents = contents;
        capture.config = config;
        if (error) throw error;
        return response;
      },
    },
  };
}

function newCapture() {
  return { calls: 0, model: undefined, contents: undefined, config: undefined };
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

  assert.deepEqual(capture.contents.slice(0, -1), [
    { text: "x" },
    { text: "Reference image A — current state, build the requested change on top of this:" },
    { inlineData: { mimeType: "image/png", data: "AAA" } },
  ]);
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

  assert.equal(capture.contents.length, 6);
});

test("2a. editImage with referenceImage labels and sends it after the source", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  const referenceImage = deepFreeze({ base64: "REFERENCE", mimeType: "image/jpeg" });
  const snapshot = structuredClone(referenceImage);
  await editImage({
    prompt: "usa su iluminación",
    currentImage: { base64: "SOURCE", mimeType: "image/png" },
    referenceImage,
  });

  assert.equal(capture.contents.length, 6);
  assert.match(capture.contents[0].text, /Image 1 — SOURCE IMAGE \/ MATRIX/);
  assert.match(capture.contents[0].text, /Image 2 — REFERENCE IMAGE \/ REFERENCE/);
  assert.deepEqual(capture.contents[4], {
    inlineData: { mimeType: "image/jpeg", data: "REFERENCE" },
  });
  assert.deepEqual(referenceImage, snapshot);
});

test("2b. editImage orders source, original anchor, then reference deterministically", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  await editImage({
    prompt: "usa los materiales de referencia",
    currentImage: { base64: "SOURCE", mimeType: "image/png" },
    originalImage: { base64: "ORIGINAL", mimeType: "image/png" },
    referenceImage: { base64: "REFERENCE", mimeType: "image/png" },
  });

  assert.equal(capture.contents.length, 8);
  assert.equal(capture.contents[2].inlineData.data, "SOURCE");
  assert.equal(capture.contents[4].inlineData.data, "ORIGINAL");
  assert.equal(capture.contents[6].inlineData.data, "REFERENCE");
  assert.match(capture.contents[0].text, /Image 3 — REFERENCE IMAGE/);
});

test("3. generateImage sends the prompt and requests a concise explanation", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  await generateImage({ prompt: "un bosque encantado" });

  assert.equal(capture.contents[0].text, "un bosque encantado");
  assert.match(capture.contents[1].text, /one concise plain-text sentence/);
});

test("3a. explanation language is closed to Spanish or English", async (t) => {
  const spanishCapture = newCapture();
  const fallbackCapture = newCapture();
  const clients = [spanishCapture, fallbackCapture].map((capture) =>
    fakeGeminiClient({ response: fakeImageResponse(), capture })
  );
  patch(t, geminiClient, "getClient", () => clients.shift());
  await generateImage({ prompt: "x", explanationLanguage: "es" });
  assert.match(spanishCapture.contents[1].text, /in Spanish/);

  await generateImage({ prompt: "x", explanationLanguage: "unexpected" });
  assert.match(fallbackCapture.contents[1].text, /in English/);
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

test("8. economy is requested by default with text-and-image 1K output", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  await generateImage({ prompt: "x" });

  assert.equal(capture.model, DEFAULT_MODEL);
  assert.equal(DEFAULT_MODEL, "gemini-3.1-flash-lite-image");
  assert.equal(OUTPUT_IMAGE_SIZE, "1K");
  assert.deepEqual(capture.config, {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: { imageSize: "1K" },
  });
});

test("8a. selecting Pro reaches the Pro model with 4K output", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  const result = await generateImage({ prompt: "x", modelTier: "pro" });

  assert.equal(capture.model, "gemini-3-pro-image");
  assert.equal(capture.config.imageConfig.imageSize, "4K");
  assert.equal(result.modelTier, "pro");
  assert.equal(result.modelId, "gemini-3-pro-image");
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

test("16. empty/whitespace prompt throws synchronously before calling Gemini, with the localized message", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  await assert.rejects(
    () => editImage({ prompt: "", currentImage: { base64: "AAA", mimeType: "image/png" } }),
    (error) => {
      assert.equal(error.message, "El texto de la instrucción no puede estar vacío.");
      return true;
    }
  );
  await assert.rejects(() => generateImage({ prompt: "   " }), Error);
  assert.equal(capture.calls, 0);
});

test("17. missing currentImage/base64 in editImage throws before calling Gemini, with the localized message", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: fakeImageResponse(), capture }));

  await assert.rejects(
    () => editImage({ prompt: "x", currentImage: undefined }),
    (error) => {
      assert.equal(error.message, "Se necesita una imagen de origen para editar.");
      return true;
    }
  );
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

  assert.deepEqual(Object.keys(result).sort(), ["data", "explanation", "mimeType", "modelId", "modelTier"]);
  assert.ok(Buffer.isBuffer(result.data));
  assert.equal(typeof result.mimeType, "string");
  assert.equal(result.explanation, null);
});

test("23a. response text becomes a trimmed, bounded explanation", async (t) => {
  const response = fakeImageResponse();
  response.candidates[0].content.parts.unshift({ text: `  ${"visible ".repeat(100)}  ` });
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response, capture: newCapture() }));

  const result = await generateImage({ prompt: "x" });

  assert.equal(result.explanation.length, 600);
  assert.match(result.explanation, /^visible/);
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
