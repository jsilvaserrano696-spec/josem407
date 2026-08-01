// Native application menu. Kept intentionally small: the app's real controls live in the
// in-window UI, this just covers OS-level conventions (Edit shortcuts, About, Quit) and a
// "Settings" item that tells the renderer to open its Settings modal. Developer Tools are only
// ever added to this menu when developerMode is on (see src/main/main.js's hidden shortcut) —
// per DESIGN_PHILOSOPHY.md, nothing that exposes internals is reachable by accident.
const { Menu, app, dialog } = require("electron");
const channels = require("../shared/ipcChannels");
const { loadLocaleStrings: loadMenuStrings } = require("../shared/localeStrings");

function buildAppMenu(browserWindow, locale = "es", developerMode = false) {
  const isMac = process.platform === "darwin";
  const strings = loadMenuStrings(locale);

  const template = [
    {
      label: strings["menu.file"],
      submenu: [
        {
          label: strings["menu.newProject"],
          accelerator: "CmdOrCtrl+N",
          click: () => browserWindow.webContents.send(channels.MENU_NEW_PROJECT),
        },
        {
          label: strings["menu.openImage"],
          accelerator: "CmdOrCtrl+O",
          click: () => browserWindow.webContents.send(channels.MENU_OPEN_IMAGE),
        },
        { type: "separator" },
        {
          label: strings["menu.settings"],
          accelerator: "CmdOrCtrl+,",
          registerAccelerator: false,
          click: () => browserWindow.webContents.send(channels.MENU_OPEN_SETTINGS),
        },
        { type: "separator" },
        // `role` still drives the actual close/quit behavior — `label` only overrides the
        // displayed text, which Electron does NOT auto-translate based on the app's own chosen
        // language (only the OS display language, which this app doesn't control/mirror).
        isMac ? { role: "close", label: strings["menu.close"] } : { role: "quit", label: strings["menu.quit"] },
      ],
    },
    {
      label: strings["menu.edit"],
      submenu: [
        // Deliberately NOT `role: "undo"/"redo"` — that's Chromium's generic text-field undo,
        // which shares this exact label with AXION's own image version history and was getting
        // confused for it (Ctrl+Z while the prompt box had focus silently undid a keystroke
        // there instead of the last image edit). Ctrl+Z/Ctrl+Shift+Z now always mean "undo/redo
        // the image", app-wide, like any professional image editor — see
        // ui/scripts/app.js's handleUndoClick()/handleRedoClick().
        {
          label: strings["menu.undo"],
          accelerator: "CmdOrCtrl+Z",
          registerAccelerator: false,
          click: () => browserWindow.webContents.send(channels.MENU_UNDO),
        },
        {
          label: strings["menu.redo"],
          accelerator: "CmdOrCtrl+Shift+Z",
          registerAccelerator: false,
          click: () => browserWindow.webContents.send(channels.MENU_REDO),
        },
        { type: "separator" },
        { role: "cut", label: strings["menu.cut"] },
        { role: "copy", label: strings["menu.copy"] },
        { role: "paste", label: strings["menu.paste"], registerAccelerator: false },
        { role: "selectAll", label: strings["menu.selectAll"] },
      ],
    },
    {
      label: strings["menu.view"],
      submenu: [
        { role: "reload", label: strings["menu.reload"] },
        ...(developerMode ? [{ role: "toggleDevTools", label: strings["menu.toggleDevTools"] }] : []),
        { type: "separator" },
        { role: "resetZoom", label: strings["menu.resetZoom"] },
        { role: "zoomIn", label: strings["menu.zoomIn"] },
        { role: "zoomOut", label: strings["menu.zoomOut"] },
        { type: "separator" },
        { role: "togglefullscreen", label: strings["menu.toggleFullScreen"] },
      ],
    },
    {
      label: strings["menu.help"],
      submenu: [
        {
          label: strings["menu.about"].replace("{name}", app.getName()),
          click: () =>
            dialog.showMessageBox(browserWindow, {
              type: "info",
              title: strings["about.title"],
              message: `${app.getName()} ${app.getVersion()}`,
              detail: strings["about.detail"],
              buttons: [strings["about.close"]],
              defaultId: 0,
              noLink: true,
            }),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildAppMenu, loadMenuStrings };
