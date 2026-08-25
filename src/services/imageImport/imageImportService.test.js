const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { importImage } = require("./imageImportService");

test("native image import preserves bytes and reports canonical metadata", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axion-image-import-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "sample.PNG");
  const bytes = Buffer.from([0, 1, 2, 127, 128, 255]);
  fs.writeFileSync(filePath, bytes);

  const result = await importImage(filePath);

  assert.deepEqual(result, {
    base64: bytes.toString("base64"),
    mimeType: "image/png",
    sourceFormat: "png",
    wasConverted: false,
  });
});
