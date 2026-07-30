// Preload script: the only bridge between the sandboxed renderer and the main process. Exposes
// a narrow, explicit API (`window.axion`) — the renderer never gets raw `ipcRenderer` or
// any Node.js API, which keeps a compromised/buggy renderer from reaching the filesystem or the
// Gemini API key directly.
const { contextBridge, ipcRenderer, webUtils } = require("electron");
const channels = require("../shared/ipcChannels");

contextBridge.exposeInMainWorld("axion", {
  // Files & dialogs
  // webUtils.getPathForFile is the current, non-deprecated way to resolve a dropped File's
  // absolute path under contextIsolation (replaces the old File.path property).
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openImageDialog: () => ipcRenderer.invoke(channels.DIALOG_OPEN_IMAGE),
  loadImage: (filePath) => ipcRenderer.invoke(channels.IMAGE_LOAD, filePath),
  saveImage: (payload) => ipcRenderer.invoke(channels.IMAGE_SAVE, payload),

  // Editing — stateless: payload always carries the source image explicitly (see
  // src/gemini/imageEditor.js), so there's no separate "new session" call to make.
  editImage: (payload) => ipcRenderer.invoke(channels.IMAGE_EDIT, payload),
  // Creating a brand-new image from a prompt alone (no source image) — see the "New" project
  // flow in ui/scripts/app.js, which shares its version-history logic with editImage.
  generateImage: (payload) => ipcRenderer.invoke(channels.IMAGE_GENERATE, payload),

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

  // Clipboard
  readClipboardText: () => ipcRenderer.invoke(channels.CLIPBOARD_READ_TEXT),

  // Voice commands — transcribes a recorded clip (see ui/scripts/services/speechService.js)
  // via Gemini, since the renderer's own webkitSpeechRecognition can't reach Google's speech
  // backend from Electron's Chromium (see ARCHITECTURE.md).
  transcribeAudio: (payload) => ipcRenderer.invoke(channels.VOICE_TRANSCRIBE, payload),

  // TEMP DEBUG — remove alongside src/debug/editDebugLogger.js. Fire-and-forget (.send, not
  // .invoke) so logging never blocks/awaits in the renderer.
  debugLog: (label, data) => ipcRenderer.send(channels.DEBUG_LOG, { label, data }),

  // Main -> renderer events
  onOpenSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.MENU_OPEN_SETTINGS, listener);
    return () => ipcRenderer.removeListener(channels.MENU_OPEN_SETTINGS, listener);
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
});
