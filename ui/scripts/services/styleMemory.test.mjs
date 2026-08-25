import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRecentStyleIds, rememberStyle, orderStylesByRecency } from "./styleMemory.mjs";

const validIds = ["photo", "oil", "anime", "comic", "dark"];

test("style memory rejects malformed, duplicate and unknown ids", () => {
  assert.deepEqual(normalizeRecentStyleIds(["oil", "unknown", "oil", null, "anime"], validIds), ["oil", "anime"]);
  assert.deepEqual(normalizeRecentStyleIds("oil", validIds), []);
});

test("style memory keeps the newest four unique styles", () => {
  let recent = [];
  for (const id of ["photo", "oil", "anime", "comic", "dark", "anime"]) {
    recent = rememberStyle(recent, id, validIds);
  }
  assert.deepEqual(recent, ["anime", "dark", "comic", "oil"]);
});

test("style ordering prioritizes recency and preserves the remaining library order", () => {
  const styles = validIds.map((id) => ({ id }));
  assert.deepEqual(orderStylesByRecency(styles, ["comic", "oil"]).map(({ id }) => id), ["comic", "oil", "photo", "anime", "dark"]);
  assert.deepEqual(styles.map(({ id }) => id), validIds);
});
