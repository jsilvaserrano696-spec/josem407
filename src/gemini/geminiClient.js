// Creates (and caches) the GoogleGenAI client used by every Gemini call in the app. Centralizing
// this means a key change in Settings takes effect on the very next call, with no stale client
// left holding an old key.
const { GoogleGenAI } = require("@google/genai");
const configStore = require("../services/configStore");

let cachedClient = null;
let cachedApiKey = null;

class MissingApiKeyError extends Error {
  constructor() {
    super("No Gemini API key configured. Add one from Settings to continue.");
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

module.exports = { getClient, resetClient, MissingApiKeyError };
