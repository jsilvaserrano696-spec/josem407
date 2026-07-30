// Typed errors for the image import pipeline. Both are plain Error subclasses (not
// Electron-aware), so their .message reaches the renderer unchanged as an IPC rejection —
// ui/scripts/components/dropzone.js already surfaces error.message to the status bar. The
// message itself is a short, generic, localized string (see DESIGN_PHILOSOPHY.md) — the real
// technical detail (file name, format, underlying cause) is only ever logged for developer mode.
const path = require("node:path");
const configStore = require("../configStore");
const { loadLocaleStrings } = require("../../shared/localeStrings");
const editDebugLogger = require("../../debug/editDebugLogger");

function currentStrings() {
  return loadLocaleStrings(configStore.getSettings().language || "es");
}

class UnsupportedImageFormatError extends Error {
  constructor(filePath, ext) {
    super(currentStrings()["error.unsupportedFormat"]);
    this.name = "UnsupportedImageFormatError";
    editDebugLogger.log("Unsupported image format (developer mode detail)", {
      file: path.basename(filePath),
      ext: ext || "(none)",
    });
  }
}

class ImageConversionError extends Error {
  constructor(filePath, sourceFormat, cause) {
    super(currentStrings()["error.corruptImage"]);
    this.name = "ImageConversionError";
    this.cause = cause;
    editDebugLogger.log("Image conversion failed (developer mode detail)", {
      file: path.basename(filePath),
      sourceFormat,
      cause: cause?.message ?? null,
    });
  }
}

module.exports = { UnsupportedImageFormatError, ImageConversionError };
