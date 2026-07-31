// Creates (and caches) the GoogleGenAI client used by every Gemini call in the app. Centralizing
// this means a key change in Settings takes effect on the very next call, with no stale client
// left holding an old key.
const { GoogleGenAI, ApiError } = require("@google/genai");
const configStore = require("../services/configStore");
const { currentStrings } = require("../services/currentLocaleStrings");
const editDebugLogger = require("../debug/editDebugLogger");

let cachedClient = null;
let cachedApiKey = null;

class MissingApiKeyError extends Error {
  constructor() {
    super(currentStrings()["error.missingApiKey"]);
    this.name = "MissingApiKeyError";
  }
}

function getClient() {
  // Trimmed so accidental leading/trailing whitespace (a common copy-paste artifact when pasting
  // into Settings) neither slips past the empty-key check below nor causes the same key, pasted
  // with vs. without surrounding spaces, to be treated as "different" for caching purposes. Real
  // Google API keys never carry meaningful leading/trailing whitespace, so this can't break a
  // legitimate key.
  const apiKey = configStore.getApiKey()?.trim();
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

// Closed, sanitized categories for the diagnostic log below — never the provider's raw message.
const ERROR_CATEGORY = {
  AUTH: "auth",
  RATE_LIMIT: "rate_limit",
  SERVER_ERROR: "server_error",
  CLIENT_ERROR: "client_error",
  UNKNOWN: "unknown",
};

function categorizeApiErrorStatus(status) {
  if (status === 401 || status === 403) return ERROR_CATEGORY.AUTH;
  if (status === 429) return ERROR_CATEGORY.RATE_LIMIT;
  if (typeof status === "number" && status >= 500) return ERROR_CATEGORY.SERVER_ERROR;
  if (typeof status === "number" && status >= 400) return ERROR_CATEGORY.CLIENT_ERROR;
  return ERROR_CATEGORY.UNKNOWN;
}

// `error.status` is read through here, once, so a hostile/broken getter can never escape this
// module uncaught — degrades to `undefined` (-> ERROR_CATEGORY.UNKNOWN below), never propagates.
function safeReadStatus(error) {
  try {
    return error.status;
  } catch {
    return undefined;
  }
}

/**
 * Turns the SDK's ApiError into a short, generic, localized Error safe to show in the status bar
 * (see DESIGN_PHILOSOPHY.md: no API detail, status code, or model name ever reaches the user).
 * The diagnostic log only ever carries `status` (a plain HTTP/API status code) and a closed
 * `category` derived from it — never `.message`, `.stack`, `.details`, `.cause`, or the error
 * object itself, since the provider's raw text could in principle echo back something sensitive.
 * Anything that isn't an ApiError is returned unchanged, so callers can always do
 * `catch (error) { throw describeGeminiError(error); }` without risking double-wrapping
 * already-clear errors (missing prompt, missing API key, etc).
 */
function describeGeminiError(error) {
  if (!(error instanceof ApiError)) {
    return error;
  }

  const status = safeReadStatus(error);
  editDebugLogger.log("Gemini API error", { status, category: categorizeApiErrorStatus(status) });

  const strings = currentStrings();
  if (status === 401 || status === 403) {
    return new Error(strings["error.invalidApiKey"]);
  }

  return new Error(strings["error.generic"]);
}

module.exports = { getClient, resetClient, MissingApiKeyError, describeGeminiError };
