// Keeps the portable .axion file associated with each open window. The renderer receives
// project data but never an unrestricted filesystem write primitive: Ctrl+S can only update
// the path selected through a native dialog or supplied by Windows when opening the file.
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const pathsByWebContents = new Map();
const LINK_FILE = "current-project-path.txt";

function linkFilePath() {
  return path.join(app.getPath("userData"), LINK_FILE);
}

function persistPath(filePath) {
  fs.mkdirSync(path.dirname(linkFilePath()), { recursive: true });
  fs.writeFileSync(linkFilePath(), filePath, "utf-8");
}

function setProjectPath(webContents, filePath) {
  if (webContents?.id && typeof filePath === "string" && filePath) {
    pathsByWebContents.set(webContents.id, filePath);
    persistPath(filePath);
  }
}

function getProjectPath(webContents) {
  if (!webContents?.id) return null;
  const activePath = pathsByWebContents.get(webContents.id);
  if (activePath) return activePath;
  try {
    const restoredPath = fs.readFileSync(linkFilePath(), "utf-8").trim();
    if (!restoredPath || !fs.existsSync(restoredPath)) return null;
    pathsByWebContents.set(webContents.id, restoredPath);
    return restoredPath;
  } catch {
    return null;
  }
}

function clearProjectPath(webContents) {
  if (webContents?.id) pathsByWebContents.delete(webContents.id);
  try {
    if (fs.existsSync(linkFilePath())) fs.unlinkSync(linkFilePath());
  } catch {
    // Losing the convenience link must never block creation of a new project.
  }
}

module.exports = { setProjectPath, getProjectPath, clearProjectPath };
