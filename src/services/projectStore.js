// Persists the active AXION project (images + undo/redo cursor) in userData so closing the app
// never discards the current session. Only the current project is stored; prompt history remains
// the separate lightweight archive owned by historyStore.js.
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const PROJECT_FILE_NAME = "current-project.json";
const SCHEMA_VERSION = 1;
const MAX_VERSIONS = 100;

function normalizeVersion(version, index) {
  if (!version || typeof version !== "object") return null;
  const { image } = version;
  if (
    !image ||
    typeof image !== "object" ||
    typeof image.base64 !== "string" ||
    !image.base64 ||
    typeof image.mimeType !== "string" ||
    !image.mimeType.startsWith("image/")
  ) {
    return null;
  }
  if (version.prompt !== null && typeof version.prompt !== "string") return null;
  if (version.styleId !== null && typeof version.styleId !== "string") return null;

  return {
    id: typeof version.id === "string" && version.id ? version.id : `restored-${index}`,
    versionNumber: index,
    prompt: version.prompt,
    styleId: version.styleId,
    timestamp: Number.isFinite(version.timestamp) ? version.timestamp : 0,
    image: { base64: image.base64, mimeType: image.mimeType },
  };
}

function normalizeOptionalImage(image) {
  if (image === null || image === undefined) return null;
  if (
    typeof image !== "object" ||
    typeof image.base64 !== "string" ||
    !image.base64 ||
    typeof image.mimeType !== "string" ||
    !image.mimeType.startsWith("image/")
  ) return null;
  return { base64: image.base64, mimeType: image.mimeType };
}

function normalizeProject(project) {
  if (!project || typeof project !== "object" || project.schemaVersion !== SCHEMA_VERSION) return null;
  if (!Array.isArray(project.versionHistory) || project.versionHistory.length === 0) return null;
  if (project.versionHistory.length > MAX_VERSIONS) return null;

  const versionHistory = project.versionHistory.map(normalizeVersion);
  if (versionHistory.some((version) => !version)) return null;
  if (!Number.isInteger(project.versionCursor) || project.versionCursor < 0 || project.versionCursor >= versionHistory.length) {
    return null;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    versionHistory,
    versionCursor: project.versionCursor,
    selectedStyleId: typeof project.selectedStyleId === "string" ? project.selectedStyleId : null,
    referenceImage: normalizeOptionalImage(project.referenceImage),
    conversationMode: project.conversationMode !== false,
    // Older project files did not distinguish the active editor text from the prompt stored
    // on an image version. Preserve their previous restore behavior as a migration fallback.
    activePrompt:
      typeof project.activePrompt === "string"
        ? project.activePrompt
        : versionHistory[project.versionCursor].prompt ?? "",
  };
}

function createProjectStore({ fileSystem = fs, filePath }) {
  function loadProject() {
    if (!fileSystem.existsSync(filePath)) return null;
    try {
      return normalizeProject(JSON.parse(fileSystem.readFileSync(filePath, "utf-8")));
    } catch (error) {
      console.warn(`Failed to restore current project: ${error.message}`);
      return null;
    }
  }

  function saveProject(project) {
    const normalized = normalizeProject({ ...project, schemaVersion: SCHEMA_VERSION });
    if (!normalized) throw new TypeError("The active project is not valid.");
    fileSystem.mkdirSync(path.dirname(filePath), { recursive: true });
    fileSystem.writeFileSync(filePath, JSON.stringify(normalized), "utf-8");
    return true;
  }

  function clearProject() {
    if (fileSystem.existsSync(filePath)) fileSystem.unlinkSync(filePath);
    return true;
  }

  return { loadProject, saveProject, clearProject };
}

function currentStore() {
  return createProjectStore({ filePath: path.join(app.getPath("userData"), PROJECT_FILE_NAME) });
}

module.exports = {
  SCHEMA_VERSION,
  MAX_VERSIONS,
  normalizeProject,
  createProjectStore,
  loadProject: () => currentStore().loadProject(),
  saveProject: (project) => currentStore().saveProject(project),
  clearProject: () => currentStore().clearProject(),
};
