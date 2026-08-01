// Single source of truth for IPC channel names, imported by main, preload and (indirectly,
// through preload's exposed API) the renderer. Keeping names here avoids typo mismatches
// between ipcMain.handle() and ipcRenderer.invoke() calls.
module.exports = {
  DIALOG_OPEN_IMAGE: "dialog:open-image",
  DIALOG_SAVE_IMAGE: "dialog:save-image",

  IMAGE_LOAD: "image:load",
  IMAGE_EDIT: "image:edit",
  IMAGE_GENERATE: "image:generate",
  IMAGE_SAVE: "image:save",
  IMAGE_COPY: "image:copy",
  IMAGE_CONTEXT_MENU: "image:context-menu",
  IMAGE_READ_CLIPBOARD: "image:read-clipboard",

  PROMPT_OPTIMIZE: "prompt:optimize",

  STYLES_LIST: "styles:list",

  HISTORY_LIST: "history:list",
  HISTORY_ADD: "history:add",
  HISTORY_DELETE: "history:delete",
  HISTORY_CLEAR: "history:clear",
  HISTORY_TOGGLE_FAVORITE: "history:toggle-favorite",

  PROJECT_LOAD: "project:load",
  PROJECT_SAVE: "project:save",
  PROJECT_CLEAR: "project:clear",

  TEMPLATES_LIST: "templates:list",

  CONFIG_GET: "config:get",
  CONFIG_SET_API_KEY: "config:set-api-key",
  CONFIG_SET_SETTINGS: "config:set-settings",

  CLIPBOARD_READ_TEXT: "clipboard:read-text",

  VOICE_TRANSCRIBE: "voice:transcribe",

  // TEMP DEBUG — remove alongside src/debug/editDebugLogger.js.
  DEBUG_LOG: "debug:log",

  // Main -> renderer push events (sent via webContents.send, not invoke/handle).
  MENU_OPEN_SETTINGS: "menu:open-settings",
  MENU_OPEN_IMAGE: "menu:open-image",
  MENU_NEW_PROJECT: "menu:new-project",
  MENU_UNDO: "menu:undo",
  MENU_REDO: "menu:redo",
};
