// In-memory tests only: no real network, no real Electron, no persistent configuration, no
// writes. The only external dependency transcribeAudio() calls is geminiClient.getClient(),
// monkey-patched per test via the module namespace and restored in t.after(). The "Gemini error"
// case deliberately uses a plain Error (not ApiError) so this file never needs to mock
// configStore at all — ApiError-specific translation is already exhaustively covered in
// geminiClient.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { transcribeAudio } = require("./voiceTranscriber");
const geminiClient = require("./geminiClient");

const originalGetClient = geminiClient.getClient;
const originalDescribeGeminiError = geminiClient.describeGeminiError;

function patch(t, obj, key, fn) {
  const original = obj[key];
  obj[key] = fn;
  t.after(() => {
    obj[key] = original;
  });
}

function newCapture() {
  return { calls: 0, model: undefined, contents: undefined };
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

// --- Success cases -----------------------------------------------------------------------

test("1. valid audio, mimeType absent -> success, defaults to audio/wav", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: "hola mundo" }, capture }));

  const result = await transcribeAudio({ base64: "AAAA" });

  assert.equal(result, "hola mundo");
  assert.equal(capture.contents[1].inlineData.mimeType, "audio/wav");
});

test("2. valid audio, explicit non-default audio mimeType -> used as-is, no closed format list", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: "hola" }, capture }));

  await transcribeAudio({ base64: "AAAA", mimeType: "audio/mp3" });

  assert.equal(capture.contents[1].inlineData.mimeType, "audio/mp3");
});

// --- base64 validation ---------------------------------------------------------------------

test("3. base64 not a string -> throws, zero calls to Gemini", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: "x" }, capture }));

  await assert.rejects(() => transcribeAudio({ base64: 42 }), Error);
  assert.equal(capture.calls, 0);
});

test("4. base64 empty string -> throws, zero calls to Gemini", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: "x" }, capture }));

  await assert.rejects(() => transcribeAudio({ base64: "" }), Error);
  assert.equal(capture.calls, 0);
});

// --- mimeType validation --------------------------------------------------------------------

test("5. mimeType not a string -> throws, zero calls to Gemini", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: "x" }, capture }));

  await assert.rejects(() => transcribeAudio({ base64: "AAAA", mimeType: 42 }), Error);
  assert.equal(capture.calls, 0);
});

test("6. mimeType without 'audio/' prefix -> throws, zero calls to Gemini", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: "x" }, capture }));

  await assert.rejects(() => transcribeAudio({ base64: "AAAA", mimeType: "video/mp4" }), Error);
  assert.equal(capture.calls, 0);
});

test("7. ' audio/wav ' (padded) -> accepted, sent to Gemini already trimmed", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: "x" }, capture }));

  await transcribeAudio({ base64: "AAAA", mimeType: " audio/wav " });

  assert.equal(capture.calls, 1);
  assert.equal(capture.contents[1].inlineData.mimeType, "audio/wav");
});

test("8. whitespace-only mimeType -> rejected, zero calls to Gemini", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: "x" }, capture }));

  await assert.rejects(() => transcribeAudio({ base64: "AAAA", mimeType: "   " }), Error);
  assert.equal(capture.calls, 0);
});

// --- defensive response handling -------------------------------------------------------------

test("9. response null -> does not throw a TypeError, returns ''", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: null, capture }));

  const result = await transcribeAudio({ base64: "AAAA" });

  assert.equal(result, "");
});

test("10. response.text absent -> returns ''", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: {}, capture }));

  const result = await transcribeAudio({ base64: "AAAA" });

  assert.equal(result, "");
});

test("11. response.text not a string -> returns '' (no TypeError from .trim())", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: 42 }, capture }));

  const result = await transcribeAudio({ base64: "AAAA" });

  assert.equal(result, "");
});

test("12. response.text empty string -> returns '' (unchanged existing behavior)", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: "" }, capture }));

  const result = await transcribeAudio({ base64: "AAAA" });

  assert.equal(result, "");
});

test("13. throwing 'text' getter -> never propagates, returns ''", async (t) => {
  const capture = newCapture();
  const response = {
    get text() {
      throw new Error("text getter boom");
    },
  };
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response, capture }));

  const result = await transcribeAudio({ base64: "AAAA" });

  assert.equal(result, "");
});

// --- Gemini error path -----------------------------------------------------------------------

test("14. Gemini call error (generic Error, not ApiError) propagates via describeGeminiError unchanged", async (t) => {
  const capture = newCapture();
  const networkError = new Error("simulated network failure");
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ error: networkError, capture }));

  await assert.rejects(() => transcribeAudio({ base64: "AAAA" }), (error) => error === networkError);
});

// --- Invariants -------------------------------------------------------------------------------

test("15. exactly one call to the model on success", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: "x" }, capture }));

  await transcribeAudio({ base64: "AAAA" });

  assert.equal(capture.calls, 1);
  assert.equal(capture.model, "gemini-flash-latest");
});

test("16. input argument is not mutated", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: "x" }, capture }));

  const input = Object.freeze({ base64: "AAAA", mimeType: " audio/wav " });
  const snapshot = structuredClone(input);

  await transcribeAudio(input);

  assert.deepStrictEqual(input, snapshot);
});

test("17. sensitive markers never appear in any thrown error message", async (t) => {
  const capture = newCapture();
  patch(t, geminiClient, "getClient", () => fakeGeminiClient({ response: { text: "x" }, capture }));

  const secretMarker = "AIzaSy_MARKER_SECRET_KEY_/ruta/secreta/audio.wav";

  await assert.rejects(
    () => transcribeAudio({ base64: 42, mimeType: secretMarker }),
    (error) => {
      assert.ok(!error.message.includes(secretMarker));
      return true;
    }
  );
});

// --- Closing invariant ----------------------------------------------------------------------

test("18. all patched dependencies are restored to their original references after every test", () => {
  assert.equal(geminiClient.getClient, originalGetClient);
  assert.equal(geminiClient.describeGeminiError, originalDescribeGeminiError);
});
