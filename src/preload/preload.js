// Preload script: the only bridge between the sandboxed renderer and the main process. Exposes
// a narrow, explicit API (`window.nanoBanana`) — the renderer never gets raw `ipcRenderer` or
// any Node.js API, which keeps a compromised/buggy renderer from reaching the filesystem or the
// Gemini API key directly.
const { contextBridge, ipcRenderer, webUtils } = require("electron");
const channels = require("../shared/ipcChannels");

contextBridge.exposeInMainWorld("nanoBanana", {
  // Files & dialogs
  // webUtils.getPathForFile is the current, non-deprecated way to resolve a dropped File's
  // absolute path under contextIsolation (replaces the old File.path property).
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openImageDialog: () => ipcRenderer.invoke(channels.DIALOG_OPEN_IMAGE),
  loadImage: (filePath) => ipcRenderer.invoke(channels.IMAGE_LOAD, filePath),
  saveImage: (payload) => ipcRenderer.invoke(channels.IMAGE_SAVE, payload),

  // Editing
  editImage: (payload) => ipcRenderer.invoke(channels.IMAGE_EDIT, payload),
  startNewSession: (sessionId) => ipcRenderer.invoke(channels.IMAGE_NEW_SESSION, sessionId),

  // Prompt optimizer
  optimizePrompt: (payload) => ipcRenderer.invoke(channels.PROMPT_OPTIMIZE, payload),

  // Style library
  listStyles: () => ipcRenderer.invoke(channels.STYLES_LIST),

  // Prompt templates
  listTemplates: () => ipcRenderer.invoke(channels.TEMPLATES_LIST),

  // History
  listHistory: () => ipcRenderer.invoke(channels.HISTORY_LIST),
  deleteHistoryEntry: (id) => ipcRenderer.invoke(channels.HISTORY_DELETE, id),
  clearHistory: () => ipcRenderer.invoke(channels.HISTORY_CLEAR),
  toggleFavorite: (id) => ipcRenderer.invoke(channels.HISTORY_TOGGLE_FAVORITE, id),

  // Settings / config
  getConfig: () => ipcRenderer.invoke(channels.CONFIG_GET),
  setApiKey: (apiKey) => ipcRenderer.invoke(channels.CONFIG_SET_API_KEY, apiKey),
  setSettings: (partialSettings) => ipcRenderer.invoke(channels.CONFIG_SET_SETTINGS, partialSettings),

  // Main -> renderer events
  onOpenSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.MENU_OPEN_SETTINGS, listener);
    return () => ipcRenderer.removeListener(channels.MENU_OPEN_SETTINGS, listener);
  },
});
