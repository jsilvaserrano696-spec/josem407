// Typed errors for the image import pipeline. Both are plain Error subclasses (not
// Electron-aware), so their .message reaches the renderer unchanged as an IPC rejection —
// ui/scripts/components/dropzone.js already surfaces error.message to the status bar, so no
// UI-side changes are needed to display these.
const path = require("node:path");

class UnsupportedImageFormatError extends Error {
  constructor(filePath, ext) {
    super(
      `Unsupported image format "${ext || "(none)"}" for "${path.basename(filePath)}". ` +
        `Supported formats: PNG, JPG/JPEG, WebP, HEIC, HEIF.`
    );
    this.name = "UnsupportedImageFormatError";
  }
}

class ImageConversionError extends Error {
  constructor(filePath, sourceFormat, cause) {
    super(
      `Could not convert "${path.basename(filePath)}" (${sourceFormat.toUpperCase()}) to a ` +
        `displayable image${cause?.message ? `: ${cause.message}.` : "."} ` +
        `The file may be corrupted or use an unsupported ${sourceFormat.toUpperCase()} variant.`
    );
    this.name = "ImageConversionError";
    this.cause = cause;
  }
}

module.exports = { UnsupportedImageFormatError, ImageConversionError };
