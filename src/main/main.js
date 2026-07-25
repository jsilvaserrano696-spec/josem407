// Electron main process entry point: window/app lifecycle only. All feature logic lives in
// src/services, src/gemini, src/history, src/prompts — this file just wires them up.
require("dotenv").config();

const path = require("node:path");
const { app, BrowserWindow, session } = require("electron");
const { registerIpcHandlers } = require("./ipcHandlers");
const { buildAppMenu } = require("./menu");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#14161a",
    title: "Nano Banana Studio",
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

  mainWindow.setMenu(buildAppMenu(mainWindow));
  mainWindow.loadFile(path.join(__dirname, "..", "..", "ui", "index.html"));

  // Surface renderer-side errors in the terminal during development — the renderer has no
  // filesystem access to write its own log file, and DevTools isn't always open.
  mainWindow.webContents.on("console-message", (event) => {
    if (event.level === "error") {
      console.error(`[renderer] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.whenReady().then(() => {
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
