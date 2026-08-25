import test from "node:test";
import assert from "node:assert/strict";
import { floodSelect, paintMaskCircle, compositeProtectedPixels } from "./maskSelection.mjs";

function pixels(colors) {
  return new Uint8ClampedArray(colors.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));
}

test("magic wand selects only connected pixels within color tolerance", () => {
  const rgba = pixels([
    [200, 0, 0], [205, 5, 5], [0, 0, 200],
    [198, 2, 2], [0, 0, 200], [202, 1, 1],
  ]);
  const mask = new Uint8Array(6);
  floodSelect({ pixels: rgba, width: 3, height: 2, x: 0, y: 0, tolerance: 10, mask });
  assert.deepEqual([...mask], [255, 255, 0, 255, 0, 0]);
});

test("magic wand erase removes a connected selection", () => {
  const rgba = pixels([[20, 20, 20], [20, 20, 20]]);
  const mask = new Uint8Array([255, 255]);
  floodSelect({ pixels: rgba, width: 2, height: 1, x: 0, y: 0, tolerance: 0, mask, erase: true });
  assert.deepEqual([...mask], [0, 0]);
});

test("selection tools report only pixels changed by one action", () => {
  const rgba = pixels([[10, 10, 10], [10, 10, 10], [200, 200, 200]]);
  const mask = new Uint8Array([255, 0, 0]);
  const changedIndices = [];
  floodSelect({ pixels: rgba, width: 3, height: 1, x: 0, y: 0, tolerance: 0, mask, changedIndices });
  assert.deepEqual(changedIndices, [1]);
  assert.deepEqual([...mask], [255, 255, 0]);
});

test("brush paints and erases a circular mask without leaving image bounds", () => {
  const mask = new Uint8Array(25);
  paintMaskCircle({ mask, width: 5, height: 5, x: 2, y: 2, radius: 1 });
  assert.equal(mask[2 * 5 + 2], 255);
  assert.equal(mask[0], 0);
  paintMaskCircle({ mask, width: 5, height: 5, x: 2, y: 2, radius: 1, erase: true });
  assert.equal(mask[2 * 5 + 2], 0);
});

test("protected composite preserves outside pixels and replaces selected pixels", () => {
  const original = pixels([[10, 20, 30], [40, 50, 60]]);
  const edited = pixels([[110, 120, 130], [140, 150, 160]]);
  const result = compositeProtectedPixels({ original, edited, mask: new Uint8Array([0, 255]) });
  assert.deepEqual([...result], [10, 20, 30, 255, 140, 150, 160, 255]);
});

test("protected composite supports feathered mask values", () => {
  const original = pixels([[0, 0, 0]]);
  const edited = pixels([[100, 100, 100]]);
  const result = compositeProtectedPixels({ original, edited, mask: new Uint8Array([128]) });
  assert.deepEqual([...result], [50, 50, 50, 255]);
});
