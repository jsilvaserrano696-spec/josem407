const test = require("node:test");
const assert = require("node:assert/strict");
const { MODEL_TIERS, DEFAULT_MODEL_TIER, resolveImageModel } = require("./imageModelPolicy");

test("economy is the safe default and uses Flash Lite at its supported 1K resolution", () => {
  assert.equal(DEFAULT_MODEL_TIER, "economy");
  assert.deepEqual(resolveImageModel(), {
    tier: "economy", id: "gemini-3.1-flash-lite-image", imageSize: "1K",
  });
});

test("balanced and pro resolve to explicit 4K models", () => {
  assert.deepEqual(resolveImageModel("balanced"), {
    tier: "balanced", id: "gemini-3.1-flash-image", imageSize: "4K",
  });
  assert.deepEqual(resolveImageModel("pro"), {
    tier: "pro", id: "gemini-3-pro-image", imageSize: "4K",
  });
});

test("unknown or inherited-looking tier values cannot select an arbitrary model", () => {
  assert.equal(resolveImageModel("unknown").tier, DEFAULT_MODEL_TIER);
  assert.equal(resolveImageModel("toString").tier, DEFAULT_MODEL_TIER);
  assert.equal(Object.isFrozen(MODEL_TIERS), true);
});
