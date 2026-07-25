// Converts HEIC/HEIF buffers to PNG in memory using libheif, so the rest of the app only ever
// sees a format the OS-level image decoder (and Gemini's inlineData) already understands.
//
// Library choice: `heic-convert` wraps `libheif-js`, an Emscripten/WASM build of libheif. That
// means no native compilation and no per-platform prebuilt binaries — it runs unmodified on
// Windows, macOS and Linux, which matters here because this app is packaged per-platform with
// electron-builder and a native addon (e.g. sharp, which also can't read HEIC in its default
// prebuilt binaries) would need its own per-Electron-ABI rebuild step. Both `heic-convert` and
// `libheif-js` are still maintained (libheif-js tracks upstream libheif releases).
//
// Output format: PNG, not JPEG. HEIC's own HEVC compression already discarded some information;
// re-encoding to PNG (lossless) doesn't stack a second lossy generation on top of that the way
// a JPEG re-encode would, so this preserves as much of the original quality as the format
// conversion allows.
const convert = require("heic-convert");

const HANDLED_EXTENSIONS = new Set([".heic", ".heif"]);
const OUTPUT_MIME_TYPE = "image/png";

function canHandle(ext) {
  return HANDLED_EXTENSIONS.has(ext);
}

async function convertToDisplayable(buffer) {
  const outputBuffer = await convert({ buffer, format: "PNG" });
  return { buffer: Buffer.from(outputBuffer), mimeType: OUTPUT_MIME_TYPE };
}

module.exports = { id: "heic", canHandle, convertToDisplayable };
