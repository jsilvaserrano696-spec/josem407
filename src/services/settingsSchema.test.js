const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_SETTINGS, normalizeSettings, normalizeRecentStyleIds, normalizeWorkProfiles } = require("./settingsSchema");

test("settings schema returns independent defaults for malformed input", () => {
  const first = normalizeSettings(null);
  const second = normalizeSettings("bad");
  assert.deepEqual(first, DEFAULT_SETTINGS);
  assert.deepEqual(second, DEFAULT_SETTINGS);
  assert.notStrictEqual(first.recentStyleIds, second.recentStyleIds);
});

test("settings schema accepts only known fields and valid value types", () => {
  assert.deepEqual(normalizeSettings({
    conversationModeDefault: false,
    language: "es",
    developerMode: true,
    recentStyleIds: ["comic", "anime"],
    defaultStyleId: "cinematic",
    workProfiles: [{ id: "studio", name: "Studio", defaultStyleId: "photorealistic", conversationModeDefault: false }],
    modelTier: "pro",
    injected: "discarded",
  }), {
    conversationModeDefault: false,
    language: "es",
    developerMode: true,
    recentStyleIds: ["comic", "anime"],
    defaultStyleId: "cinematic",
    workProfiles: [{ id: "studio", name: "Studio", defaultStyleId: "photorealistic", conversationModeDefault: false, modelTier: "economy" }],
    modelTier: "pro",
  });
});

test("work profiles are bounded, trimmed and restricted to safe fields", () => {
  const profiles = normalizeWorkProfiles([
    { id: " one ", name: "  Product studio  ", defaultStyleId: "cinematic", conversationModeDefault: false, secret: "discard" },
    { id: "one", name: "Duplicate" },
    { id: "two", name: "Unknown style", defaultStyleId: "unknown" },
    null,
  ]);
  assert.deepEqual(profiles, [
    { id: "one", name: "Product studio", defaultStyleId: "cinematic", conversationModeDefault: false, modelTier: "economy" },
    { id: "two", name: "Unknown style", defaultStyleId: null, conversationModeDefault: true, modelTier: "economy" },
  ]);
});

test("settings schema removes unknown and duplicate recent styles and caps the list", () => {
  assert.deepEqual(
    normalizeRecentStyleIds(["comic", "unknown", "comic", "anime", "dark", "metal", "vintage"]),
    ["comic", "anime", "dark", "metal"]
  );
});

test("settings schema rejects unsupported languages, styles and truthy non-booleans", () => {
  const result = normalizeSettings({ language: "fr", defaultStyleId: "unknown", developerMode: "yes", conversationModeDefault: 0 });
  assert.deepEqual(result, { ...DEFAULT_SETTINGS, recentStyleIds: [] });
});
