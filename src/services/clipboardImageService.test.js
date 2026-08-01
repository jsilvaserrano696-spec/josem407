const test = require("node:test");
const assert = require("node:assert/strict");
const service = require("./clipboardImageService");

function fakeElectron({ empty = false } = {}) {
  const calls = { decoded: [], written: [] };
  const decodedImage = { isEmpty: () => empty };
  return {
    calls,
    dependencies: {
      nativeImage: {
        createFromDataURL(dataUrl) {
          calls.decoded.push(dataUrl);
          return decodedImage;
        },
      },
      clipboard: {
        writeImage(image) {
          calls.written.push(image);
        },
      },
    },
    decodedImage,
  };
}

test("imagePayloadToDataUrl preserves MIME type and base64 exactly", () => {
  assert.equal(
    service.imagePayloadToDataUrl({ base64: "aGVsbG8=", mimeType: "image/png" }),
    "data:image/png;base64,aGVsbG8="
  );
});

test("imagePayloadToDataUrl rejects missing, empty, and non-image payloads", () => {
  assert.throws(() => service.imagePayloadToDataUrl(), TypeError);
  assert.throws(() => service.imagePayloadToDataUrl({ base64: "", mimeType: "image/png" }), TypeError);
  assert.throws(() => service.imagePayloadToDataUrl({ base64: "AAAA", mimeType: "text/plain" }), TypeError);
});

test("isImageDataUrl accepts image data URLs and rejects unrelated values", () => {
  assert.equal(service.isImageDataUrl("data:image/webp;base64,AAAA"), true);
  assert.equal(service.isImageDataUrl("data:text/plain;base64,AAAA"), false);
  assert.equal(service.isImageDataUrl("https://example.com/image.png"), false);
  assert.equal(service.isImageDataUrl(null), false);
});

test("writeDataUrlToClipboard decodes once and writes the same native image once", () => {
  const fake = fakeElectron();
  const dataUrl = "data:image/png;base64,AAAA";

  assert.equal(service.writeDataUrlToClipboard(dataUrl, fake.dependencies), true);
  assert.deepEqual(fake.calls.decoded, [dataUrl]);
  assert.deepEqual(fake.calls.written, [fake.decodedImage]);
});

test("writeDataUrlToClipboard never writes an image Electron cannot decode", () => {
  const fake = fakeElectron({ empty: true });

  assert.throws(() => service.writeDataUrlToClipboard("data:image/png;base64,broken", fake.dependencies));
  assert.equal(fake.calls.written.length, 0);
});

test("writeDataUrlToClipboard rejects invalid data before invoking Electron", () => {
  const fake = fakeElectron();

  assert.throws(() => service.writeDataUrlToClipboard("not-an-image", fake.dependencies), TypeError);
  assert.equal(fake.calls.decoded.length, 0);
  assert.equal(fake.calls.written.length, 0);
});

test("writeDataUrlToClipboard reports unavailable Electron dependencies", () => {
  assert.throws(() => service.writeDataUrlToClipboard("data:image/png;base64,AAAA", {}), TypeError);
});

test("writePayloadToClipboard covers the button's payload-to-clipboard flow", () => {
  const fake = fakeElectron();

  assert.equal(
    service.writePayloadToClipboard({ base64: "AAAA", mimeType: "image/jpeg" }, fake.dependencies),
    true
  );
  assert.deepEqual(fake.calls.decoded, ["data:image/jpeg;base64,AAAA"]);
  assert.equal(fake.calls.written.length, 1);
});

test("readImageFromClipboard returns clipboard pixels as a PNG payload", () => {
  const image = { isEmpty: () => false, toPNG: () => Buffer.from("pixels") };
  const result = service.readImageFromClipboard({ clipboard: { readImage: () => image } });
  assert.deepEqual(result, { base64: Buffer.from("pixels").toString("base64"), mimeType: "image/png" });
});

test("readImageFromClipboard returns null when the clipboard has no image", () => {
  const result = service.readImageFromClipboard({ clipboard: { readImage: () => ({ isEmpty: () => true }) } });
  assert.equal(result, null);
});

test("readImageFromClipboard rejects unavailable or malformed clipboard support", () => {
  assert.throws(() => service.readImageFromClipboard(), TypeError);
  assert.throws(
    () => service.readImageFromClipboard({ clipboard: { readImage: () => ({ isEmpty: () => false }) } }),
    TypeError
  );
});
