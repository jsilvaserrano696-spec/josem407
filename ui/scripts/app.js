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
import { loadTranslations, getLocale, t, applyTranslations } from "./i18n/i18n.js";
import { makeEdgeBackgroundTransparent } from "./services/backgroundRemoval.js";
import { createReferenceSlot } from "./components/roleSlotPanel.js";
import { createProtectedSelectionPanel, compositeWithProtectedMask } from "./components/protectedSelectionPanel.mjs";
import { normalizeRecentStyleIds, rememberStyle, orderStylesByRecency } from "./services/styleMemory.mjs";

// Global renderer crash handlers feed the guarded Developer Mode log. In normal use every call
// is a no-op, so diagnostics never persist prompts or error details without explicit opt-in.
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
  projectNameInput: el("project-name-input"),
  projectReferenceInput: el("project-reference-input"),
  projectDetailsModal: el("project-details-modal"),
  closeProjectDetailsButton: el("close-project-details-button"),
  cancelProjectDetailsButton: el("cancel-project-details-button"),
  saveProjectDetailsButton: el("save-project-details-button"),
  dropzone: el("dropzone"),
  browseButton: el("browse-button"),
  addImageButton: el("add-image-button"),
  pasteImageButton: el("paste-image-button"),
  originalImage: el("original-image"),
  originalGallery: el("original-gallery"),
  editedImage: el("edited-image"),
  editedPlaceholder: el("edited-placeholder"),
  editExplanation: el("edit-explanation"),
  imagePreviewModal: el("image-preview-modal"),
  imagePreviewCanvas: el("image-preview-canvas"),
  imagePreviewFull: el("image-preview-full"),
  closeImagePreviewButton: el("close-image-preview-button"),
  previewOriginalButton: el("preview-original-button"),
  previewEditedButton: el("preview-edited-button"),
  previewCompareButton: el("preview-compare-button"),
  previewPreviousButton: el("preview-previous-button"),
  previewNextButton: el("preview-next-button"),
  imagePreviewCompare: el("image-preview-compare"),
  imagePreviewCompareClip: el("image-preview-compare-clip"),
  previewZoomReset: el("preview-zoom-reset"),
  previewCompareScale: el("preview-compare-scale"),
  previewEditedPercent: el("preview-edited-percent"),
  previewOriginalPercent: el("preview-original-percent"),
  previewCompareDivider: el("preview-compare-divider"),
  previewCompareSlider: el("preview-compare-slider"),
  protectedSelectionModal: el("protected-selection-modal"),
  protectedBaseCanvas: el("protected-base-canvas"),
  protectedMaskCanvas: el("protected-mask-canvas"),
  protectedBrushCursor: el("protected-brush-cursor"),
  protectedMagicButton: el("protected-magic-button"),
  protectedBrushButton: el("protected-brush-button"),
  protectedEraserButton: el("protected-eraser-button"),
  protectedHandButton: el("protected-hand-button"),
  protectedTolerance: el("protected-tolerance"),
  protectedToleranceValue: el("protected-tolerance-value"),
  protectedBrushSize: el("protected-brush-size"),
  protectedBrushSizeValue: el("protected-brush-size-value"),
  protectedClearButton: el("protected-clear-button"),
  protectedCancelButton: el("protected-cancel-button"),
  protectedConfirmButton: el("protected-confirm-button"),
  closeProtectedSelectionButton: el("close-protected-selection-button"),
  protectedSelectionStatus: el("protected-selection-status"),
  protectedZoomReset: el("protected-zoom-reset"),
  conversationModeToggle: el("conversation-mode-toggle"),
  newConversationButton: el("new-conversation-button"),
  undoButton: el("undo-button"),
  redoButton: el("redo-button"),
  versionIndicator: el("version-indicator"),
  styleLibrary: el("style-library"),
  promptInput: el("prompt-input"),
  voiceButton: el("voice-button"),
  editImageButton: el("edit-image-button"),
  modelTierSelect: el("model-tier-select"),
  copyImageButton: el("copy-image-button"),
  useAsOriginalButton: el("use-as-original-button"),
  saveImageButton: el("save-image-button"),
  progressBar: el("progress-bar"),
  statusBar: el("status-bar"),
  templatesList: el("templates-list"),
  saveTemplateButton: el("save-template-button"),
  templateModal: el("template-modal"),
  templateModalTitle: el("template-modal-title"),
  closeTemplateModalButton: el("close-template-modal-button"),
  templateNameInput: el("template-name-input"),
  templatePromptInput: el("template-prompt-input"),
  cancelTemplateButton: el("cancel-template-button"),
  confirmTemplateButton: el("confirm-template-button"),
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
  defaultStyleSelect: el("default-style-select"),
  conversationDefaultToggle: el("conversation-default-toggle"),
  defaultModelTierSelect: el("default-model-tier-select"),
  workProfileSelect: el("work-profile-select"),
  applyWorkProfileButton: el("apply-work-profile-button"),
  deleteWorkProfileButton: el("delete-work-profile-button"),
  workProfileNameInput: el("work-profile-name-input"),
  saveWorkProfileButton: el("save-work-profile-button"),
};

let stylesById = new Map();
let recentStyleIds = [];
let defaultStyleId = null;
let conversationModeDefault = true;
let cachedTemplates = [];
let settingsModalRef = null;
let quickStylePrompt = null;
let promptBeforeQuickStyle = null;
let activeTemplateId = null;
let editingTemplateId = null;
// Reassigned once initDropzone() runs in init() — needed here too so the "New" project flow
// (starting/mirroring a project with no source file) can reuse the same Original-panel display
// logic dropzone.js already owns, instead of duplicating it.
let showOriginalImage = () => {};
let clearOriginalImage = () => {};
let referenceSlotRef = null;
let rendererInitialized = false;
let pendingExternalProject = null;
let protectedSelection = null;
let protectedSelectionPanelRef = null;
// Project writes contain the full image history and are asynchronous. Keep saves and clears in
// strict order so File > New cannot race a draft save triggered when the prompt loses focus.
let projectPersistenceQueue = Promise.resolve();
const speechService = new SpeechService();

function getStyleIcon(styleId) {
  return stylesById.get(styleId)?.icon ?? "";
}

function renderStyles(selectedStyleId = appState.getState().selectedStyleId) {
  const styles = orderStylesByRecency([...stylesById.values()], recentStyleIds);
  renderStyleLibrary(dom.styleLibrary, styles, selectedStyleId, onStyleSelect);
}

function recordStyleUse(styleId) {
  if (!styleId) return;
  recentStyleIds = rememberStyle(recentStyleIds, styleId, stylesById.keys());
  renderStyles(styleId);
  window.axion.setSettings({ recentStyleIds }).catch((error) => {
    window.axion.debugLog("Could not persist recent style memory", { message: error.message });
  });
}

function currentProjectPayload() {
  const { versionHistory, versionCursor, projectName, projectReference, selectedStyleId, referenceImage, conversationMode } = appState.getState();
  return {
    versionHistory,
    versionCursor,
    projectName,
    projectReference,
    selectedStyleId,
    referenceImage,
    conversationMode,
    activePrompt: dom.promptInput.value,
  };
}

function persistCurrentProject() {
  const project = currentProjectPayload();
  if (project.versionHistory.length === 0) return;
  projectPersistenceQueue = projectPersistenceQueue
    .catch(() => {})
    .then(() => window.axion.saveProject(project))
    .catch((error) => window.axion.debugLog("Project autosave failed", { message: error.message }));
}

function applyLoadedProject(project) {
  appState.setState({
    versionHistory: project.versionHistory,
    versionCursor: project.versionCursor,
    projectName: project.projectName,
    projectReference: project.projectReference,
    selectedStyleId: project.selectedStyleId,
    referenceImage: project.referenceImage,
    conversationMode: project.conversationMode,
  });
  dom.conversationModeToggle.checked = project.conversationMode;
  dom.projectNameInput.value = project.projectName;
  dom.projectReferenceInput.value = project.projectReference;
  renderStyles(project.selectedStyleId);
  referenceSlotRef.setReference(project.referenceImage);
  referenceSlotRef.setHasMatrix(true);
  const original = project.versionHistory[0].image;
  showOriginalImage(`data:${original.mimeType};base64,${original.base64}`);
  renderCurrentVersion();
  updateActionButtonLabel();
  setPrompt(dom.promptInput, project.activePrompt);
}

function projectFileName(filePath) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

async function openProjectFile() {
  if (appState.getState().isBusy) return setStatus(dom.statusBar, t("status.busyWait"), "info");
  if (appState.getState().versionHistory.length > 0 && !window.confirm(t("confirm.openProject"))) return;
  try {
    const result = await window.axion.openProjectFile();
    if (!result) return;
    applyLoadedProject(result.project);
    persistCurrentProject();
    setStatus(dom.statusBar, t("status.projectOpened", { name: projectFileName(result.filePath) }), "success");
  } catch (error) {
    setStatus(dom.statusBar, error.message, "error");
  }
}

async function saveProjectFile() {
  const project = currentProjectPayload();
  if (project.versionHistory.length === 0) return setStatus(dom.statusBar, t("status.projectRequired"), "info");
  const safeName = (project.projectName || "proyecto").replace(/[<>:"/\\|?*]+/g, "-").trim() || "proyecto";
  try {
    const filePath = await window.axion.saveProjectFile({ project, suggestedName: `${safeName}.axion` });
    if (filePath) setStatus(dom.statusBar, t("status.projectSaved", { name: projectFileName(filePath) }), "success");
  } catch (error) {
    setStatus(dom.statusBar, error.message, "error");
  }
}

async function saveActiveProject() {
  const project = currentProjectPayload();
  if (project.versionHistory.length === 0) return setStatus(dom.statusBar, t("status.projectRequired"), "info");
  const safeName = (project.projectName || "proyecto").replace(/[<>:"/\\|?*]+/g, "-").trim() || "proyecto";
  try {
    const filePath = await window.axion.saveActiveProject({ project, suggestedName: `${safeName}.axion` });
    if (filePath) setStatus(dom.statusBar, t("status.projectSaved", { name: projectFileName(filePath) }), "success");
  } catch (error) {
    setStatus(dom.statusBar, error.message, "error");
  }
}

function receiveExternalProject(payload) {
  if (!rendererInitialized) {
    pendingExternalProject = payload;
    return;
  }
  if (payload.error) return setStatus(dom.statusBar, payload.error, "error");
  applyLoadedProject(payload.project);
  persistCurrentProject();
  setStatus(dom.statusBar, t("status.projectOpened", { name: projectFileName(payload.filePath) }), "success");
}

// Undo/Redo bounds check purely against the local array + cursor — no IPC, no Gemini, no
// network. Disabled while busy so a generation in flight can't be interrupted mid-edit.
function updateUndoRedoButtons() {
  const { versionHistory, versionCursor, isBusy } = appState.getState();
  dom.undoButton.disabled = isBusy || versionCursor <= 0;
  dom.redoButton.disabled = isBusy || versionCursor >= versionHistory.length - 1;
}

function updateVersionIndicator() {
  const { versionHistory, versionCursor } = appState.getState();
  const version = versionCursor >= 0 ? versionHistory[versionCursor] : null;
  if (!version) {
    dom.versionIndicator.textContent = "";
    dom.versionIndicator.classList.add("hidden");
    return;
  }

  dom.versionIndicator.textContent =
    versionCursor === 0 && version.prompt === null
      ? t("version.original")
      : t("version.position", { current: versionCursor + 1, total: versionHistory.length });
  dom.versionIndicator.classList.remove("hidden");
}

// Paints whatever version.versionCursor currently points at — including version 0, the
// original: Undo must visibly restore "the previous state", and hiding it behind the empty
// placeholder made Undo look like it did nothing. The placeholder is reserved for the one case
// where there's truly no version loaded at all (versionCursor === -1).
//
// Every visible version is exportable, including an untouched import. That makes Save useful
// as a built-in format converter/compressor: load a PNG (or any supported input) and save it
// directly as JPEG without first spending a Gemini edit or opening another application.
function renderCurrentVersion() {
  const { versionHistory, versionCursor } = appState.getState();
  const version = versionCursor >= 0 ? versionHistory[versionCursor] : null;

  if (!version) {
    clearImage(dom.editedImage, dom.editedPlaceholder);
    dom.copyImageButton.disabled = true;
    dom.useAsOriginalButton.disabled = true;
    dom.saveImageButton.disabled = true;
    dom.editExplanation.textContent = "";
    dom.editExplanation.classList.add("hidden");
  } else {
    const dataUrl = `data:${version.image.mimeType};base64,${version.image.base64}`;
    showImage(dom.editedImage, dom.editedPlaceholder, dataUrl);
    // Copy and Save always apply to whatever image is visible, including a freshly imported
    // original. The native Save dialog decides whether the output is lossless PNG or a
    // compressed JPEG sharing copy.
    dom.copyImageButton.disabled = false;
    dom.useAsOriginalButton.disabled = versionCursor <= 0;
    dom.saveImageButton.disabled = false;
    dom.editExplanation.textContent = version.explanation ?? "";
    dom.editExplanation.classList.toggle("hidden", !version.explanation);
  }
  updateVersionIndicator();
  updateUndoRedoButtons();
}

function setBusy(isBusy) {
  appState.setState({ isBusy });
  dom.editImageButton.disabled = isBusy;
  dom.browseButton.disabled = isBusy;
  dom.addImageButton.disabled = isBusy;
  dom.pasteImageButton.disabled = isBusy;
  referenceSlotRef?.setBusy(isBusy);
  dom.newConversationButton.disabled = isBusy;
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
  const key = quickStylePrompt
    ? "button.applyStyle"
    : versionHistory.length === 0
      ? "button.createImage"
      : "button.editImage";
  dom.editImageButton.setAttribute("data-i18n", key);
  dom.editImageButton.textContent = t(key);
}

// Shared by both "create from nothing" and "edit an existing version" (see handleEditClick) —
// truncates any undone future before appending, so both flows get identical, correct
// version-history bookkeeping. Works unchanged when versionCursor is -1 (no version yet):
// slice(0, 0) is an empty array, so the first push simply becomes version 0.
function pushVersion({ prompt, styleId, image, explanation, modelId, modelTier }) {
  const { versionHistory, versionCursor } = appState.getState();
  const truncated = versionHistory.slice(0, versionCursor + 1);
  truncated.push({
    id: generateId(),
    versionNumber: truncated.length,
    prompt,
    styleId,
    timestamp: Date.now(),
    image,
    ...(explanation ? { explanation } : {}),
    ...(modelId ? { modelId } : {}),
    ...(modelTier ? { modelTier } : {}),
  });
  appState.setState({ versionHistory: truncated, versionCursor: truncated.length - 1 });
  renderCurrentVersion();
  updateActionButtonLabel();
  persistCurrentProject();
}

async function refreshHistory() {
  const entries = await window.axion.listHistory();
  renderHistory(dom.historyList, entries, {
    getStyleIcon,
    onReuse: (entry) => {
      quickStylePrompt = null;
      promptBeforeQuickStyle = null;
      setPrompt(dom.promptInput, entry.prompt);
      if (entry.styleId) {
        appState.setState({ selectedStyleId: entry.styleId });
        renderStyles(entry.styleId);
      }
      updateActionButtonLabel();
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
  activeTemplateId = null;
  appState.setState({ selectedStyleId: styleId });
  renderStyles(styleId);
  const hasImage = appState.getState().versionHistory.length > 0;

  if (styleId && hasImage) {
    if (!quickStylePrompt) promptBeforeQuickStyle = dom.promptInput.value;
    const styleLabel = t(`style.${styleId}`);
    quickStylePrompt = t("style.quickPrompt", { style: styleLabel });
    setPrompt(dom.promptInput, quickStylePrompt);
    setStatus(dom.statusBar, t("status.styleReady", { style: styleLabel }), "info");
  } else if (styleId) {
    quickStylePrompt = null;
    promptBeforeQuickStyle = null;
    setStatus(dom.statusBar, t("status.styleSelectedForCreate", { style: t(`style.${styleId}`) }), "info");
  } else {
    if (quickStylePrompt && dom.promptInput.value === quickStylePrompt) {
      setPrompt(dom.promptInput, promptBeforeQuickStyle ?? "");
    }
    quickStylePrompt = null;
    promptBeforeQuickStyle = null;
    setStatus(dom.statusBar, t("status.styleCleared"), "info");
  }

  updateActionButtonLabel();
  persistCurrentProject();
}

function handleTemplateReuse(template, label) {
  quickStylePrompt = null;
  promptBeforeQuickStyle = null;
  activeTemplateId = template.id;
  appState.setState({ selectedStyleId: null });
  renderStyles(null);
  setPrompt(dom.promptInput, template.prompt);
  updateActionButtonLabel();
  setStatus(dom.statusBar, t("status.templateLoaded", { label }), "info");
}

function renderTemplateLibrary() {
  renderTemplates(dom.templatesList, cachedTemplates, handleTemplateReuse, editPersonalTemplate, deletePersonalTemplate);
}

async function refreshTemplates() {
  cachedTemplates = await window.axion.listTemplates();
  renderTemplateLibrary();
}

function closeTemplateModal() {
  dom.templateModal.classList.add("hidden");
  editingTemplateId = null;
}

function openTemplateModal({ id = null, label = "", prompt }) {
  editingTemplateId = id;
  dom.templateModalTitle.textContent = t(id ? "templates.editTitle" : "templates.createTitle");
  dom.templateNameInput.value = label;
  dom.templatePromptInput.value = prompt;
  dom.templateModal.classList.remove("hidden");
  dom.templateNameInput.focus();
}

function savePersonalTemplate() {
  const prompt = getPrompt(dom.promptInput);
  if (!prompt) {
    setStatus(dom.statusBar, t("templates.promptRequired"), "error");
    dom.promptInput.focus();
    return;
  }
  openTemplateModal({ prompt });
}

function editPersonalTemplate(template) {
  openTemplateModal(template);
}

async function confirmPersonalTemplate() {
  const label = dom.templateNameInput.value.trim();
  const prompt = dom.templatePromptInput.value.trim();
  if (!label) {
    dom.templateNameInput.focus();
    return;
  }
  if (!prompt) {
    dom.templatePromptInput.focus();
    return;
  }
  const wasEditing = Boolean(editingTemplateId);
  if (wasEditing) await window.axion.updateTemplate(editingTemplateId, { label, prompt });
  else await window.axion.saveTemplate({ label, prompt });
  closeTemplateModal();
  await refreshTemplates();
  setStatus(dom.statusBar, t(wasEditing ? "templates.updated" : "templates.saved"), "success");
}

async function deletePersonalTemplate(template) {
  if (!window.confirm(t("templates.deleteConfirm", { label: template.label }))) return;
  await window.axion.deleteTemplate(template.id);
  await refreshTemplates();
  setStatus(dom.statusBar, t("templates.deleted"), "success");
}

// Re-applies the active language across the whole UI at runtime — no restart needed. Static
// copy is refreshed via the data-i18n* walker; the few list-rendered components (style chips,
// templates, history) are just re-rendered with the same already-cached data through their
// normal render functions, since those already read live translations on every render.
async function applyLanguage(locale) {
  const hadQuickStylePrompt = Boolean(quickStylePrompt);
  await loadTranslations(locale);
  applyTranslations(document);
  renderStyles();
  renderTemplateLibrary();
  if (hadQuickStylePrompt) {
    const styleId = appState.getState().selectedStyleId;
    quickStylePrompt = t("style.quickPrompt", { style: t(`style.${styleId}`) });
    setPrompt(dom.promptInput, quickStylePrompt);
  }
  updateActionButtonLabel();
  updateVersionIndicator();
  referenceSlotRef?.setReference(appState.getState().referenceImage);
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
  quickStylePrompt = null;
  promptBeforeQuickStyle = null;
  activeTemplateId = null;
  appState.setState({
    versionHistory: versionHistory.length > 0 ? [versionHistory[0]] : [],
    versionCursor: versionHistory.length > 0 ? 0 : -1,
    selectedStyleId: null,
  });
  setPrompt(dom.promptInput, "");
  renderStyles(null);
  renderCurrentVersion();
  updateActionButtonLabel();
  persistCurrentProject();
}

// "Archivo > Nuevo..." — starts a brand-new project with nothing loaded at all: no source
// file, no version history. The next click on the primary action button *creates* (rather than
// edits) the first image, from whatever the user writes in the same prompt box — see
// handleEditClick(). Purely local: no IPC, no Gemini call.
async function startNewProject() {
  quickStylePrompt = null;
  promptBeforeQuickStyle = null;
  activeTemplateId = null;
  protectedSelection = null;
  appState.setState({
    versionHistory: [],
    versionCursor: -1,
    projectName: "",
    projectReference: "",
    referenceImage: null,
    selectedStyleId: defaultStyleId,
    conversationMode: conversationModeDefault,
  });
  dom.conversationModeToggle.checked = conversationModeDefault;
  renderStyles(defaultStyleId);
  dom.projectNameInput.value = "";
  dom.projectReferenceInput.value = "";
  referenceSlotRef?.setReference(null);
  referenceSlotRef?.setHasMatrix(false);
  clearOriginalImage();
  renderCurrentVersion();
  updateActionButtonLabel();
  setPrompt(dom.promptInput, "");
  // Queue the clear behind any save already started by the old prompt's blur/change event.
  // Awaiting it guarantees the last durable operation is the clear, never the stale save.
  projectPersistenceQueue = projectPersistenceQueue
    .catch(() => {})
    .then(() => window.axion.clearProject());
  try {
    await Promise.all([projectPersistenceQueue, window.axion.detachProjectFile()]);
  } catch (error) {
    window.axion.debugLog("Project reset failed", { message: error.message });
  }
  dom.promptInput.focus();
}

function handleImageSelected(image) {
  window.axion.detachProjectFile().catch((error) => window.axion.debugLog("Project detach failed", { message: error.message }));
  activeTemplateId = null;
  protectedSelection = null;
  const original = {
    id: generateId(),
    versionNumber: 0,
    prompt: null,
    styleId: null,
    timestamp: Date.now(),
    image: { base64: image.base64, mimeType: image.mimeType },
  };
  appState.setState({ versionHistory: [original], versionCursor: 0 });
  referenceSlotRef?.setHasMatrix(true);
  renderCurrentVersion();
  updateActionButtonLabel();
  persistCurrentProject();
  const message = image.wasConverted
    ? t("status.imageLoadedConverted", { format: image.sourceFormat.toUpperCase() })
    : t("status.imageLoaded");
  setStatus(dom.statusBar, message, "success");
}

async function pasteImageFromClipboard() {
  if (appState.getState().isBusy) {
    setStatus(dom.statusBar, t("status.busyWait"), "info");
    return;
  }
  try {
    const image = await window.axion.readClipboardImage();
    if (!image) {
      setStatus(dom.statusBar, t("status.clipboardHasNoImage"), "info");
      return;
    }
    showOriginalImage(`data:${image.mimeType};base64,${image.base64}`);
    handleImageSelected({ ...image, sourceFormat: "png", wasConverted: false });
    setStatus(dom.statusBar, t("status.imagePasted"), "success");
  } catch (error) {
    window.axion.debugLog("Paste Image flow threw", { message: error.message, stack: error.stack });
    setStatus(dom.statusBar, t("error.corruptImage"), "error");
  }
}

function handleUseAsOriginalClick() {
  const { versionHistory, versionCursor } = appState.getState();
  if (versionCursor <= 0) return;
  if (!window.confirm(t("confirm.useAsOriginal"))) return;

  const image = versionHistory[versionCursor].image;
  quickStylePrompt = null;
  promptBeforeQuickStyle = null;
  appState.setState({ selectedStyleId: null });
  renderStyles(null);
  showOriginalImage(`data:${image.mimeType};base64,${image.base64}`);
  handleImageSelected({ ...image, sourceFormat: image.mimeType.split("/")[1] ?? "png", wasConverted: false });
  setPrompt(dom.promptInput, "");
  setStatus(dom.statusBar, t("status.promotedToOriginal"), "success");
}

function handleGlobalPasteShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "v") return;
  const target = event.target;
  const isEditable = target?.matches?.("input, textarea, select, [contenteditable='true']");
  if (isEditable) return;
  event.preventDefault();
  pasteImageFromClipboard();
}

// The single primary-action handler for both "New" and "Edit": which Gemini call it makes
// depends only on whether a project is currently loaded (versionHistory.length === 0 means
// nothing has been created or imported yet — see startNewProject()/ARCHITECTURE.md). Both
// branches converge on the same pushVersion() bookkeeping, so Undo/Redo/History/Save behave
// identically afterward regardless of how version 0 came to exist.
async function handleEditClick() {
  const { versionHistory, versionCursor, selectedStyleId, referenceImage, conversationMode } = appState.getState();
  const modelTier = dom.modelTierSelect.value;
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

  // Developer Mode timing begins before prompt optimization.
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
    window.axion.debugLog("Final prompt ready to send to Gemini", { finalPrompt: promptText });

    // Brief, deliberate confirmation that the instruction was understood, before the (longer)
    // generation wait begins — see DESIGN_PHILOSOPHY.md. Fixed duration, not tied to any
    // network latency.
    setStatus(dom.statusBar, t("status.promptOptimized"), "success");
    await sleep(900);

    setStatus(dom.statusBar, t("status.generating"), "info");

    // Past the very first version, always send the original back too — see
    // ARCHITECTURE.md's "Fidelity anchor": it's what keeps small deviations from one edit from
    // compounding into the next, since the true original never drops out of the conversation.
    let result = isCreating
      ? await window.axion.generateImage({ prompt: promptText, displayPrompt: userPrompt, styleId: selectedStyleId, explanationLanguage: getLocale(), modelTier })
      : await window.axion.editImage({
          prompt: promptText,
          currentImage: { base64: sourceVersion.image.base64, mimeType: sourceVersion.image.mimeType },
          originalImage:
            sourceVersion.versionNumber > 0
              ? { base64: versionHistory[0].image.base64, mimeType: versionHistory[0].image.mimeType }
              : undefined,
          referenceImage: referenceImage ?? undefined,
          displayPrompt: userPrompt,
          styleId: selectedStyleId,
          explanationLanguage: getLocale(),
          modelTier,
        });

    const explanation = result.explanation;
    const generatedModelId = result.modelId;
    const generatedModelTier = result.modelTier;
    if (activeTemplateId === "remove-background") {
      setStatus(dom.statusBar, t("status.removingBackground"), "info");
      result = await makeEdgeBackgroundTransparent(result);
    }

    if (!isCreating && protectedSelection?.sourceId === sourceVersion.id) {
      setStatus(dom.statusBar, t("status.protectedApplying"), "info");
      result = await compositeWithProtectedMask({ source: sourceVersion.image, edited: result, selection: protectedSelection });
      protectedSelection = null;
    }

    // Developer Mode measures paint time and confirms the Edited panel decoded the image.
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
      referenceSlotRef?.setHasMatrix(true);
    }

    pushVersion({
      prompt: userPrompt,
      styleId: selectedStyleId,
      image: { base64: result.base64, mimeType: result.mimeType },
      explanation,
      modelId: generatedModelId,
      modelTier: generatedModelTier,
    });
    recordStyleUse(selectedStyleId);

    activeTemplateId = null;

    setStatus(dom.statusBar, t(isCreating ? "status.createComplete" : "status.editComplete"), "success");
    refreshHistory();
  } catch (error) {
    window.axion.debugLog("Edit Image flow threw", { message: error.message, stack: error.stack });
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
  persistCurrentProject();
}

function handleRedoClick() {
  const { versionHistory, versionCursor, isBusy } = appState.getState();
  if (isBusy || versionCursor >= versionHistory.length - 1) return;
  appState.setState({ versionCursor: versionCursor + 1 });
  renderCurrentVersion();
  persistCurrentProject();
}

function handleAppShortcut(event) {
  const pressed = event.code || event.key;
  if ((pressed === "Escape" || pressed === "Esc") && !dom.protectedSelectionModal.classList.contains("hidden")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    protectedSelectionPanelRef?.close();
    return;
  }
  if ((pressed === "Escape" || pressed === "Esc") && !dom.projectDetailsModal.classList.contains("hidden")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeProjectDetails();
    return;
  }
  if ((pressed === "Escape" || pressed === "Esc") && !dom.settingsModal.classList.contains("hidden")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    settingsModalRef?.close();
    return;
  }

  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

  if (event.key === "," || event.code === "NumpadDecimal") {
    event.preventDefault();
    event.stopImmediatePropagation();
    settingsModalRef?.open();
    return;
  }

  if (event.key.toLowerCase() === "s" && !event.shiftKey) {
    event.preventDefault();
    event.stopImmediatePropagation();
    saveActiveProject();
    return;
  }

  if (event.key.toLowerCase() !== "z") return;
  // Own the shortcut in the renderer so a focused prompt textarea cannot consume the first
  // press as text undo. The native menu only displays the accelerator; it does not register it.
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.shiftKey) handleRedoClick();
  else handleUndoClick();
}

function openProjectDetails() {
  const { projectName, projectReference } = appState.getState();
  dom.projectNameInput.value = projectName;
  dom.projectReferenceInput.value = projectReference;
  dom.projectDetailsModal.classList.remove("hidden");
  dom.projectNameInput.focus();
}

function closeProjectDetails() {
  dom.projectDetailsModal.classList.add("hidden");
}

function openProtectedSelection() {
  const { versionHistory, versionCursor, conversationMode, isBusy } = appState.getState();
  if (isBusy) return setStatus(dom.statusBar, t("status.busyWait"), "info");
  if (versionHistory.length === 0) return setStatus(dom.statusBar, t("status.protectedUnavailable"), "info");
  if (!dom.imagePreviewModal.classList.contains("hidden")) closeImagePreview();
  const sourceVersion = conversationMode ? versionHistory[versionCursor] : versionHistory[0];
  protectedSelectionPanelRef.open({
    id: sourceVersion.id,
    image: sourceVersion.image,
    existingMask: protectedSelection?.sourceId === sourceVersion.id ? protectedSelection : null,
  }).catch((error) => setStatus(dom.statusBar, error.message, "error"));
}

function saveProjectDetails() {
  const projectName = dom.projectNameInput.value.trim();
  const projectReference = dom.projectReferenceInput.value.trim();
  appState.setState({ projectName, projectReference });
  persistCurrentProject();
  closeProjectDetails();
}

async function handleSaveClick() {
  const { versionHistory, versionCursor, projectName, projectReference } = appState.getState();
  if (versionCursor < 0) return;
  const version = versionHistory[versionCursor];
  const { image } = version;

  const identity = [projectReference, projectName]
    .filter(Boolean)
    .join("-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  const suggestedName = `${identity || "axion-edit"}.png`;
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

function handleImageContextMenu(event) {
  event.preventDefault();
  const dataUrl = event.currentTarget.src;
  if (dataUrl) window.axion.showImageContextMenu(dataUrl);
}

function availablePreviewSources() {
  return {
    original: dom.originalImage.classList.contains("hidden") ? null : dom.originalImage.src,
    edited: dom.editedImage.classList.contains("hidden") ? null : dom.editedImage.src,
  };
}

const previewView = { scale: 1, x: 0, y: 0, panning: false, startX: 0, startY: 0, originX: 0, originY: 0 };

function renderPreviewView() {
  const transform = `translate(${previewView.x}px, ${previewView.y}px) scale(${previewView.scale})`;
  dom.imagePreviewFull.style.transform = transform;
  dom.imagePreviewCompare.style.transform = transform;
  dom.previewZoomReset.textContent = `${Math.round(previewView.scale * 100)}%`;
  dom.previewZoomReset.classList.toggle("active", previewView.scale > 1);
  dom.imagePreviewCanvas.classList.toggle("is-zoomed", previewView.scale > 1);
}

function resetPreviewView() {
  previewView.scale = 1;
  previewView.x = 0;
  previewView.y = 0;
  renderPreviewView();
}

function zoomPreview(event) {
  event.preventDefault();
  const previous = previewView.scale;
  const next = Math.max(1, Math.min(8, previous * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
  if (next === previous) return;

  const rect = dom.imagePreviewCanvas.getBoundingClientRect();
  const pointerX = event.clientX - rect.left - rect.width / 2;
  const pointerY = event.clientY - rect.top - rect.height / 2;
  const ratio = next / previous;
  previewView.x = pointerX - (pointerX - previewView.x) * ratio;
  previewView.y = pointerY - (pointerY - previewView.y) * ratio;
  previewView.scale = next;
  renderPreviewView();
}

function startPreviewPan(event) {
  if (previewView.scale <= 1 || (event.button !== 0 && event.button !== 1)) return;
  const comparing = dom.imagePreviewFull.dataset.kind === "compare";
  const rect = dom.imagePreviewCanvas.getBoundingClientRect();
  const dividerX = rect.left + (Number(dom.previewCompareSlider.value) / 100) * rect.width;
  const grabbingDivider = comparing && Math.abs(event.clientX - dividerX) <= 28;
  if (grabbingDivider) return;
  event.preventDefault();
  event.stopPropagation();
  previewView.panning = true;
  previewView.startX = event.clientX;
  previewView.startY = event.clientY;
  previewView.originX = previewView.x;
  previewView.originY = previewView.y;
  dom.imagePreviewCanvas.classList.add("is-panning");
  dom.imagePreviewCanvas.setPointerCapture(event.pointerId);
}

function movePreviewPan(event) {
  if (!previewView.panning) {
    if (previewView.scale > 1 && dom.imagePreviewFull.dataset.kind === "compare") {
      const rect = dom.imagePreviewCanvas.getBoundingClientRect();
      const dividerX = rect.left + (Number(dom.previewCompareSlider.value) / 100) * rect.width;
      dom.previewCompareSlider.style.cursor = Math.abs(event.clientX - dividerX) <= 28 ? "ew-resize" : "grab";
    }
    return;
  }
  previewView.x = previewView.originX + event.clientX - previewView.startX;
  previewView.y = previewView.originY + event.clientY - previewView.startY;
  renderPreviewView();
}

function stopPreviewPan(event) {
  if (!previewView.panning) return;
  previewView.panning = false;
  dom.imagePreviewCanvas.classList.remove("is-panning");
  dom.previewCompareSlider.style.cursor = "";
  if (dom.imagePreviewCanvas.hasPointerCapture(event.pointerId)) dom.imagePreviewCanvas.releasePointerCapture(event.pointerId);
}

function showPreviewImage(kind) {
  const sources = availablePreviewSources();
  const source = sources[kind];
  if (!source) return;

  dom.imagePreviewFull.src = source;
  dom.imagePreviewFull.dataset.kind = kind;
  dom.imagePreviewCompareClip.classList.add("hidden");
  dom.previewCompareScale.classList.add("hidden");
  dom.previewCompareDivider.classList.add("hidden");
  dom.previewCompareSlider.classList.add("hidden");
  dom.previewOriginalButton.classList.toggle("active", kind === "original");
  dom.previewEditedButton.classList.toggle("active", kind === "edited");
  dom.previewCompareButton.classList.remove("active");
  dom.previewOriginalButton.disabled = !sources.original;
  dom.previewEditedButton.disabled = !sources.edited;
  dom.previewCompareButton.disabled = !sources.original || !sources.edited;
  dom.previewPreviousButton.disabled = !sources.original || kind === "original";
  dom.previewNextButton.disabled = !sources.edited || kind === "edited";
}

function updateComparisonPosition(value) {
  const position = Math.max(0, Math.min(100, Number(value) || 0));
  dom.imagePreviewCompareClip.style.clipPath = `inset(0 ${100 - position}% 0 0)`;
  dom.previewCompareDivider.style.left = `${position}%`;
  dom.previewCompareDivider.dataset.position = `${Math.round(position)}%`;
  dom.previewEditedPercent.textContent = `${Math.round(position)}%`;
  dom.previewOriginalPercent.textContent = `${Math.round(100 - position)}%`;
}

function showPreviewComparison() {
  const sources = availablePreviewSources();
  if (!sources.original || !sources.edited) return;

  dom.imagePreviewFull.src = sources.original;
  dom.imagePreviewFull.dataset.kind = "compare";
  dom.imagePreviewCompare.src = sources.edited;
  dom.imagePreviewCompareClip.classList.remove("hidden");
  dom.previewCompareScale.classList.remove("hidden");
  dom.previewCompareDivider.classList.remove("hidden");
  dom.previewCompareSlider.classList.remove("hidden");
  dom.previewOriginalButton.classList.remove("active");
  dom.previewEditedButton.classList.remove("active");
  dom.previewCompareButton.classList.add("active");
  dom.previewOriginalButton.disabled = false;
  dom.previewEditedButton.disabled = false;
  dom.previewCompareButton.disabled = false;
  dom.previewPreviousButton.disabled = false;
  dom.previewNextButton.disabled = false;
  updateComparisonPosition(dom.previewCompareSlider.value);
}

function openImagePreview(kind) {
  showPreviewImage(kind);
  if (!dom.imagePreviewFull.src) return;
  dom.imagePreviewModal.classList.remove("hidden");
  resetPreviewView();
  dom.closeImagePreviewButton.focus();
}

function closeImagePreview() {
  dom.imagePreviewModal.classList.add("hidden");
  dom.imagePreviewFull.removeAttribute("src");
  dom.imagePreviewCompare.removeAttribute("src");
  dom.imagePreviewCompareClip.classList.add("hidden");
  dom.previewCompareScale.classList.add("hidden");
  dom.previewCompareDivider.classList.add("hidden");
  dom.previewCompareSlider.classList.add("hidden");
  delete dom.imagePreviewFull.dataset.kind;
}

function handlePreviewKeydown(event) {
  if (dom.imagePreviewModal.classList.contains("hidden")) return;
  const pressed = event.code || event.key;
  if (!["Escape", "Esc", "ArrowLeft", "ArrowRight"].includes(pressed)) return;

  event.preventDefault();
  event.stopPropagation();
  if (pressed === "Escape" || pressed === "Esc") closeImagePreview();
  if (pressed === "ArrowLeft") showPreviewImage("original");
  if (pressed === "ArrowRight") showPreviewImage("edited");
}

async function init() {
  let projectRestored = false;
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
  recentStyleIds = normalizeRecentStyleIds(config.settings?.recentStyleIds, stylesById.keys());
  defaultStyleId = stylesById.has(config.settings?.defaultStyleId) ? config.settings.defaultStyleId : null;
  conversationModeDefault = config.settings?.conversationModeDefault !== false;
  dom.modelTierSelect.value = config.settings?.modelTier ?? "economy";
  appState.setState({ selectedStyleId: defaultStyleId });
  cachedTemplates = templates;
  renderStyles();
  renderTemplateLibrary();

  dom.conversationModeToggle.checked = conversationModeDefault;
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

  referenceSlotRef = createReferenceSlot({
    containerEl: dom.originalGallery,
    onSelect: (referenceImage) => {
      appState.setState({ referenceImage });
      persistCurrentProject();
      setStatus(dom.statusBar, t("status.referenceLoaded"), "success");
    },
    onRemove: () => {
      appState.setState({ referenceImage: null });
      persistCurrentProject();
      setStatus(dom.statusBar, t("status.referenceRemoved"), "info");
    },
    onError: (error) => setStatus(dom.statusBar, error.message, "error"),
  });

  protectedSelectionPanelRef = createProtectedSelectionPanel({
    elements: {
      overlay: dom.protectedSelectionModal,
      baseCanvas: dom.protectedBaseCanvas,
      maskCanvas: dom.protectedMaskCanvas,
      brushCursor: dom.protectedBrushCursor,
      magicButton: dom.protectedMagicButton,
      brushButton: dom.protectedBrushButton,
      eraserButton: dom.protectedEraserButton,
      handButton: dom.protectedHandButton,
      toleranceInput: dom.protectedTolerance,
      toleranceValue: dom.protectedToleranceValue,
      brushSizeInput: dom.protectedBrushSize,
      brushSizeValue: dom.protectedBrushSizeValue,
      clearButton: dom.protectedClearButton,
      cancelButton: dom.protectedCancelButton,
      confirmButton: dom.protectedConfirmButton,
      closeButton: dom.closeProtectedSelectionButton,
      zoomResetButton: dom.protectedZoomReset,
    },
    onConfirm: (selection) => {
      protectedSelection = selection;
      setStatus(dom.statusBar, t("status.protectedReady"), "success");
    },
    onStatus: (key) => {
      dom.protectedSelectionStatus.textContent = t(key);
    },
  });

  const restoredProject = await window.axion.loadProject();
  if (restoredProject) {
    applyLoadedProject(restoredProject);
    projectRestored = true;
  }

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
    defaultStyleSelectEl: dom.defaultStyleSelect,
    conversationDefaultToggleEl: dom.conversationDefaultToggle,
    defaultModelTierSelectEl: dom.defaultModelTierSelect,
    workProfileSelectEl: dom.workProfileSelect,
    applyWorkProfileButtonEl: dom.applyWorkProfileButton,
    deleteWorkProfileButtonEl: dom.deleteWorkProfileButton,
    workProfileNameInputEl: dom.workProfileNameInput,
    saveWorkProfileButtonEl: dom.saveWorkProfileButton,
    onDefaultStyleChanged: (styleId) => { defaultStyleId = stylesById.has(styleId) ? styleId : null; },
    onConversationDefaultChanged: (enabled) => { conversationModeDefault = enabled; },
    onDefaultModelTierChanged: (tier) => { dom.modelTierSelect.value = tier; },
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

  window.axion.onNewProject(async () => {
    if (appState.getState().isBusy) {
      setStatus(dom.statusBar, t("status.busyWait"), "info");
      return;
    }
    await startNewProject();
    setStatus(dom.statusBar, t("status.newProjectStarted"), "info");
  });
  window.axion.onOpenProjectDetails(openProjectDetails);
  window.axion.onOpenProtectedSelection(openProtectedSelection);
  window.axion.onSetModelTier((tier) => {
    dom.modelTierSelect.value = tier;
    dom.defaultModelTierSelect.value = tier;
    window.axion.setSettings({ modelTier: tier }).catch((error) => {
      window.axion.debugLog("Could not persist menu model tier", { message: error.message });
    });
  });
  window.axion.onOpenProjectFile(openProjectFile);
  window.axion.onSaveProjectFile(saveProjectFile);
  window.axion.onSaveProject(saveActiveProject);
  window.axion.onExternalProject(receiveExternalProject);

  window.axion.onUndo(() => handleUndoClick());
  window.axion.onRedo(() => handleRedoClick());

  dom.conversationModeToggle.addEventListener("change", () => {
    appState.setState({ conversationMode: dom.conversationModeToggle.checked });
    persistCurrentProject();
  });

  dom.newConversationButton.addEventListener("click", () => {
    if (appState.getState().versionHistory.length > 1 && !window.confirm(t("confirm.newConversation"))) return;
    startNewConversation();
    setStatus(dom.statusBar, t("status.newConversationStarted"), "info");
  });

  dom.undoButton.addEventListener("click", handleUndoClick);
  dom.redoButton.addEventListener("click", handleRedoClick);

  dom.editImageButton.addEventListener("click", handleEditClick);
  dom.promptInput.addEventListener("input", () => {
    activeTemplateId = null;
    if (!quickStylePrompt) return;
    quickStylePrompt = null;
    promptBeforeQuickStyle = null;
    updateActionButtonLabel();
  });
  // Persist the draft when editing finishes, not on every keystroke: projects contain large
  // base64 images, so repeatedly rewriting them while the user types would be wasteful.
  dom.promptInput.addEventListener("change", persistCurrentProject);
  dom.copyImageButton.addEventListener("click", handleCopyClick);
  dom.useAsOriginalButton.addEventListener("click", handleUseAsOriginalClick);
  dom.saveImageButton.addEventListener("click", handleSaveClick);
  dom.pasteImageButton.addEventListener("click", pasteImageFromClipboard);
  dom.originalImage.addEventListener("contextmenu", handleImageContextMenu);
  dom.editedImage.addEventListener("contextmenu", handleImageContextMenu);
  dom.imagePreviewFull.addEventListener("contextmenu", handleImageContextMenu);
  dom.originalImage.addEventListener("click", () => openImagePreview("original"));
  dom.editedImage.addEventListener("click", () => openImagePreview("edited"));
  dom.previewOriginalButton.addEventListener("click", () => showPreviewImage("original"));
  dom.previewEditedButton.addEventListener("click", () => showPreviewImage("edited"));
  dom.previewCompareButton.addEventListener("click", showPreviewComparison);
  dom.previewCompareSlider.addEventListener("input", (event) => updateComparisonPosition(event.target.value));
  dom.imagePreviewCanvas.addEventListener("wheel", zoomPreview, { passive: false });
  dom.imagePreviewCanvas.addEventListener("pointerdown", startPreviewPan, true);
  dom.imagePreviewCanvas.addEventListener("pointermove", movePreviewPan);
  dom.imagePreviewCanvas.addEventListener("pointerup", stopPreviewPan);
  dom.imagePreviewCanvas.addEventListener("pointercancel", stopPreviewPan);
  dom.previewZoomReset.addEventListener("click", resetPreviewView);
  dom.saveProjectDetailsButton.addEventListener("click", saveProjectDetails);
  dom.cancelProjectDetailsButton.addEventListener("click", closeProjectDetails);
  dom.closeProjectDetailsButton.addEventListener("click", closeProjectDetails);
  dom.projectDetailsModal.addEventListener("click", (event) => {
    if (event.target === dom.projectDetailsModal) closeProjectDetails();
  });
  dom.previewPreviousButton.addEventListener("click", () => showPreviewImage("original"));
  dom.previewNextButton.addEventListener("click", () => showPreviewImage("edited"));
  dom.closeImagePreviewButton.addEventListener("click", closeImagePreview);
  dom.imagePreviewModal.addEventListener("click", (event) => {
    if (event.target === dom.imagePreviewModal) closeImagePreview();
  });
  window.addEventListener("keydown", handlePreviewKeydown, true);
  window.addEventListener("keydown", handleGlobalPasteShortcut, true);
  window.addEventListener("keydown", handleAppShortcut, true);

  dom.saveTemplateButton.addEventListener("click", () => {
    savePersonalTemplate();
  });
  dom.modelTierSelect.addEventListener("change", () => {
    window.axion.setSettings({ modelTier: dom.modelTierSelect.value }).catch((error) => {
      window.axion.debugLog("Could not persist model tier", { message: error.message });
    });
  });
  dom.confirmTemplateButton.addEventListener("click", () => {
    confirmPersonalTemplate().catch((error) => setStatus(dom.statusBar, error.message, "error"));
  });
  dom.cancelTemplateButton.addEventListener("click", closeTemplateModal);
  dom.closeTemplateModalButton.addEventListener("click", closeTemplateModal);
  dom.templateModal.addEventListener("click", (event) => {
    if (event.target === dom.templateModal) closeTemplateModal();
  });
  dom.templateModal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTemplateModal();
  });

  dom.clearHistoryButton.addEventListener("click", async () => {
    if (!window.confirm(t("confirm.clearHistory"))) return;
    await window.axion.clearHistory();
    refreshHistory();
  });

  if (!config.hasApiKey) {
    setStatus(dom.statusBar, t("error.missingApiKey"), "error");
    settingsModalRef.open();
  } else {
    setStatus(dom.statusBar, t(projectRestored ? "status.projectRestored" : "status.ready"), projectRestored ? "success" : "info");
  }

  rendererInitialized = true;
  if (pendingExternalProject) {
    const projectToOpen = pendingExternalProject;
    pendingExternalProject = null;
    receiveExternalProject(projectToOpen);
  }
}

init();
