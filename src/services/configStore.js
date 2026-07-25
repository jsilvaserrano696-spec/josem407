// Persists the Gemini API key and app settings outside of source control, in Electron's
// per-user data directory. The key is encrypted at rest with Electron's OS-level `safeStorage`
// (DPAPI on Windows) whenever it's available; on platforms/setups where it isn't, we fall back
// to plain JSON and surface a warning rather than silently weakening security.
const fs = require("node:fs");
const path = require("node:path");
const { app, safeStorage } = require("electron");

const CONFIG_FILE_NAME = "config.json";

const DEFAULT_SETTINGS = {
  alwaysOptimizePrompts: false,
  conversationModeDefault: true,
};

function getConfigPath() {
  return path.join(app.getPath("userData"), CONFIG_FILE_NAME);
}

function readRawConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { apiKey: null, encrypted: false, settings: { ...DEFAULT_SETTINGS } };
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      apiKey: parsed.apiKey ?? null,
      encrypted: Boolean(parsed.encrypted),
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };
  } catch (error) {
    console.warn(`Failed to read config file, falling back to defaults: ${error.message}`);
    return { apiKey: null, encrypted: false, settings: { ...DEFAULT_SETTINGS } };
  }
}

function writeRawConfig(rawConfig) {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(rawConfig, null, 2), "utf-8");
}

function canEncrypt() {
  return typeof safeStorage?.isEncryptionAvailable === "function" && safeStorage.isEncryptionAvailable();
}

/**
 * Returns the active Gemini API key, migrating it in from GEMINI_API_KEY (.env) on first run
 * if no key has been set via Settings yet.
 */
function getApiKey() {
  const config = readRawConfig();

  if (config.apiKey) {
    if (config.encrypted) {
      try {
        return safeStorage.decryptString(Buffer.from(config.apiKey, "base64"));
      } catch (error) {
        console.warn(`Failed to decrypt stored API key: ${error.message}`);
        return null;
      }
    }
    return config.apiKey;
  }

  const envKey = process.env.GEMINI_API_KEY;
  if (envKey) {
    setApiKey(envKey);
    return envKey;
  }

  return null;
}

function setApiKey(apiKey) {
  const config = readRawConfig();

  if (canEncrypt()) {
    config.apiKey = safeStorage.encryptString(apiKey).toString("base64");
    config.encrypted = true;
  } else {
    console.warn(
      "OS-level encryption is unavailable on this system; storing the API key as plain text in userData/config.json."
    );
    config.apiKey = apiKey;
    config.encrypted = false;
  }

  writeRawConfig(config);
}

function getSettings() {
  return readRawConfig().settings;
}

function setSettings(partialSettings) {
  const config = readRawConfig();
  config.settings = { ...config.settings, ...partialSettings };
  writeRawConfig(config);
  return config.settings;
}

function hasApiKey() {
  return Boolean(getApiKey());
}

module.exports = {
  getApiKey,
  setApiKey,
  getSettings,
  setSettings,
  hasApiKey,
};
