// Electron main process entry point: window/app lifecycle only. All feature logic lives in
// src/services, src/gemini, src/history, src/prompts — this file just wires them up.
require("dotenv").config();

const path = require("node:path");
const { app, BrowserWindow, session, Menu } = require("electron");
const { registerIpcHandlers } = require("./ipcHandlers");
const { buildAppMenu, loadMenuStrings } = require("./menu");
const configStore = require("../services/configStore");
// TEMP DEBUG — remove alongside src/debug/editDebugLogger.js once the edit flow is confirmed
// stable across several consecutive edits.
const editDebugLogger = require("../debug/editDebugLogger");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#14161a",
    title: "AXION",
    icon: path.join(__dirname, "..", "..", "assets", "icons", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Electron's *sandboxed* preload loader only resolves a small whitelist of built-ins —
      // it can't require() local project files like ../shared/ipcChannels. contextIsolation
      // and nodeIntegration:false are what actually keep the renderer (untrusted-content-shaped
      // code) away from Node/Electron internals; sandbox:false only loosens what our own
      // first-party preload script can do, which is safe here since preload never runs
      // page-supplied code.
      sandbox: false,
    },
  });

  mainWindow.setMenu(buildAppMenu(mainWindow, configStore.getSettings().language, configStore.getSettings().developerMode));
  mainWindow.loadFile(path.join(__dirname, "..", "..", "ui", "index.html"));

  // Hidden developer-mode toggle (see DESIGN_PHILOSOPHY.md) — deliberately not a menu item or
  // button, so it's never reachable by accident. Scoped to this window's input (not
  // globalShortcut) so it only fires while AXION itself has focus.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    // Electron's fullscreen menu role toggles the window correctly, but on Windows Escape
    // does not leave that state automatically. Always provide the conventional escape route;
    // when the window is not fullscreen, Escape continues to the renderer for previews/settings.
    if (input.key === "Escape" && mainWindow.isFullScreen()) {
      event.preventDefault();
      mainWindow.setFullScreen(false);
      return;
    }

    if (!input.control || !input.shift || !input.alt || input.key.toLowerCase() !== "d") return;
    const enabled = configStore.toggleDeveloperMode();
    mainWindow.setMenu(buildAppMenu(mainWindow, configStore.getSettings().language, enabled));
  });

  // Electron does not provide a native Cut/Copy/Paste context menu on right-click the way a
  // regular browser tab does — it has to be built by hand. Image previews register their own
  // explicit menu through IMAGE_CONTEXT_MENU; this handler is only for editable text.
  mainWindow.webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable) return;
    const strings = loadMenuStrings(configStore.getSettings().language);
    Menu.buildFromTemplate([
      { role: "cut", label: strings["menu.cut"], enabled: params.editFlags.canCut },
      { role: "copy", label: strings["menu.copy"], enabled: params.editFlags.canCopy },
      { role: "paste", label: strings["menu.paste"], enabled: params.editFlags.canPaste },
      { type: "separator" },
      { role: "selectAll", label: strings["menu.selectAll"], enabled: params.editFlags.canSelectAll },
    ]).popup({ window: mainWindow });
  });

  // Surface renderer-side errors in the terminal during development — the renderer has no
  // filesystem access to write its own log file, and DevTools isn't always open.
  mainWindow.webContents.on("console-message", (event) => {
    if (event.level === "error") {
      console.error(`[renderer] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    }
  });

  // TEMP DEBUG: catches the OTHER class of "unexpected close" — a renderer/GPU process crash
  // isn't a catchable JS exception, it's a native process-level event. Remove alongside
  // src/debug/editDebugLogger.js.
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    editDebugLogger.log("RENDERER PROCESS GONE", details);
  });
  mainWindow.on("unresponsive", () => {
    editDebugLogger.log("WINDOW UNRESPONSIVE", {});
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.whenReady().then(() => {
  // TEMP DEBUG: installs process.on('uncaughtException')/('unhandledRejection') so nothing in
  // the main process can close the app silently. Remove alongside src/debug/editDebugLogger.js.
  editDebugLogger.setupCrashHandlers();

  // Resolves a default UI language on first run (OS-locale detection), before the window/menu
  // are built, so the very first render already uses the right locale. No-op on every later
  // launch once a language is on record.
  configStore.ensureDefaultLanguage();

  // The Voice Command feature needs microphone access; grant only that permission and only to
  // our own app window, and deny everything else by default.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === "media");
  });

  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
