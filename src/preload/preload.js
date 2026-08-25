// Preload script: the only bridge between the sandboxed renderer and the main process. Exposes
// a narrow, explicit API (`window.axion`) — the renderer never gets raw `ipcRenderer` or
// any Node.js API, which keeps a compromised/buggy renderer from reaching the filesystem or the
// Gemini API key directly.
const { contextBridge, ipcRenderer, webUtils } = require("electron");
const channels = require("../shared/ipcChannels");
const { normalizeIpcError } = require("../shared/ipcError");

async function invoke(channel, ...args) {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    throw normalizeIpcError(error);
  }
}

contextBridge.exposeInMainWorld("axion", {
  // Files & dialogs
  // webUtils.getPathForFile is the current, non-deprecated way to resolve a dropped File's
  // absolute path under contextIsolation (replaces the old File.path property).
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openImageDialog: () => invoke(channels.DIALOG_OPEN_IMAGE),
  loadImage: (filePath) => invoke(channels.IMAGE_LOAD, filePath),
  saveImage: (payload) => invoke(channels.IMAGE_SAVE, payload),
  copyImage: (payload) => invoke(channels.IMAGE_COPY, payload),
  showImageContextMenu: (dataUrl) => invoke(channels.IMAGE_CONTEXT_MENU, dataUrl),
  readClipboardImage: () => invoke(channels.IMAGE_READ_CLIPBOARD),

  // Editing — stateless: payload always carries the source image explicitly (see
  // src/gemini/imageEditor.js), so there's no separate "new session" call to make.
  editImage: (payload) => invoke(channels.IMAGE_EDIT, payload),
  // Creating a brand-new image from a prompt alone (no source image) — see the "New" project
  // flow in ui/scripts/app.js, which shares its version-history logic with editImage.
  generateImage: (payload) => invoke(channels.IMAGE_GENERATE, payload),

  // Prompt optimizer
  optimizePrompt: (payload) => invoke(channels.PROMPT_OPTIMIZE, payload),

  // Style library
  listStyles: () => invoke(channels.STYLES_LIST),

  // Prompt templates
  listTemplates: () => invoke(channels.TEMPLATES_LIST),
  saveTemplate: (template) => invoke(channels.TEMPLATES_SAVE, template),
  updateTemplate: (id, template) => invoke(channels.TEMPLATES_UPDATE, id, template),
  deleteTemplate: (id) => invoke(channels.TEMPLATES_DELETE, id),

  // History
  listHistory: () => invoke(channels.HISTORY_LIST),
  deleteHistoryEntry: (id) => invoke(channels.HISTORY_DELETE, id),
  clearHistory: () => invoke(channels.HISTORY_CLEAR),
  toggleFavorite: (id) => invoke(channels.HISTORY_TOGGLE_FAVORITE, id),

  // Active-project recovery
  loadProject: () => invoke(channels.PROJECT_LOAD),
  saveProject: (project) => invoke(channels.PROJECT_SAVE, project),
  clearProject: () => invoke(channels.PROJECT_CLEAR),
  openProjectFile: () => invoke(channels.PROJECT_OPEN_FILE),
  saveProjectFile: (payload) => invoke(channels.PROJECT_SAVE_FILE, payload),
  saveActiveProject: (payload) => invoke(channels.PROJECT_SAVE_ACTIVE, payload),
  detachProjectFile: () => invoke(channels.PROJECT_DETACH_FILE),

  // Settings / config
  getConfig: () => invoke(channels.CONFIG_GET),
  setApiKey: (apiKey) => invoke(channels.CONFIG_SET_API_KEY, apiKey),
  setSettings: (partialSettings) => invoke(channels.CONFIG_SET_SETTINGS, partialSettings),

  // Clipboard
  readClipboardText: () => invoke(channels.CLIPBOARD_READ_TEXT),

  // Voice commands — transcribes a recorded clip (see ui/scripts/services/speechService.js)
  // via Gemini, since the renderer's own webkitSpeechRecognition can't reach Google's speech
  // backend from Electron's Chromium (see ARCHITECTURE.md).
  transcribeAudio: (payload) => invoke(channels.VOICE_TRANSCRIBE, payload),

  // Fire-and-forget Developer Mode diagnostics never block the renderer.
  debugLog: (label, data) => ipcRenderer.send(channels.DEBUG_LOG, { label, data }),

  // Main -> renderer events
  onOpenSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.MENU_OPEN_SETTINGS, listener);
    return () => ipcRenderer.removeListener(channels.MENU_OPEN_SETTINGS, listener);
  },
  onOpenProjectDetails: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.MENU_OPEN_PROJECT_DETAILS, listener);
    return () => ipcRenderer.removeListener(channels.MENU_OPEN_PROJECT_DETAILS, listener);
  },
  onOpenProjectFile: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.MENU_OPEN_PROJECT_FILE, listener);
    return () => ipcRenderer.removeListener(channels.MENU_OPEN_PROJECT_FILE, listener);
  },
  onSaveProjectFile: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.MENU_SAVE_PROJECT_FILE, listener);
    return () => ipcRenderer.removeListener(channels.MENU_SAVE_PROJECT_FILE, listener);
  },
  onSaveProject: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.MENU_SAVE_PROJECT, listener);
    return () => ipcRenderer.removeListener(channels.MENU_SAVE_PROJECT, listener);
  },
  onOpenImage: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.MENU_OPEN_IMAGE, listener);
    return () => ipcRenderer.removeListener(channels.MENU_OPEN_IMAGE, listener);
  },
  onNewProject: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.MENU_NEW_PROJECT, listener);
    return () => ipcRenderer.removeListener(channels.MENU_NEW_PROJECT, listener);
  },
  onUndo: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.MENU_UNDO, listener);
    return () => ipcRenderer.removeListener(channels.MENU_UNDO, listener);
  },
  onRedo: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.MENU_REDO, listener);
    return () => ipcRenderer.removeListener(channels.MENU_REDO, listener);
  },
  onOpenProtectedSelection: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.MENU_OPEN_PROTECTED_SELECTION, listener);
    return () => ipcRenderer.removeListener(channels.MENU_OPEN_PROTECTED_SELECTION, listener);
  },
  onSetModelTier: (callback) => {
    const listener = (_event, tier) => callback(tier);
    ipcRenderer.on(channels.MENU_SET_MODEL_TIER, listener);
    return () => ipcRenderer.removeListener(channels.MENU_SET_MODEL_TIER, listener);
  },
  onExternalProject: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channels.PROJECT_OPEN_EXTERNAL, listener);
    return () => ipcRenderer.removeListener(channels.PROJECT_OPEN_EXTERNAL, listener);
  },
});
