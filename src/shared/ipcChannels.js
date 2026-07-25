// Single source of truth for IPC channel names, imported by main, preload and (indirectly,
// through preload's exposed API) the renderer. Keeping names here avoids typo mismatches
// between ipcMain.handle() and ipcRenderer.invoke() calls.
module.exports = {
  DIALOG_OPEN_IMAGE: "dialog:open-image",
  DIALOG_SAVE_IMAGE: "dialog:save-image",

  IMAGE_LOAD: "image:load",
  IMAGE_EDIT: "image:edit",
  IMAGE_SAVE: "image:save",
  IMAGE_NEW_SESSION: "image:new-session",

  PROMPT_OPTIMIZE: "prompt:optimize",

  STYLES_LIST: "styles:list",

  HISTORY_LIST: "history:list",
  HISTORY_ADD: "history:add",
  HISTORY_DELETE: "history:delete",
  HISTORY_CLEAR: "history:clear",
  HISTORY_TOGGLE_FAVORITE: "history:toggle-favorite",

  TEMPLATES_LIST: "templates:list",

  CONFIG_GET: "config:get",
  CONFIG_SET_API_KEY: "config:set-api-key",
  CONFIG_SET_SETTINGS: "config:set-settings",

  // Main -> renderer push events (sent via webContents.send, not invoke/handle).
  MENU_OPEN_SETTINGS: "menu:open-settings",
};
