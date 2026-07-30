// Creates (and caches) the GoogleGenAI client used by every Gemini call in the app. Centralizing
// this means a key change in Settings takes effect on the very next call, with no stale client
// left holding an old key.
const { GoogleGenAI, ApiError } = require("@google/genai");
const configStore = require("../services/configStore");
const { loadLocaleStrings } = require("../shared/localeStrings");
const editDebugLogger = require("../debug/editDebugLogger");

let cachedClient = null;
let cachedApiKey = null;

function currentStrings() {
  return loadLocaleStrings(configStore.getSettings().language || "es");
}

class MissingApiKeyError extends Error {
  constructor() {
    super(currentStrings()["error.missingApiKey"]);
    this.name = "MissingApiKeyError";
  }
}

function getClient() {
  const apiKey = configStore.getApiKey();
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedApiKey = apiKey;
  }

  return cachedClient;
}

function resetClient() {
  cachedClient = null;
  cachedApiKey = null;
}

/**
 * Turns the SDK's ApiError — whose `.message` is a raw JSON error envelope straight from
 * Google's API (e.g. `{"error":{"code":401,"message":"...","status":"UNAUTHENTICATED"}}`) —
 * into a short, generic, localized Error safe to show in the status bar (see
 * DESIGN_PHILOSOPHY.md: no API detail, status code, or model name ever reaches the user). The
 * real technical detail is only ever logged for developer mode, never returned. Anything that
 * isn't an ApiError is returned unchanged, so callers can always do
 * `catch (error) { throw describeGeminiError(error); }` without risking double-wrapping
 * already-clear errors (missing prompt, missing API key, etc).
 */
function describeGeminiError(error) {
  if (!(error instanceof ApiError)) {
    return error;
  }

  let detail = error.message;
  try {
    detail = JSON.parse(error.message)?.error?.message || detail;
  } catch {
    // error.message wasn't JSON after all — fall back to it as-is.
  }
  editDebugLogger.log("Gemini API error (developer mode detail)", { status: error.status, detail });

  const strings = currentStrings();
  if (error.status === 401 || error.status === 403) {
    return new Error(strings["error.invalidApiKey"]);
  }

  return new Error(strings["error.generic"]);
}

module.exports = { getClient, resetClient, MissingApiKeyError, describeGeminiError };
