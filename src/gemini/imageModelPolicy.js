const MODEL_TIERS = Object.freeze({
  economy: Object.freeze({ id: "gemini-3.1-flash-lite-image", imageSize: "1K" }),
  balanced: Object.freeze({ id: "gemini-3.1-flash-image", imageSize: "4K" }),
  pro: Object.freeze({ id: "gemini-3-pro-image", imageSize: "4K" }),
});

const DEFAULT_MODEL_TIER = "economy";

function resolveImageModel(tier) {
  const resolvedTier = Object.hasOwn(MODEL_TIERS, tier) ? tier : DEFAULT_MODEL_TIER;
  return { tier: resolvedTier, ...MODEL_TIERS[resolvedTier] };
}

module.exports = { MODEL_TIERS, DEFAULT_MODEL_TIER, resolveImageModel };
