// Registry of format converters, tried in order. This is the extension point: to support a
// future non-natively-renderable format (AVIF, TIFF, RAW/DNG, ...), write one module with the
// same { canHandle(ext), convertToDisplayable(buffer) } shape as converters/heicConverter.js
// and add it to this list. imageImportService.js and every one of its callers (the IPC
// image:load handler, the Gemini image editor) needs zero changes.
const heicConverter = require("./converters/heicConverter");

const converters = [heicConverter];

function findConverter(ext) {
  return converters.find((converter) => converter.canHandle(ext)) ?? null;
}

module.exports = { findConverter };
