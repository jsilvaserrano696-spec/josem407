const test = require("node:test");
const assert = require("node:assert/strict");

const { ensurePngBuffer } = require("./pngExportService");

test("PNG input is written unchanged without decoding", () => {
  const input = Buffer.from("png-bytes");
  const nativeImage = { createFromBuffer: () => { throw new Error("must not be called"); } };
  assert.strictEqual(ensurePngBuffer({ buffer: input, mimeType: "image/png" }, nativeImage), input);
});

test("JPEG input is decoded and encoded as a real PNG", () => {
  const input = Buffer.from("jpeg-bytes");
  const output = Buffer.from("real-png-bytes");
  let capturedBuffer;
  const nativeImage = {
    createFromBuffer(buffer) {
      capturedBuffer = buffer;
      return { isEmpty: () => false, toPNG: () => output };
    },
  };

  assert.strictEqual(ensurePngBuffer({ buffer: input, mimeType: "image/jpeg" }, nativeImage), output);
  assert.strictEqual(capturedBuffer, input);
});

test("invalid and undecodable payloads are rejected", () => {
  assert.throws(() => ensurePngBuffer({ buffer: Buffer.alloc(0), mimeType: "image/jpeg" }, {}));
  assert.throws(() => ensurePngBuffer({ buffer: Buffer.from("x"), mimeType: "text/plain" }, {}));
  assert.throws(() => ensurePngBuffer(
    { buffer: Buffer.from("x"), mimeType: "image/jpeg" },
    { createFromBuffer: () => ({ isEmpty: () => true }) },
  ));
});

test("MIME type comparison is case- and whitespace-insensitive", () => {
  const input = Buffer.from("png-bytes");
  assert.strictEqual(ensurePngBuffer({ buffer: input, mimeType: " IMAGE/PNG " }, null), input);
});
