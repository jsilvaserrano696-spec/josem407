// Registers every ipcMain.handle() call the renderer can invoke. This file is intentionally
// thin — it validates/shapes IPC payloads and delegates to the actual service/gemini/history
// modules, which stay ignorant of Electron's IPC layer entirely (and are reusable/testable on
// their own).
const { ipcMain, BrowserWindow, Menu, clipboard, nativeImage } = require("electron");
const channels = require("../shared/ipcChannels");

const fileService = require("../services/fileService");
const imageImportService = require("../services/imageImport/imageImportService");
const configStore = require("../services/configStore");
const imageEditor = require("../gemini/imageEditor");
const axionCore = require("../core/axionCore");
const promptOptimizer = require("../gemini/promptOptimizer");
const voiceTranscriber = require("../gemini/voiceTranscriber");
const styleLibrary = require("../styles/styleLibrary");
const promptTemplates = require("../prompts/promptTemplates");
const historyStore = require("../history/historyStore");
const clipboardImageService = require("../services/clipboardImageService");
const { encodeImageForPath } = require("../services/imageExportService");
const projectStore = require("../services/projectStore");
const { buildAppMenu, loadMenuStrings } = require("./menu");
// TEMP DEBUG — remove alongside src/debug/editDebugLogger.js.
const editDebugLogger = require("../debug/editDebugLogger");

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

  // `prompt` is the Gemini-optimized instruction actually sent to the model; `displayPrompt` is
  // the user's own (Spanish) text, used only for the persisted History panel entry — see
  // DESIGN_PHILOSOPHY.md, the sidebar must never show the internal optimized prompt.
  ipcMain.handle(channels.IMAGE_EDIT, async (_event, { prompt, currentImage, originalImage, referenceImage, displayPrompt, styleId }) => {
    editDebugLogger.log("IMAGE_EDIT IPC handler received request", { promptLength: prompt?.length }); // TEMP DEBUG
    const result = await axionCore.runEditPipeline({ prompt, currentImage, originalImage, referenceImage, displayPrompt, styleId });

    const entry = historyStore.addEntry({ prompt: displayPrompt, styleId: styleId ?? null });
    editDebugLogger.log("IMAGE_EDIT IPC handler returning result to renderer", { mimeType: result.mimeType, bytes: result.data.length }); // TEMP DEBUG

    return {
      base64: result.data.toString("base64"),
      mimeType: result.mimeType,
      historyEntry: entry,
    };
  });

  // Same displayPrompt/prompt split as IMAGE_EDIT above — the History entry gets the user's own
  // text, never the internal optimized one.
  ipcMain.handle(channels.IMAGE_GENERATE, async (_event, { prompt, displayPrompt, styleId }) => {
    editDebugLogger.log("IMAGE_GENERATE IPC handler received request", { promptLength: prompt?.length }); // TEMP DEBUG
    const result = await axionCore.runGeneratePipeline({ prompt, displayPrompt, styleId });

    const entry = historyStore.addEntry({ prompt: displayPrompt, styleId: styleId ?? null });
    editDebugLogger.log("IMAGE_GENERATE IPC handler returning result to renderer", { mimeType: result.mimeType, bytes: result.data.length }); // TEMP DEBUG

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
    const sourceBuffer = Buffer.from(base64, "base64");
    const exportBuffer = encodeImageForPath({ buffer: sourceBuffer, mimeType, filePath: savePath }, nativeImage);
    await fileService.writeImageFile(savePath, exportBuffer);
    return savePath;
  });

  // Clipboard writes stay in the main process for the same reason as clipboard reads below:
  // the sandboxed renderer has no direct clipboard permission. nativeImage decodes the exact
  // image currently displayed, and Electron writes it in the OS-native bitmap formats.
  ipcMain.handle(channels.IMAGE_COPY, async (_event, { base64, mimeType }) => {
    return clipboardImageService.writePayloadToClipboard({ base64, mimeType }, { nativeImage, clipboard });
  });

  ipcMain.handle(channels.IMAGE_READ_CLIPBOARD, async () => {
    return clipboardImageService.readImageFromClipboard({ clipboard });
  });

  // The renderer explicitly identifies its preview images on right-click. This is more reliable
  // than Electron's context-menu mediaType detection for large data-URL images.
  ipcMain.handle(channels.IMAGE_CONTEXT_MENU, async (event, dataUrl) => {
    if (!clipboardImageService.isImageDataUrl(dataUrl)) return false;
    const window = windowFromEvent(event);
    if (!window) return false;

    const strings = loadMenuStrings(configStore.getSettings().language);
    Menu.buildFromTemplate([
      {
        label: strings["menu.copyImage"],
        click: () => {
          clipboardImageService.writeDataUrlToClipboard(dataUrl, { nativeImage, clipboard });
        },
      },
    ]).popup({ window });
    return true;
  });

  ipcMain.handle(channels.PROMPT_OPTIMIZE, async (_event, { userPrompt, styleId, priorEdits, currentImage }) => {
    return promptOptimizer.optimizePrompt({ userPrompt, styleId, priorEdits, currentImage });
  });

  ipcMain.handle(channels.VOICE_TRANSCRIBE, async (_event, { base64, mimeType }) => {
    return voiceTranscriber.transcribeAudio({ base64, mimeType });
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

  ipcMain.handle(channels.PROJECT_LOAD, async () => projectStore.loadProject());
  ipcMain.handle(channels.PROJECT_SAVE, async (_event, project) => projectStore.saveProject(project));
  ipcMain.handle(channels.PROJECT_CLEAR, async () => projectStore.clearProject());

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

  ipcMain.handle(channels.CONFIG_SET_SETTINGS, async (event, partialSettings) => {
    const settings = configStore.setSettings(partialSettings);
    // Only a language change needs the native menu rebuilt — checked against the raw payload
    // (not a before/after diff of the merged settings), since setSettings() always merges and a
    // diff would misfire the first time any other setting happens to be saved.
    if ("language" in partialSettings) {
      const window = windowFromEvent(event);
      window?.setMenu(buildAppMenu(window, settings.language, settings.developerMode));
    }
    return settings;
  });

  // Reads the OS clipboard via Electron's main-process `clipboard` module rather than the
  // renderer's async Web Clipboard API (`navigator.clipboard.readText()`), which the app's
  // permission handler in main.js denies by default (only "media" is granted) — this sidesteps
  // that entirely and needs no permission prompt.
  ipcMain.handle(channels.CLIPBOARD_READ_TEXT, async () => {
    return clipboard.readText();
  });

  // TEMP DEBUG — forwards renderer-side debug logs (including window.onerror /
  // unhandledrejection) into the same main-process log file/console, since the renderer has no
  // filesystem access of its own. Remove alongside src/debug/editDebugLogger.js.
  ipcMain.on(channels.DEBUG_LOG, (_event, { label, data }) => {
    editDebugLogger.log(`[renderer] ${label}`, data);
  });
}

module.exports = { registerIpcHandlers };
