// Filesystem and native-dialog access for images. Kept separate from the Gemini modules so
// "how we read/write files" can change (e.g. temp-file handling for batch editing later)
// without touching API call logic.
const fs = require("node:fs/promises");
const path = require("node:path");
const { dialog } = require("electron");

const MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

const OPEN_DIALOG_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "heic", "heif"];

function mimeTypeForExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    throw new Error(
      `Unsupported image extension "${ext}". Supported: ${Object.keys(MIME_TYPES).join(", ")}`
    );
  }
  return mimeType;
}

async function readImageFile(filePath) {
  const mimeType = mimeTypeForExtension(filePath);
  const data = await fs.readFile(filePath);
  return { data, mimeType, base64: data.toString("base64") };
}

async function writeImageFile(filePath, buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

async function showOpenImageDialog(browserWindow) {
  const result = await dialog.showOpenDialog(browserWindow, {
    title: "Select an image",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: OPEN_DIALOG_EXTENSIONS }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
}

async function showSaveImageDialog(browserWindow, suggestedName = "edited-image.png") {
  const result = await dialog.showSaveDialog(browserWindow, {
    title: "Save edited image",
    defaultPath: suggestedName,
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  return result.filePath;
}

module.exports = {
  mimeTypeForExtension,
  readImageFile,
  writeImageFile,
  showOpenImageDialog,
  showSaveImageDialog,
};
