// Single source of truth for which image file extensions the app accepts, their canonical
// MIME type, and whether Chromium's <img> decoder (and Gemini's inlineData) can consume them
// as-is or need conversion first. To support a new format end-to-end: add one entry here, and
// if nativelyRenderable is false, add a converter in converters/ (see converterRegistry.js).
// Nothing else in the app — dialogs, IPC handlers, the Gemini editor, the renderer — needs to
// change.
const path = require("node:path");

const FORMATS = {
  ".png": { mimeType: "image/png", nativelyRenderable: true },
  ".jpg": { mimeType: "image/jpeg", nativelyRenderable: true },
  ".jpeg": { mimeType: "image/jpeg", nativelyRenderable: true },
  ".webp": { mimeType: "image/webp", nativelyRenderable: true },
  ".heic": { mimeType: "image/heic", nativelyRenderable: false },
  ".heif": { mimeType: "image/heif", nativelyRenderable: false },
};

/**
 * Looks up format info for a file path by its extension. Returns null for unknown extensions.
 */
function getFormatInfo(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const entry = FORMATS[ext];
  return entry ? { ext, ...entry } : null;
}

/**
 * Extensions (without the leading dot) for native-dialog file filters — every format the app
 * knows about, renderable or not, since non-renderable ones still get converted transparently.
 */
function listSupportedExtensions() {
  return Object.keys(FORMATS).map((ext) => ext.slice(1));
}

module.exports = { getFormatInfo, listSupportedExtensions };
