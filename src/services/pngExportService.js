function ensurePngBuffer({ buffer, mimeType }, nativeImage) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new TypeError("A non-empty image buffer is required.");
  }

  const normalizedMimeType = typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
  if (normalizedMimeType === "image/png") return buffer;
  if (!normalizedMimeType.startsWith("image/")) {
    throw new TypeError("A valid image MIME type is required.");
  }
  if (!nativeImage || typeof nativeImage.createFromBuffer !== "function") {
    throw new Error("Native image conversion is unavailable.");
  }

  const decodedImage = nativeImage.createFromBuffer(buffer);
  if (!decodedImage || typeof decodedImage.isEmpty !== "function" || decodedImage.isEmpty()) {
    throw new Error("The image could not be decoded for PNG export.");
  }
  if (typeof decodedImage.toPNG !== "function") {
    throw new Error("PNG encoding is unavailable.");
  }

  const pngBuffer = decodedImage.toPNG();
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) {
    throw new Error("The image could not be encoded as PNG.");
  }
  return pngBuffer;
}

module.exports = { ensurePngBuffer };
