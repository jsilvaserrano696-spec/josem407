// In-memory tests only: no real network, no real Electron reliance beyond what configStore
// already tolerates, no persistent configuration writes. `configStore.getSettings` and
// `sharedLocaleStrings.loadLocaleStrings` are monkey-patched per test and restored in t.after().
const test = require("node:test");
const assert = require("node:assert/strict");
const { currentStrings } = require("./currentLocaleStrings");
const configStore = require("./configStore");
const sharedLocaleStrings = require("../shared/localeStrings");

const FIVE_VALIDATION_KEYS = [
  "error.emptyPrompt",
  "error.missingSourceImage",
  "error.optimizationFailed",
  "error.noAudioProvided",
  "error.unsupportedAudioFormat",
];

const originalGetSettings = configStore.getSettings;
const originalLoadLocaleStrings = sharedLocaleStrings.loadLocaleStrings;

function patch(t, obj, key, fn) {
  const original = obj[key];
  obj[key] = fn;
  t.after(() => {
    obj[key] = original;
  });
}

test("1. language 'es' -> real Spanish strings from es.json", (t) => {
  patch(t, configStore, "getSettings", () => ({ language: "es" }));

  const strings = currentStrings();

  assert.equal(strings["error.generic"], "Algo no ha salido bien. Inténtalo de nuevo.");
});

test("2. language 'en' -> real English strings from en.json", (t) => {
  patch(t, configStore, "getSettings", () => ({ language: "en" }));

  const strings = currentStrings();

  assert.equal(strings["error.generic"], "Something went wrong. Please try again.");
});

test("3. language absent -> defaults to 'es'", (t) => {
  patch(t, configStore, "getSettings", () => ({ language: undefined }));

  const strings = currentStrings();

  assert.equal(strings["error.generic"], "Algo no ha salido bien. Inténtalo de nuevo.");
});

test("4. configStore.getSettings() throws -> does not propagate, falls back to real 'es' strings", (t) => {
  patch(t, configStore, "getSettings", () => {
    throw new Error("simulated configStore failure");
  });

  let strings;
  assert.doesNotThrow(() => {
    strings = currentStrings();
  });
  assert.equal(strings["error.generic"], "Algo no ha salido bien. Inténtalo de nuevo.");
});

test("5. nonexistent language code -> loadLocaleStrings()'s own internal fallback to es.json applies", (t) => {
  patch(t, configStore, "getSettings", () => ({ language: "xx" }));

  const strings = currentStrings();

  assert.equal(strings["error.generic"], "Algo no ha salido bien. Inténtalo de nuevo.");
});

test("6. extreme double failure (loadLocaleStrings itself throws) -> last-resort strings, all five keys non-empty", (t) => {
  patch(t, configStore, "getSettings", () => ({ language: "es" }));
  patch(t, sharedLocaleStrings, "loadLocaleStrings", () => {
    throw new Error("simulated: all locale files unavailable");
  });

  let strings;
  assert.doesNotThrow(() => {
    strings = currentStrings();
  });

  for (const key of FIVE_VALIDATION_KEYS) {
    assert.equal(typeof strings[key], "string", `${key} should be a string`);
    assert.ok(strings[key].length > 0, `${key} should not be empty`);
  }
});

test("7. all patched dependencies are restored to their original references after every test", () => {
  assert.equal(configStore.getSettings, originalGetSettings);
  assert.equal(sharedLocaleStrings.loadLocaleStrings, originalLoadLocaleStrings);
});
