// Renderer entry point. Wires DOM elements to components/state/services. No business logic
// lives here beyond orchestration — the actual work happens in the imported modules and, via
// window.nanoBanana, in the main process.
import { appState } from "./state/appState.js";
import { SpeechService } from "./services/speechService.js";
import { initDropzone } from "./components/dropzone.js";
import { showImage, clearImage } from "./components/imagePreview.js";
import { renderStyleLibrary } from "./components/styleLibraryPanel.js";
import { getPrompt, setPrompt, mergeStyleFragment } from "./components/promptBox.js";
import { setProgressActive } from "./components/progressBar.js";
import { setStatus } from "./components/statusBar.js";
import { wireVoiceButton } from "./components/voiceButton.js";
import { renderTemplates } from "./components/templatesPanel.js";
import { renderHistory } from "./components/historyPanel.js";
import { wireSettingsModal } from "./components/settingsModal.js";
import { generateId } from "./utils.js";

const el = (id) => document.getElementById(id);

const dom = {
  settingsButton: el("settings-button"),
  dropzone: el("dropzone"),
  browseButton: el("browse-button"),
  originalImage: el("original-image"),
  editedImage: el("edited-image"),
  editedPlaceholder: el("edited-placeholder"),
  conversationModeToggle: el("conversation-mode-toggle"),
  newConversationButton: el("new-conversation-button"),
  styleLibrary: el("style-library"),
  promptInput: el("prompt-input"),
  voiceButton: el("voice-button"),
  improvePromptButton: el("improve-prompt-button"),
  editImageButton: el("edit-image-button"),
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
  autoOptimizeToggle: el("auto-optimize-toggle"),
};

let stylesById = new Map();
const speechService = new SpeechService();

function getStyleIcon(styleId) {
  return stylesById.get(styleId)?.icon ?? "";
}

function setBusy(isBusy) {
  appState.setState({ isBusy });
  dom.editImageButton.disabled = isBusy;
  dom.improvePromptButton.disabled = isBusy;
  dom.browseButton.disabled = isBusy;
  setProgressActive(dom.progressBar, isBusy);
}

async function refreshHistory() {
  const entries = await window.nanoBanana.listHistory();
  renderHistory(dom.historyList, entries, {
    getStyleIcon,
    onReuse: (entry) => {
      setPrompt(dom.promptInput, entry.prompt);
      if (entry.styleId) {
        appState.setState({ selectedStyleId: entry.styleId });
        renderStyleLibrary(dom.styleLibrary, [...stylesById.values()], entry.styleId, onStyleSelect);
      }
      setStatus(dom.statusBar, "Prompt loaded from history.", "info");
    },
    onDelete: async (id) => {
      await window.nanoBanana.deleteHistoryEntry(id);
      refreshHistory();
    },
    onToggleFavorite: async (id) => {
      await window.nanoBanana.toggleFavorite(id);
      refreshHistory();
    },
  });
}

function onStyleSelect(styleId) {
  appState.setState({ selectedStyleId: styleId });
  renderStyleLibrary(dom.styleLibrary, [...stylesById.values()], styleId, onStyleSelect);
}

async function startFreshSession({ keepEditedImage = false } = {}) {
  const { sessionId } = appState.getState();
  await window.nanoBanana.startNewSession(sessionId);
  appState.setState({ sessionId: generateId(), hasActiveSession: false });
  if (!keepEditedImage) {
    clearImage(dom.editedImage, dom.editedPlaceholder);
    appState.setState({ editedImage: null });
    dom.saveImageButton.disabled = true;
  }
}

async function handleImageSelected(image) {
  appState.setState({ originalImage: image });
  clearImage(dom.editedImage, dom.editedPlaceholder);
  appState.setState({ editedImage: null });
  dom.saveImageButton.disabled = true;
  await startFreshSession({ keepEditedImage: true });
  const message = image.wasConverted
    ? `Image loaded (converted from ${image.sourceFormat.toUpperCase()}). Describe your edit and click Edit Image.`
    : "Image loaded. Describe your edit and click Edit Image.";
  setStatus(dom.statusBar, message, "success");
}

async function handleImproveClick() {
  const { selectedStyleId, hasActiveSession } = appState.getState();
  const userPrompt = getPrompt(dom.promptInput);
  if (!userPrompt) {
    setStatus(dom.statusBar, "Type a prompt first, then click Improve Prompt.", "error");
    return;
  }

  setBusy(true);
  setStatus(dom.statusBar, "Improving prompt…", "info");
  try {
    const optimized = await window.nanoBanana.optimizePrompt({
      userPrompt,
      styleId: selectedStyleId,
      conversationContext: hasActiveSession ? "Continuing an existing image edit session." : null,
    });
    setPrompt(dom.promptInput, optimized);
    setStatus(dom.statusBar, "Prompt improved.", "success");
  } catch (error) {
    setStatus(dom.statusBar, error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function handleEditClick() {
  const { originalImage, selectedStyleId, conversationMode, sessionId, autoOptimizePrompts } =
    appState.getState();

  if (!originalImage) {
    setStatus(dom.statusBar, "Drop or browse for an image first.", "error");
    return;
  }

  let promptText = getPrompt(dom.promptInput);
  if (!promptText) {
    setStatus(dom.statusBar, "Describe the edit you want before clicking Edit Image.", "error");
    return;
  }

  setBusy(true);
  setStatus(dom.statusBar, "Editing image…", "info");

  try {
    if (autoOptimizePrompts) {
      promptText = await window.nanoBanana.optimizePrompt({
        userPrompt: promptText,
        styleId: selectedStyleId,
        conversationContext: appState.getState().hasActiveSession
          ? "Continuing an existing image edit session."
          : null,
      });
      setPrompt(dom.promptInput, promptText);
    } else {
      const style = selectedStyleId ? stylesById.get(selectedStyleId) : null;
      promptText = mergeStyleFragment(promptText, style);
    }

    const result = await window.nanoBanana.editImage({
      sessionId,
      imagePaths: [originalImage.filePath],
      prompt: promptText,
      conversationMode: dom.conversationModeToggle.checked,
      styleId: selectedStyleId,
    });

    const dataUrl = `data:${result.mimeType};base64,${result.base64}`;
    showImage(dom.editedImage, dom.editedPlaceholder, dataUrl);
    appState.setState({
      editedImage: { base64: result.base64, mimeType: result.mimeType, dataUrl },
      hasActiveSession: true,
    });
    dom.saveImageButton.disabled = false;
    setStatus(dom.statusBar, "Edit complete.", "success");
    refreshHistory();
  } catch (error) {
    setStatus(dom.statusBar, error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function handleSaveClick() {
  const { editedImage } = appState.getState();
  if (!editedImage) return;

  const suggestedName = `nano-banana-edit-${Date.now()}.png`;
  const savedPath = await window.nanoBanana.saveImage({
    base64: editedImage.base64,
    mimeType: editedImage.mimeType,
    suggestedName,
  });

  if (savedPath) {
    setStatus(dom.statusBar, `Saved to ${savedPath}`, "success");
  } else {
    setStatus(dom.statusBar, "Save cancelled.", "info");
  }
}

async function init() {
  const [styles, templates, config] = await Promise.all([
    window.nanoBanana.listStyles(),
    window.nanoBanana.listTemplates(),
    window.nanoBanana.getConfig(),
  ]);

  stylesById = new Map(styles.map((style) => [style.id, style]));
  renderStyleLibrary(dom.styleLibrary, styles, appState.getState().selectedStyleId, onStyleSelect);
  renderTemplates(dom.templatesList, templates, (template) => {
    setPrompt(dom.promptInput, template.prompt);
    setStatus(dom.statusBar, `Loaded template: ${template.label}`, "info");
  });

  dom.conversationModeToggle.checked = Boolean(config.settings?.conversationModeDefault);
  appState.setState({
    conversationMode: dom.conversationModeToggle.checked,
    autoOptimizePrompts: Boolean(config.settings?.alwaysOptimizePrompts),
  });

  await refreshHistory();

  initDropzone({
    dropzoneEl: dom.dropzone,
    browseButtonEl: dom.browseButton,
    originalImageEl: dom.originalImage,
    onImageSelected: handleImageSelected,
    onError: (error) => setStatus(dom.statusBar, error.message, "error"),
  });

  wireVoiceButton({
    buttonEl: dom.voiceButton,
    speechService,
    onTranscript: (transcript) => setPrompt(dom.promptInput, transcript),
    onStatusChange: (message, type) => setStatus(dom.statusBar, message, type),
  });

  const settingsModal = wireSettingsModal({
    overlayEl: dom.settingsModal,
    openButtonEl: dom.settingsButton,
    closeButtonEl: dom.closeSettingsButton,
    apiKeyInputEl: dom.apiKeyInput,
    apiKeyStatusEl: dom.apiKeyStatus,
    saveApiKeyButtonEl: dom.saveApiKeyButton,
    autoOptimizeToggleEl: dom.autoOptimizeToggle,
    onStatusChange: (message, type) => setStatus(dom.statusBar, message, type),
    onSettingsChanged: (settings) => appState.setState({ autoOptimizePrompts: settings.alwaysOptimizePrompts }),
  });

  window.nanoBanana.onOpenSettings(() => settingsModal.open());

  dom.conversationModeToggle.addEventListener("change", () => {
    appState.setState({ conversationMode: dom.conversationModeToggle.checked });
  });

  dom.newConversationButton.addEventListener("click", async () => {
    await startFreshSession();
    setStatus(dom.statusBar, "Started a new conversation. The next edit begins from the original image.", "info");
  });

  dom.improvePromptButton.addEventListener("click", handleImproveClick);
  dom.editImageButton.addEventListener("click", handleEditClick);
  dom.saveImageButton.addEventListener("click", handleSaveClick);

  dom.clearHistoryButton.addEventListener("click", async () => {
    await window.nanoBanana.clearHistory();
    refreshHistory();
  });

  if (!config.hasApiKey) {
    setStatus(dom.statusBar, "Add your Gemini API key in Settings to get started.", "error");
    settingsModal.open();
  } else {
    setStatus(dom.statusBar, "Ready. Drop an image to get started.", "info");
  }
}

init();
