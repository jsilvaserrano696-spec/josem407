// The single entry point for turning "a path on disk" into "bytes the rest of the app can
// treat uniformly": a displayable, Gemini-compatible image, regardless of whether the source
// file was already in a web-safe format or needed conversion first. Every caller that needs
// image bytes (the IPC image:load handler, the Gemini image editor) goes through here rather
// than reading files directly, so format support is defined in exactly one place and the
// renderer/Gemini call sites never branch on the original format.
const fs = require("node:fs/promises");
const path = require("node:path");
const formatRegistry = require("./formatRegistry");
const converterRegistry = require("./converterRegistry");
const { UnsupportedImageFormatError, ImageConversionError } = require("./errors");

/**
 * Reads an image file and returns it in a format guaranteed to be renderable in Chromium and
 * acceptable to the Gemini API — converting in memory first if the source format needs it.
 *
 * @returns {Promise<{ base64: string, mimeType: string, sourceFormat: string, wasConverted: boolean }>}
 */
async function importImage(filePath) {
  const formatInfo = formatRegistry.getFormatInfo(filePath);
  if (!formatInfo) {
    throw new UnsupportedImageFormatError(filePath, path.extname(filePath));
  }

  const rawBuffer = await fs.readFile(filePath);
  const sourceFormat = formatInfo.ext.slice(1);

  if (formatInfo.nativelyRenderable) {
    return {
      base64: rawBuffer.toString("base64"),
      mimeType: formatInfo.mimeType,
      sourceFormat,
      wasConverted: false,
    };
  }

  const converter = converterRegistry.findConverter(formatInfo.ext);
  if (!converter) {
    // Known format, but no converter registered for it yet — treat like unsupported rather
    // than silently handing an undecodable file to the renderer.
    throw new UnsupportedImageFormatError(filePath, formatInfo.ext);
  }

  let converted;
  try {
    converted = await converter.convertToDisplayable(rawBuffer);
  } catch (error) {
    throw new ImageConversionError(filePath, sourceFormat, error);
  }

  return {
    base64: converted.buffer.toString("base64"),
    mimeType: converted.mimeType,
    sourceFormat,
    wasConverted: true,
  };
}

module.exports = { importImage };
