const test = require("node:test");
const assert = require("node:assert/strict");

const { JPEG_QUALITY, encodeImageForPath } = require("./imageExportService");

test("matching PNG payloads are preserved without recompression", () => {
  const png = Buffer.from("png");
  const nativeImage = { createFromBuffer: () => { throw new Error("must not decode"); } };
  assert.strictEqual(encodeImageForPath({ buffer: png, mimeType: "image/png", filePath: "x.png" }, nativeImage), png);
});

test("JPEG input selected as PNG is converted to real PNG bytes", () => {
  const output = Buffer.from("png-output");
  const nativeImage = { createFromBuffer: () => ({ isEmpty: () => false, toPNG: () => output }) };
  assert.strictEqual(encodeImageForPath({ buffer: Buffer.from("jpeg"), mimeType: "image/jpeg", filePath: "x.PNG" }, nativeImage), output);
});

test("JPEG export is always compressed for a smaller sharing copy", () => {
  const output = Buffer.from("jpeg-output");
  let quality;
  const nativeImage = {
    createFromBuffer: () => ({
      isEmpty: () => false,
      toJPEG(value) { quality = value; return output; },
    }),
  };
  assert.strictEqual(encodeImageForPath({ buffer: Buffer.from("jpeg"), mimeType: "image/jpeg", filePath: "x.jpg" }, nativeImage), output);
  assert.equal(quality, JPEG_QUALITY);
  assert.equal(JPEG_QUALITY, 88);
});

test("invalid payloads and unsupported extensions are rejected", () => {
  assert.throws(() => encodeImageForPath({ buffer: Buffer.alloc(0), mimeType: "image/png", filePath: "x.png" }, {}));
  assert.throws(() => encodeImageForPath({ buffer: Buffer.from("x"), mimeType: "text/plain", filePath: "x.png" }, {}));
  assert.throws(() => encodeImageForPath({ buffer: Buffer.from("x"), mimeType: "image/png", filePath: "x.webp" }, {}));
});
