// Registers every ipcMain.handle() call the renderer can invoke. This file is intentionally
// thin — it validates/shapes IPC payloads and delegates to the actual service/gemini/history
// modules, which stay ignorant of Electron's IPC layer entirely (and are reusable/testable on
// their own).
const { ipcMain, BrowserWindow } = require("electron");
const channels = require("../shared/ipcChannels");

const fileService = require("../services/fileService");
const imageImportService = require("../services/imageImport/imageImportService");
const configStore = require("../services/configStore");
const imageEditor = require("../gemini/imageEditor");
const promptOptimizer = require("../gemini/promptOptimizer");
const styleLibrary = require("../styles/styleLibrary");
const promptTemplates = require("../prompts/promptTemplates");
const historyStore = require("../history/historyStore");

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function maskApiKey(apiKey) {
  if (!apiKey) return null;
  if (apiKey.length <= 8) return "••••••••";
  return `${apiKey.slice(0, 4)}••••••••${apiKey.slice(-4)}`;
}

function registerIpcHandlers() {
  ipcMain.handle(channels.DIALOG_OPEN_IMAGE, async (event) => {
    return fileService.showOpenImageDialog(windowFromEvent(event));
  });

  ipcMain.handle(channels.IMAGE_LOAD, async (_event, filePath) => {
    const { base64, mimeType, sourceFormat, wasConverted } = await imageImportService.importImage(filePath);
    return { base64, mimeType, filePath, sourceFormat, wasConverted };
  });

  ipcMain.handle(channels.IMAGE_EDIT, async (_event, payload) => {
    const { sessionId, imagePaths, prompt, conversationMode, styleId } = payload;
    const result = await imageEditor.editImage({ sessionId, imagePaths, prompt, conversationMode });

    const entry = historyStore.addEntry({ prompt, styleId: styleId ?? null });

    return {
      base64: result.data.toString("base64"),
      mimeType: result.mimeType,
      historyEntry: entry,
    };
  });

  ipcMain.handle(channels.IMAGE_SAVE, async (event, { base64, mimeType, suggestedName }) => {
    const savePath = await fileService.showSaveImageDialog(windowFromEvent(event), suggestedName);
    if (!savePath) {
      return null;
    }
    const buffer = Buffer.from(base64, "base64");
    await fileService.writeImageFile(savePath, buffer);
    return savePath;
  });

  ipcMain.handle(channels.IMAGE_NEW_SESSION, async (_event, sessionId) => {
    imageEditor.endSession(sessionId);
    return true;
  });

  ipcMain.handle(channels.PROMPT_OPTIMIZE, async (_event, { userPrompt, styleId, conversationContext }) => {
    return promptOptimizer.optimizePrompt({ userPrompt, styleId, conversationContext });
  });

  ipcMain.handle(channels.STYLES_LIST, async () => {
    return styleLibrary.listStyles();
  });

  ipcMain.handle(channels.HISTORY_LIST, async () => {
    return historyStore.listHistory();
  });

  ipcMain.handle(channels.HISTORY_DELETE, async (_event, id) => {
    historyStore.deleteEntry(id);
    return true;
  });

  ipcMain.handle(channels.HISTORY_CLEAR, async () => {
    historyStore.clearHistory();
    return true;
  });

  ipcMain.handle(channels.HISTORY_TOGGLE_FAVORITE, async (_event, id) => {
    return historyStore.toggleFavorite(id);
  });

  ipcMain.handle(channels.TEMPLATES_LIST, async () => {
    return promptTemplates.listTemplates();
  });

  ipcMain.handle(channels.CONFIG_GET, async () => {
    const apiKey = configStore.getApiKey();
    return {
      hasApiKey: Boolean(apiKey),
      maskedApiKey: maskApiKey(apiKey),
      settings: configStore.getSettings(),
    };
  });

  ipcMain.handle(channels.CONFIG_SET_API_KEY, async (_event, apiKey) => {
    configStore.setApiKey(apiKey);
    return { maskedApiKey: maskApiKey(apiKey) };
  });

  ipcMain.handle(channels.CONFIG_SET_SETTINGS, async (_event, partialSettings) => {
    return configStore.setSettings(partialSettings);
  });
}

module.exports = { registerIpcHandlers };
