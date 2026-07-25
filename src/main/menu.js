// Native application menu. Kept intentionally small: the app's real controls live in the
// in-window UI, this just covers OS-level conventions (Edit shortcuts, DevTools, About, Quit)
// and a "Settings" item that tells the renderer to open its Settings modal.
const { Menu, app, shell } = require("electron");
const channels = require("../shared/ipcChannels");

function buildAppMenu(browserWindow) {
  const isMac = process.platform === "darwin";

  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Settings…",
          accelerator: "CmdOrCtrl+,",
          click: () => browserWindow.webContents.send(channels.MENU_OPEN_SETTINGS),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Gemini API Documentation",
          click: () => shell.openExternal("https://ai.google.dev/gemini-api/docs"),
        },
        {
          label: `About ${app.getName()}`,
          click: () => browserWindow.webContents.send(channels.MENU_OPEN_SETTINGS),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildAppMenu };
