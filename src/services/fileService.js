// Filesystem and native-dialog access for images. Reading and interpreting image bytes into a
// displayable format lives in src/services/imageImport/ (imageImportService.js) — this module
// stays focused on raw writes and native dialogs.
const fs = require("node:fs/promises");
const path = require("node:path");
const { dialog } = require("electron");
const { listSupportedExtensions } = require("./imageImport/formatRegistry");

async function writeImageFile(filePath, buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

async function showOpenImageDialog(browserWindow) {
  const result = await dialog.showOpenDialog(browserWindow, {
    title: "Select an image",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: listSupportedExtensions() }],
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
    filters: [
      { name: "PNG Image (maximum quality)", extensions: ["png"] },
      { name: "JPEG Image (smaller file)", extensions: ["jpg", "jpeg"] },
    ],
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  return result.filePath;
}

module.exports = {
  writeImageFile,
  showOpenImageDialog,
  showSaveImageDialog,
};
