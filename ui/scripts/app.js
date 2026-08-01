// Renderer entry point. Wires DOM elements to components/state/services. No business logic
// lives here beyond orchestration — the actual work happens in the imported modules and, via
// window.axion, in the main process.
import { appState } from "./state/appState.js";
import { SpeechService } from "./services/speechService.js";
import { initDropzone } from "./components/dropzone.js";
import { showImage, clearImage } from "./components/imagePreview.js";
import { renderStyleLibrary } from "./components/styleLibraryPanel.js";
import { getPrompt, setPrompt } from "./components/promptBox.js";
import { setProgressActive } from "./components/progressBar.js";
import { setStatus } from "./components/statusBar.js";
import { wireVoiceButton } from "./components/voiceButton.js";
import { renderTemplates } from "./components/templatesPanel.js";
import { renderHistory } from "./components/historyPanel.js";
import { wireSettingsModal } from "./components/settingsModal.js";
import { generateId, sleep } from "./utils.js";
import { loadTranslations, t, applyTranslations } from "./i18n/i18n.js";

// ============================================================================
// TEMP DEBUG — global renderer crash handlers, installed as early as possible so nothing here
// can fail silently. Forwards to the main process (which has filesystem access) via
// window.axion.debugLog(). Remove alongside src/debug/editDebugLogger.js.
// ============================================================================
window.onerror = (message, source, lineno, colno, error) => {
  window.axion.debugLog("UNCAUGHT EXCEPTION (renderer)", {
    message,
    source,
    lineno,
    colno,
    stack: error?.stack,
  });
};
window.addEventListener("unhandledrejection", (event) => {
  window.axion.debugLog("UNHANDLED REJECTION (renderer)", {
    reason: event.reason?.message ?? String(event.reason),
    stack: event.reason?.stack,
  });
});

const el = (id) => document.getElementById(id);

const dom = {
  settingsButton: el("settings-button"),
  dropzone: el("dropzone"),
  browseButton: el("browse-button"),
  addImageButton: el("add-image-button"),
  originalImage: el("original-image"),
  editedImage: el("edited-image"),
  editedPlaceholder: el("edited-placeholder"),
  conversationModeToggle: el("conversation-mode-toggle"),
  newConversationButton: el("new-conversation-button"),
  undoButton: el("undo-button"),
  redoButton: el("redo-button"),
  styleLibrary: el("style-library"),
  promptInput: el("prompt-input"),
  voiceButton: el("voice-button"),
  editImageButton: el("edit-image-button"),
  copyImageButton: el("copy-image-button"),
  saveImageButton: el("save-image-button"),
  progressBar: el("progress-bar"),
  statusBar: el("status-bar"),
  templatesList: el("templates-list"),
  historyList: el("history-list"),
  clearHistoryButton: el("clear-history-button"),
  settingsModal: el("settings-modal"),
  closeSettingsButton: el("close-settings-button"),
  apiKeyInput: el("api-key-input"),
  apiKeyStatus: el("api-key-status"),
  saveApiKeyButton: el("save-api-key-button"),
  toggleKeyVisibilityButton: el("toggle-key-visibility-button"),
  pasteApiKeyButton: el("paste-api-key-button"),
  languageSelect: el("language-select"),
};

let stylesById = new Map();
let cachedTemplates = [];
let settingsModalRef = null;
// Reassigned once initDropzone() runs in init() — needed here too so the "New" project flow
// (starting/mirroring a project with no source file) can reuse the same Original-panel display
// logic dropzone.js already owns, instead of duplicating it.
let showOriginalImage = () => {};
let clearOriginalImage = () => {};
const speechService = new SpeechService();

function getStyleIcon(styleId) {
  return stylesById.get(styleId)?.icon ?? "";
}

// Undo/Redo bounds check purely against the local array + cursor — no IPC, no Gemini, no
// network. Disabled while busy so a generation in flight can't be interrupted mid-edit.
function updateUndoRedoButtons() {
  const { versionHistory, versionCursor, isBusy } = appState.getState();
  dom.undoButton.disabled = isBusy || versionCursor <= 0;
  dom.redoButton.disabled = isBusy || versionCursor >= versionHistory.length - 1;
}

// Paints whatever version.versionCursor currently points at — including version 0, the
// original: Undo must visibly restore "the previous state", and hiding it behind the empty
// placeholder made Undo look like it did nothing. The placeholder is reserved for the one case
// where there's truly no version loaded at all (versionCursor === -1).
//
// Save is disabled at version 0 only when that version came from an imported file (prompt is
// null — see handleImageSelected) — there's nothing new to save, it's already on disk. A
// version 0 created from a prompt (the "New" flow, see handleEditClick) has never touched disk
// anywhere, so it must be savable immediately.
function renderCurrentVersion() {
  const { versionHistory, versionCursor } = appState.getState();
  const version = versionCursor >= 0 ? versionHistory[versionCursor] : null;

  if (!version) {
    clearImage(dom.editedImage, dom.editedPlaceholder);
    dom.copyImageButton.disabled = true;
    dom.saveImageButton.disabled = true;
  } else {
    const dataUrl = `data:${version.image.mimeType};base64,${version.image.base64}`;
    showImage(dom.editedImage, dom.editedPlaceholder, dataUrl);
    const isUneditedImport = versionCursor === 0 && version.prompt === null;
    // Copy always applies to whatever image is visible, including a freshly imported original.
    // Save keeps its narrower rule because that original is already present on disk.
    dom.copyImageButton.disabled = false;
    dom.saveImageButton.disabled = isUneditedImport;
  }
  updateUndoRedoButtons();
}

function setBusy(isBusy) {
  appState.setState({ isBusy });
  dom.editImageButton.disabled = isBusy;
  dom.browseButton.disabled = isBusy;
  dom.addImageButton.disabled = isBusy;
  setProgressActive(dom.progressBar, isBusy);
  updateUndoRedoButtons();
}

// The primary action button reads "Crear Imagen" with no project loaded yet, "Editar Imagen"
// once there's at least one version — see the shared Create/Edit flow in handleEditClick().
// Updates the data-i18n attribute too, not just the visible text, so a later language switch
// (applyTranslations()) keeps showing the correct one instead of reverting to whatever the
// static HTML originally said.
function updateActionButtonLabel() {
  const { versionHistory } = appState.getState();
  const key = versionHistory.length === 0 ? "button.createImage" : "button.editImage";
  dom.editImageButton.setAttribute("data-i18n", key);
  dom.editImageButton.textContent = t(key);
}

// Shared by both "create from nothing" and "edit an existing version" (see handleEditClick) —
// truncates any undone future before appending, so both flows get identical, correct
// version-history bookkeeping. Works unchanged when versionCursor is -1 (no version yet):
// slice(0, 0) is an empty array, so the first push simply becomes version 0.
function pushVersion({ prompt, styleId, image }) {
  const { versionHistory, versionCursor } = appState.getState();
  const truncated = versionHistory.slice(0, versionCursor + 1);
  truncated.push({
    id: generateId(),
    versionNumber: truncated.length,
    prompt,
    styleId,
    timestamp: Date.now(),
    image,
  });
  appState.setState({ versionHistory: truncated, versionCursor: truncated.length - 1 });
  renderCurrentVersion();
  updateActionButtonLabel();
}

async function refreshHistory() {
  const entries = await window.axion.listHistory();
  renderHistory(dom.historyList, entries, {
    getStyleIcon,
    onReuse: (entry) => {
      setPrompt(dom.promptInput, entry.prompt);
      if (entry.styleId) {
        appState.setState({ selectedStyleId: entry.styleId });
        renderStyleLibrary(dom.styleLibrary, [...stylesById.values()], entry.styleId, onStyleSelect);
      }
      setStatus(dom.statusBar, t("status.promptLoadedFromHistory"), "info");
    },
    onDelete: async (id) => {
      await window.axion.deleteHistoryEntry(id);
      refreshHistory();
    },
    onToggleFavorite: async (id) => {
      await window.axion.toggleFavorite(id);
      refreshHistory();
    },
  });
}

function onStyleSelect(styleId) {
  appState.setState({ selectedStyleId: styleId });
  renderStyleLibrary(dom.styleLibrary, [...stylesById.values()], styleId, onStyleSelect);
}

function handleTemplateReuse(template, label) {
  setPrompt(dom.promptInput, template.prompt);
  setStatus(dom.statusBar, t("status.templateLoaded", { label }), "info");
}

// Re-applies the active language across the whole UI at runtime — no restart needed. Static
// copy is refreshed via the data-i18n* walker; the few list-rendered components (style chips,
// templates, history) are just re-rendered with the same already-cached data through their
// normal render functions, since those already read live translations on every render.
async function applyLanguage(locale) {
  await loadTranslations(locale);
  applyTranslations(document);
  renderStyleLibrary(dom.styleLibrary, [...stylesById.values()], appState.getState().selectedStyleId, onStyleSelect);
  renderTemplates(dom.templatesList, cachedTemplates, handleTemplateReuse);
  await refreshHistory();
  // Settings modal has a couple of JS-driven labels (api key status text, the show/hide-key
  // icon's title) that data-i18n* doesn't cover, since their content depends on app state, not
  // just the active language.
  settingsModalRef?.refreshDynamicLabels();
}

// Truncates the version history back to just the original (index 0) — a purely local reset,
// no Gemini/IPC call needed since there's no server-side session to forget anymore.
function startNewConversation() {
  const { versionHistory } = appState.getState();
  if (versionHistory.length === 0) return;
  appState.setState({ versionHistory: [versionHistory[0]], versionCursor: 0 });
  renderCurrentVersion();
}

// "Archivo > Nuevo..." — starts a brand-new project with nothing loaded at all: no source
// file, no version history. The next click on the primary action button *creates* (rather than
// edits) the first image, from whatever the user writes in the same prompt box — see
// handleEditClick(). Purely local: no IPC, no Gemini call.
function startNewProject() {
  appState.setState({ versionHistory: [], versionCursor: -1 });
  clearOriginalImage();
  renderCurrentVersion();
  updateActionButtonLabel();
  setPrompt(dom.promptInput, "");
}

function handleImageSelected(image) {
  const original = {
    id: generateId(),
    versionNumber: 0,
    prompt: null,
    styleId: null,
    timestamp: Date.now(),
    image: { base64: image.base64, mimeType: image.mimeType },
  };
  appState.setState({ versionHistory: [original], versionCursor: 0 });
  renderCurrentVersion();
  updateActionButtonLabel();
  const message = image.wasConverted
    ? t("status.imageLoadedConverted", { format: image.sourceFormat.toUpperCase() })
    : t("status.imageLoaded");
  setStatus(dom.statusBar, message, "success");
}

// The single primary-action handler for both "New" and "Edit": which Gemini call it makes
// depends only on whether a project is currently loaded (versionHistory.length === 0 means
// nothing has been created or imported yet — see startNewProject()/ARCHITECTURE.md). Both
// branches converge on the same pushVersion() bookkeeping, so Undo/Redo/History/Save behave
// identically afterward regardless of how version 0 came to exist.
async function handleEditClick() {
  const { versionHistory, versionCursor, selectedStyleId, conversationMode } = appState.getState();
  const isCreating = versionHistory.length === 0;

  const userPrompt = getPrompt(dom.promptInput);
  if (!userPrompt) {
    setStatus(dom.statusBar, t(isCreating ? "status.describeCreate" : "status.describeEdit"), "error");
    return;
  }

  // Conversation Mode on: keep building on whatever's currently displayed (versionCursor).
  // Off: every edit restarts from the original import (index 0), regardless of cursor.
  // Not used at all when creating — there's nothing yet to build on or restart from.
  const sourceVersion = isCreating ? null : conversationMode ? versionHistory[versionCursor] : versionHistory[0];

  // The prompts of every version between the original and sourceVersion, in order — this is
  // what optimizerPromptBuilder.js weaves in as "changes already applied, don't undo these".
  // Empty when sourceVersion IS the original (versionNumber 0): slice(1, 1) is [].
  const priorEdits = isCreating ? [] : versionHistory.slice(1, sourceVersion.versionNumber + 1).map((v) => v.prompt);

  // TEMP DEBUG
  const debugStartedAt = performance.now();
  window.axion.debugLog(isCreating ? "Create Image clicked" : "Edit Image clicked", {
    startTime: new Date().toISOString(),
    originalPrompt: userPrompt,
    conversationMode,
    selectedStyleId,
    sourceVersionNumber: sourceVersion?.versionNumber ?? null,
    priorEditsCount: priorEdits.length,
  });

  setBusy(true);
  setStatus(dom.statusBar, t(isCreating ? "status.interpreting" : "status.analyzing"), "info");

  try {
    // Always run the prompt through Gemini's optimizer before generating — silently: the
    // user's own text in the box never changes, only what's actually sent to the image model
    // is enriched. See DESIGN_PHILOSOPHY.md: no internal/English prompt is ever shown.
    // When editing, the same call also diagnoses the current image (strengths/weaknesses) —
    // see ARCHITECTURE.md's "Fidelity anchor" and optimizerPromptBuilder.js.
    const promptText = await window.axion.optimizePrompt({
      userPrompt,
      styleId: selectedStyleId,
      priorEdits,
      currentImage: isCreating ? undefined : { base64: sourceVersion.image.base64, mimeType: sourceVersion.image.mimeType },
    });
    window.axion.debugLog("Final prompt ready to send to Gemini", { finalPrompt: promptText }); // TEMP DEBUG

    // Brief, deliberate confirmation that the instruction was understood, before the (longer)
    // generation wait begins — see DESIGN_PHILOSOPHY.md. Fixed duration, not tied to any
    // network latency.
    setStatus(dom.statusBar, t("status.promptOptimized"), "success");
    await sleep(900);

    setStatus(dom.statusBar, t("status.generating"), "info");

    // Past the very first version, always send the original back too — see
    // ARCHITECTURE.md's "Fidelity anchor": it's what keeps small deviations from one edit from
    // compounding into the next, since the true original never drops out of the conversation.
    const result = isCreating
      ? await window.axion.generateImage({ prompt: promptText, displayPrompt: userPrompt, styleId: selectedStyleId })
      : await window.axion.editImage({
          prompt: promptText,
          currentImage: { base64: sourceVersion.image.base64, mimeType: sourceVersion.image.mimeType },
          originalImage:
            sourceVersion.versionNumber > 0
              ? { base64: versionHistory[0].image.base64, mimeType: versionHistory[0].image.mimeType }
              : undefined,
          displayPrompt: userPrompt,
          styleId: selectedStyleId,
        });

    // TEMP DEBUG: measure actual paint time via the <img> load event, and confirm the Edited
    // panel really received/decoded the image (same naturalWidth/naturalHeight check used
    // throughout this session's real bug investigations).
    const debugRenderStartedAt = performance.now();
    dom.editedImage.addEventListener(
      "load",
      () => {
        window.axion.debugLog("Edited panel received and rendered the image", {
          renderMs: performance.now() - debugRenderStartedAt,
          totalMs: performance.now() - debugStartedAt,
          naturalWidth: dom.editedImage.naturalWidth,
          naturalHeight: dom.editedImage.naturalHeight,
        });
      },
      { once: true }
    );

    if (isCreating) {
      // No source file exists for a created project — the first generated image *is* "what
      // you started with", so it's what the Original panel shows too. Purely cosmetic; the
      // version-history model doesn't distinguish origin beyond version 0's prompt field.
      showOriginalImage(`data:${result.mimeType};base64,${result.base64}`);
    }

    pushVersion({
      prompt: userPrompt,
      styleId: selectedStyleId,
      image: { base64: result.base64, mimeType: result.mimeType },
    });

    setStatus(dom.statusBar, t(isCreating ? "status.createComplete" : "status.editComplete"), "success");
    refreshHistory();
  } catch (error) {
    window.axion.debugLog("Edit Image flow threw", { message: error.message, stack: error.stack }); // TEMP DEBUG
    setStatus(dom.statusBar, error.message, "error");
  } finally {
    setBusy(false);
  }
}

// Instant — pure local state, no IPC, no Gemini call, no tokens. The isBusy check here (not
// just the button's disabled attribute) matters because these are also reachable via the
// Ctrl+Z/Ctrl+Shift+Z menu accelerators, which fire regardless of any DOM element's disabled
// state — see src/main/menu.js.
function handleUndoClick() {
  const { versionCursor, isBusy } = appState.getState();
  if (isBusy || versionCursor <= 0) return;
  appState.setState({ versionCursor: versionCursor - 1 });
  renderCurrentVersion();
}

function handleRedoClick() {
  const { versionHistory, versionCursor, isBusy } = appState.getState();
  if (isBusy || versionCursor >= versionHistory.length - 1) return;
  appState.setState({ versionCursor: versionCursor + 1 });
  renderCurrentVersion();
}

async function handleSaveClick() {
  const { versionHistory, versionCursor } = appState.getState();
  if (versionCursor < 0) return;
  const version = versionHistory[versionCursor];
  if (versionCursor === 0 && version.prompt === null) return;
  const { image } = version;

  const suggestedName = `axion-edit-${Date.now()}.png`;
  const savedPath = await window.axion.saveImage({
    base64: image.base64,
    mimeType: image.mimeType,
    suggestedName,
  });

  if (savedPath) {
    setStatus(dom.statusBar, t("status.savedTo", { path: savedPath }), "success");
  } else {
    setStatus(dom.statusBar, t("status.saveCancelled"), "info");
  }
}

async function handleCopyClick() {
  const { versionHistory, versionCursor } = appState.getState();
  if (versionCursor < 0) return;
  const version = versionHistory[versionCursor];

  try {
    await window.axion.copyImage(version.image);
    setStatus(dom.statusBar, t("status.imageCopied"), "success");
  } catch (error) {
    window.axion.debugLog("Copy Image flow threw", { message: error.message, stack: error.stack });
    setStatus(dom.statusBar, t("error.copyImageFailed"), "error");
  }
}

async function init() {
  const [styles, templates, config] = await Promise.all([
    window.axion.listStyles(),
    window.axion.listTemplates(),
    window.axion.getConfig(),
  ]);

  // Load and apply the saved language before the first render, so nothing flashes in the
  // wrong language on startup.
  await loadTranslations(config.settings?.language);
  applyTranslations(document);
  if (dom.languageSelect) {
    dom.languageSelect.value = config.settings?.language ?? "en";
  }

  stylesById = new Map(styles.map((style) => [style.id, style]));
  cachedTemplates = templates;
  renderStyleLibrary(dom.styleLibrary, styles, appState.getState().selectedStyleId, onStyleSelect);
  renderTemplates(dom.templatesList, cachedTemplates, handleTemplateReuse);

  dom.conversationModeToggle.checked = Boolean(config.settings?.conversationModeDefault);
  appState.setState({ conversationMode: dom.conversationModeToggle.checked });

  await refreshHistory();
  updateActionButtonLabel();

  const dropzoneApi = initDropzone({
    dropzoneEl: dom.dropzone,
    browseButtonEl: dom.browseButton,
    addImageButtonEl: dom.addImageButton,
    originalImageEl: dom.originalImage,
    onImageSelected: handleImageSelected,
    onError: (error) => setStatus(dom.statusBar, error.message, "error"),
  });
  const { browseForImage } = dropzoneApi;
  showOriginalImage = dropzoneApi.showOriginalImage;
  clearOriginalImage = dropzoneApi.clearOriginalImage;

  wireVoiceButton({
    buttonEl: dom.voiceButton,
    speechService,
    onTranscript: (transcript) => setPrompt(dom.promptInput, transcript),
    onStatusChange: (message, type) => setStatus(dom.statusBar, message, type),
  });

  settingsModalRef = wireSettingsModal({
    overlayEl: dom.settingsModal,
    openButtonEl: dom.settingsButton,
    closeButtonEl: dom.closeSettingsButton,
    apiKeyInputEl: dom.apiKeyInput,
    apiKeyStatusEl: dom.apiKeyStatus,
    saveApiKeyButtonEl: dom.saveApiKeyButton,
    toggleKeyVisibilityButtonEl: dom.toggleKeyVisibilityButton,
    pasteApiKeyButtonEl: dom.pasteApiKeyButton,
    languageSelectEl: dom.languageSelect,
    onStatusChange: (message, type) => setStatus(dom.statusBar, message, type),
    onLanguageChanged: (locale) => applyLanguage(locale),
  });

  window.axion.onOpenSettings(() => settingsModalRef.open());

  window.axion.onOpenImage(() => {
    if (appState.getState().isBusy) {
      setStatus(dom.statusBar, t("status.busyWait"), "info");
      return;
    }
    browseForImage();
  });

  window.axion.onNewProject(() => {
    if (appState.getState().isBusy) {
      setStatus(dom.statusBar, t("status.busyWait"), "info");
      return;
    }
    startNewProject();
    setStatus(dom.statusBar, t("status.newProjectStarted"), "info");
  });

  window.axion.onUndo(() => handleUndoClick());
  window.axion.onRedo(() => handleRedoClick());

  dom.conversationModeToggle.addEventListener("change", () => {
    appState.setState({ conversationMode: dom.conversationModeToggle.checked });
  });

  dom.newConversationButton.addEventListener("click", () => {
    startNewConversation();
    setStatus(dom.statusBar, t("status.newConversationStarted"), "info");
  });

  dom.undoButton.addEventListener("click", handleUndoClick);
  dom.redoButton.addEventListener("click", handleRedoClick);

  dom.editImageButton.addEventListener("click", handleEditClick);
  dom.copyImageButton.addEventListener("click", handleCopyClick);
  dom.saveImageButton.addEventListener("click", handleSaveClick);

  dom.clearHistoryButton.addEventListener("click", async () => {
    await window.axion.clearHistory();
    refreshHistory();
  });

  if (!config.hasApiKey) {
    setStatus(dom.statusBar, t("error.missingApiKey"), "error");
    settingsModalRef.open();
  } else {
    setStatus(dom.statusBar, t("status.ready"), "info");
  }
}

init();
