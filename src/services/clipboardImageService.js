// Validates and writes image data to the OS clipboard. Electron dependencies are passed in so
// this logic stays independently testable without a running BrowserWindow or a real clipboard.
function imagePayloadToDataUrl({ base64, mimeType } = {}) {
  if (typeof base64 !== "string" || !base64 || typeof mimeType !== "string" || !mimeType.startsWith("image/")) {
    throw new TypeError("A valid image is required to copy to the clipboard.");
  }
  return `data:${mimeType};base64,${base64}`;
}

function isImageDataUrl(dataUrl) {
  return typeof dataUrl === "string" && dataUrl.startsWith("data:image/") && dataUrl.includes(";base64,");
}

function writeDataUrlToClipboard(dataUrl, { nativeImage, clipboard } = {}) {
  if (!isImageDataUrl(dataUrl)) {
    throw new TypeError("A valid image is required to copy to the clipboard.");
  }
  if (typeof nativeImage?.createFromDataURL !== "function" || typeof clipboard?.writeImage !== "function") {
    throw new TypeError("Clipboard image support is unavailable.");
  }

  const image = nativeImage.createFromDataURL(dataUrl);
  if (!image || typeof image.isEmpty !== "function" || image.isEmpty()) {
    throw new Error("The image could not be decoded for the clipboard.");
  }

  clipboard.writeImage(image);
  return true;
}

function writePayloadToClipboard(payload, electronDependencies) {
  return writeDataUrlToClipboard(imagePayloadToDataUrl(payload), electronDependencies);
}

function readImageFromClipboard({ clipboard } = {}) {
  if (typeof clipboard?.readImage !== "function") {
    throw new TypeError("Clipboard image support is unavailable.");
  }
  const image = clipboard.readImage();
  if (!image || typeof image.isEmpty !== "function" || image.isEmpty()) return null;
  if (typeof image.toPNG !== "function") {
    throw new TypeError("Clipboard image support is unavailable.");
  }
  const png = image.toPNG();
  if (!png || typeof png.toString !== "function" || png.length === 0) return null;
  return { base64: png.toString("base64"), mimeType: "image/png" };
}

module.exports = {
  imagePayloadToDataUrl,
  isImageDataUrl,
  writeDataUrlToClipboard,
  writePayloadToClipboard,
  readImageFromClipboard,
};
