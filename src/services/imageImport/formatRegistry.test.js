const test = require("node:test");
const assert = require("node:assert/strict");
const { getFormatInfo, listSupportedExtensions } = require("./formatRegistry");
const { findConverter } = require("./converterRegistry");

test("format lookup is case-insensitive and returns canonical MIME metadata", () => {
  assert.deepEqual(getFormatInfo("C:/images/photo.JPEG"), {
    ext: ".jpeg",
    mimeType: "image/jpeg",
    nativelyRenderable: true,
  });
  assert.deepEqual(getFormatInfo("C:/images/photo.HEIC"), {
    ext: ".heic",
    mimeType: "image/heic",
    nativelyRenderable: false,
  });
  assert.equal(getFormatInfo("C:/images/photo.tiff"), null);
});

test("native dialog extensions come from the same complete format registry", () => {
  assert.deepEqual(listSupportedExtensions(), ["png", "jpg", "jpeg", "webp", "heic", "heif"]);
});

test("HEIC and HEIF resolve to the converter while native formats do not", () => {
  assert.equal(findConverter(".heic")?.id, "heic");
  assert.equal(findConverter(".heif")?.id, "heic");
  assert.equal(findConverter(".png"), null);
});
