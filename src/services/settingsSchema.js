const { listStyles } = require("../styles/styleLibrary");
const { MODEL_TIERS, DEFAULT_MODEL_TIER } = require("../gemini/imageModelPolicy");

const SUPPORTED_LANGUAGES = new Set(["en", "es"]);
const VALID_STYLE_IDS = new Set(listStyles().map(({ id }) => id));
const MAX_RECENT_STYLES = 4;
const MAX_WORK_PROFILES = 20;

const DEFAULT_SETTINGS = Object.freeze({
  conversationModeDefault: true,
  language: null,
  developerMode: false,
  recentStyleIds: Object.freeze([]),
  defaultStyleId: null,
  workProfiles: Object.freeze([]),
  modelTier: DEFAULT_MODEL_TIER,
});

function normalizeRecentStyleIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter((id) => {
    if (typeof id !== "string" || !VALID_STYLE_IDS.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, MAX_RECENT_STYLES);
}

function normalizeSettings(value) {
  const settings = value && typeof value === "object" ? value : {};
  return {
    conversationModeDefault:
      typeof settings.conversationModeDefault === "boolean"
        ? settings.conversationModeDefault
        : DEFAULT_SETTINGS.conversationModeDefault,
    language: SUPPORTED_LANGUAGES.has(settings.language) ? settings.language : null,
    developerMode: settings.developerMode === true,
    recentStyleIds: normalizeRecentStyleIds(settings.recentStyleIds),
    defaultStyleId: VALID_STYLE_IDS.has(settings.defaultStyleId) ? settings.defaultStyleId : null,
    workProfiles: normalizeWorkProfiles(settings.workProfiles),
    modelTier: Object.hasOwn(MODEL_TIERS, settings.modelTier) ? settings.modelTier : DEFAULT_MODEL_TIER,
  };
}

function normalizeWorkProfiles(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const profiles = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const id = typeof candidate.id === "string" ? candidate.id.trim().slice(0, 80) : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, 60) : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    profiles.push({
      id,
      name,
      defaultStyleId: VALID_STYLE_IDS.has(candidate.defaultStyleId) ? candidate.defaultStyleId : null,
      conversationModeDefault: candidate.conversationModeDefault !== false,
      modelTier: Object.hasOwn(MODEL_TIERS, candidate.modelTier) ? candidate.modelTier : DEFAULT_MODEL_TIER,
    });
    if (profiles.length === MAX_WORK_PROFILES) break;
  }
  return profiles;
}

module.exports = { DEFAULT_SETTINGS, normalizeSettings, normalizeRecentStyleIds, normalizeWorkProfiles };
