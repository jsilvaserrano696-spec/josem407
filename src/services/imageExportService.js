const path = require("node:path");

const JPEG_QUALITY = 95;

function normalizedMimeType(mimeType) {
  return typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
}

function decodeImage(buffer, nativeImage) {
  if (!nativeImage || typeof nativeImage.createFromBuffer !== "function") {
    throw new Error("Native image conversion is unavailable.");
  }
  const decodedImage = nativeImage.createFromBuffer(buffer);
  if (!decodedImage || typeof decodedImage.isEmpty !== "function" || decodedImage.isEmpty()) {
    throw new Error("The image could not be decoded for export.");
  }
  return decodedImage;
}

function encodeImageForPath({ buffer, mimeType, filePath }, nativeImage) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new TypeError("A non-empty image buffer is required.");
  }
  const mime = normalizedMimeType(mimeType);
  if (!mime.startsWith("image/")) {
    throw new TypeError("A valid image MIME type is required.");
  }

  const extension = path.extname(filePath || "").toLowerCase();
  if (extension === ".png") {
    if (mime === "image/png") return buffer;
    const image = decodeImage(buffer, nativeImage);
    const output = typeof image.toPNG === "function" ? image.toPNG() : null;
    if (!Buffer.isBuffer(output) || output.length === 0) throw new Error("PNG encoding failed.");
    return output;
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    if (mime === "image/jpeg" || mime === "image/jpg") return buffer;
    const image = decodeImage(buffer, nativeImage);
    const output = typeof image.toJPEG === "function" ? image.toJPEG(JPEG_QUALITY) : null;
    if (!Buffer.isBuffer(output) || output.length === 0) throw new Error("JPEG encoding failed.");
    return output;
  }

  throw new Error("The selected file extension is not supported.");
}

module.exports = { JPEG_QUALITY, encodeImageForPath };
