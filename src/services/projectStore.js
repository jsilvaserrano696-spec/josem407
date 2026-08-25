// Persists the active AXION project (images + undo/redo cursor) in userData so closing the app
// never discards the current session. Only the current project is stored; prompt history remains
// the separate lightweight archive owned by historyStore.js.
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const { MODEL_TIERS } = require("../gemini/imageModelPolicy");

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

  const normalized = {
    id: typeof version.id === "string" && version.id ? version.id : `restored-${index}`,
    versionNumber: index,
    prompt: version.prompt,
    styleId: version.styleId,
    timestamp: Number.isFinite(version.timestamp) ? version.timestamp : 0,
    image: { base64: image.base64, mimeType: image.mimeType },
  };
  if (typeof version.explanation === "string" && version.explanation.trim()) {
    normalized.explanation = version.explanation.trim().slice(0, 600);
  }
  if (typeof version.modelId === "string" && version.modelId.trim()) {
    normalized.modelId = version.modelId.trim().slice(0, 120);
  }
  if (Object.hasOwn(MODEL_TIERS, version.modelTier)) normalized.modelTier = version.modelTier;
  return normalized;
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
    projectName: typeof project.projectName === "string" ? project.projectName.slice(0, 120) : "",
    projectReference: typeof project.projectReference === "string" ? project.projectReference.slice(0, 80) : "",
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
  const temporaryPath = `${filePath}.tmp`;

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
    try {
      // Write the complete next state beside the live file, then replace it in one filesystem
      // operation. A crash can leave a disposable .tmp file, but never half a current project.
      fileSystem.writeFileSync(temporaryPath, JSON.stringify(normalized), "utf-8");
      fileSystem.renameSync(temporaryPath, filePath);
      return true;
    } catch (error) {
      try {
        if (fileSystem.existsSync(temporaryPath)) fileSystem.unlinkSync(temporaryPath);
      } catch {
        // Cleanup is best-effort; preserving the original write error is more useful.
      }
      throw error;
    }
  }

  function clearProject() {
    if (fileSystem.existsSync(filePath)) fileSystem.unlinkSync(filePath);
    if (fileSystem.existsSync(temporaryPath)) fileSystem.unlinkSync(temporaryPath);
    return true;
  }

  return { loadProject, saveProject, clearProject };
}

function currentStore() {
  return createProjectStore({ filePath: path.join(app.getPath("userData"), PROJECT_FILE_NAME) });
}

function loadProjectFile(filePath) {
  return createProjectStore({ filePath }).loadProject();
}

function saveProjectFile(filePath, project) {
  return createProjectStore({ filePath }).saveProject(project);
}

module.exports = {
  SCHEMA_VERSION,
  MAX_VERSIONS,
  normalizeProject,
  createProjectStore,
  loadProject: () => currentStore().loadProject(),
  saveProject: (project) => currentStore().saveProject(project),
  clearProject: () => currentStore().clearProject(),
  loadProjectFile,
  saveProjectFile,
};
