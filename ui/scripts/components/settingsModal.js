// Settings modal: view/replace the access key and pick the UI language. Reads and writes
// through the same configStore-backed IPC calls the rest of the app uses, so there's a single
// source of truth for these values.
import { t } from "../i18n/i18n.js";

export function wireSettingsModal({
  overlayEl,
  openButtonEl,
  closeButtonEl,
  apiKeyInputEl,
  apiKeyStatusEl,
  saveApiKeyButtonEl,
  toggleKeyVisibilityButtonEl,
  pasteApiKeyButtonEl,
  languageSelectEl,
  defaultStyleSelectEl,
  conversationDefaultToggleEl,
  defaultModelTierSelectEl,
  workProfileSelectEl,
  applyWorkProfileButtonEl,
  deleteWorkProfileButtonEl,
  workProfileNameInputEl,
  saveWorkProfileButtonEl,
  onDefaultStyleChanged,
  onConversationDefaultChanged,
  onDefaultModelTierChanged,
  onStatusChange,
  onLanguageChanged,
}) {
  // undefined = modal never opened yet (nothing to refresh); null = no key configured;
  // string = the last masked key shown. Tracked so refreshDynamicLabels() can re-translate the
  // status line on a live language change without an extra IPC round-trip.
  let lastMaskedKey;
  let workProfiles = [];

  function renderWorkProfiles(selectedId = "") {
    if (!workProfileSelectEl) return;
    workProfileSelectEl.replaceChildren();
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = t("settings.profiles.none");
    workProfileSelectEl.appendChild(emptyOption);
    for (const profile of workProfiles) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.name;
      workProfileSelectEl.appendChild(option);
    }
    workProfileSelectEl.value = workProfiles.some(({ id }) => id === selectedId) ? selectedId : "";
  }

  function updateApiKeyStatus(maskedKey) {
    lastMaskedKey = maskedKey;
    apiKeyStatusEl.textContent = maskedKey
      ? t("settings.apiKey.currentKey", { maskedKey })
      : t("settings.apiKey.noKey");
  }

  function setKeyVisible(visible) {
    apiKeyInputEl.type = visible ? "text" : "password";
    toggleKeyVisibilityButtonEl.textContent = visible ? "🙈" : "👁";
    toggleKeyVisibilityButtonEl.title = visible ? t("settings.apiKey.hide.title") : t("settings.apiKey.show.title");
    toggleKeyVisibilityButtonEl.setAttribute(
      "aria-label",
      visible ? t("settings.apiKey.hide.ariaLabel") : t("settings.apiKey.show.ariaLabel")
    );
  }

  // Refreshes the modal's few JS-driven (not data-i18n-tagged) labels after a live language
  // switch — everything else in the modal is static markup already covered by app.js's
  // applyTranslations(document) pass.
  function refreshDynamicLabels() {
    if (lastMaskedKey !== undefined) {
      updateApiKeyStatus(lastMaskedKey);
    }
    setKeyVisible(apiKeyInputEl.type === "text");
  }

  async function open() {
    const config = await window.axion.getConfig();
    updateApiKeyStatus(config.hasApiKey ? config.maskedApiKey : null);
    apiKeyInputEl.value = "";
    // Always start hidden, regardless of how the modal was last left — a password-style field
    // should default to masked every time it's (re)opened.
    setKeyVisible(false);
    if (languageSelectEl && config.settings?.language) {
      languageSelectEl.value = config.settings.language;
    }
    if (defaultStyleSelectEl) defaultStyleSelectEl.value = config.settings?.defaultStyleId ?? "";
    if (conversationDefaultToggleEl) {
      conversationDefaultToggleEl.checked = config.settings?.conversationModeDefault !== false;
    }
    if (defaultModelTierSelectEl) defaultModelTierSelectEl.value = config.settings?.modelTier ?? "economy";
    workProfiles = Array.isArray(config.settings?.workProfiles) ? config.settings.workProfiles : [];
    renderWorkProfiles();
    overlayEl.classList.remove("hidden");
  }

  function close() {
    overlayEl.classList.add("hidden");
  }

  openButtonEl.addEventListener("click", open);
  closeButtonEl.addEventListener("click", close);
  overlayEl.addEventListener("click", (event) => {
    if (event.target === overlayEl) close();
  });

  saveApiKeyButtonEl.addEventListener("click", async () => {
    const apiKey = apiKeyInputEl.value.trim();
    if (!apiKey) {
      onStatusChange(t("settings.apiKey.enterFirst"), "error");
      return;
    }
    const result = await window.axion.setApiKey(apiKey);
    updateApiKeyStatus(result.maskedApiKey);
    apiKeyInputEl.value = "";
    setKeyVisible(false);
    onStatusChange(t("settings.apiKey.saved"), "success");
  });

  toggleKeyVisibilityButtonEl.addEventListener("click", () => {
    setKeyVisible(apiKeyInputEl.type === "password");
  });

  pasteApiKeyButtonEl.addEventListener("click", async () => {
    const text = (await window.axion.readClipboardText())?.trim();
    if (!text) {
      onStatusChange(t("settings.clipboard.empty"), "error");
      return;
    }
    apiKeyInputEl.value = text;
    apiKeyInputEl.focus();
  });

  languageSelectEl?.addEventListener("change", async () => {
    const locale = languageSelectEl.value;
    await window.axion.setSettings({ language: locale });
    await onLanguageChanged?.(locale);
  });

  defaultStyleSelectEl?.addEventListener("change", async () => {
    const styleId = defaultStyleSelectEl.value || null;
    await window.axion.setSettings({ defaultStyleId: styleId });
    onDefaultStyleChanged?.(styleId);
  });

  conversationDefaultToggleEl?.addEventListener("change", async () => {
    await window.axion.setSettings({ conversationModeDefault: conversationDefaultToggleEl.checked });
    onConversationDefaultChanged?.(conversationDefaultToggleEl.checked);
  });

  defaultModelTierSelectEl?.addEventListener("change", async () => {
    const tier = defaultModelTierSelectEl.value;
    await window.axion.setSettings({ modelTier: tier });
    onDefaultModelTierChanged?.(tier);
  });

  applyWorkProfileButtonEl?.addEventListener("click", async () => {
    const profile = workProfiles.find(({ id }) => id === workProfileSelectEl.value);
    if (!profile) return;
    defaultStyleSelectEl.value = profile.defaultStyleId ?? "";
    conversationDefaultToggleEl.checked = profile.conversationModeDefault;
    defaultModelTierSelectEl.value = profile.modelTier;
    await window.axion.setSettings({
      defaultStyleId: profile.defaultStyleId,
      conversationModeDefault: profile.conversationModeDefault,
      modelTier: profile.modelTier,
    });
    onDefaultStyleChanged?.(profile.defaultStyleId);
    onConversationDefaultChanged?.(profile.conversationModeDefault);
    onDefaultModelTierChanged?.(profile.modelTier);
    onStatusChange(t("settings.profiles.applied"), "success");
  });

  saveWorkProfileButtonEl?.addEventListener("click", async () => {
    const name = workProfileNameInputEl.value.trim();
    if (!name) {
      workProfileNameInputEl.focus();
      return;
    }
    const selectedId = workProfileSelectEl.value;
    const existingIndex = workProfiles.findIndex(({ id }) => id === selectedId);
    if (existingIndex === -1 && workProfiles.length >= 20) {
      onStatusChange(t("settings.profiles.limit"), "error");
      return;
    }
    const profile = {
      id: existingIndex >= 0 ? selectedId : `profile-${crypto.randomUUID()}`,
      name,
      defaultStyleId: defaultStyleSelectEl.value || null,
      conversationModeDefault: conversationDefaultToggleEl.checked,
      modelTier: defaultModelTierSelectEl.value,
    };
    if (existingIndex >= 0) workProfiles[existingIndex] = profile;
    else workProfiles.push(profile);
    const settings = await window.axion.setSettings({ workProfiles });
    workProfiles = settings.workProfiles;
    renderWorkProfiles(profile.id);
    workProfileNameInputEl.value = profile.name;
    onStatusChange(t("settings.profiles.saved"), "success");
  });

  deleteWorkProfileButtonEl?.addEventListener("click", async () => {
    const profile = workProfiles.find(({ id }) => id === workProfileSelectEl.value);
    if (!profile || !window.confirm(t("settings.profiles.deleteConfirm", { name: profile.name }))) return;
    const settings = await window.axion.setSettings({ workProfiles: workProfiles.filter(({ id }) => id !== profile.id) });
    workProfiles = settings.workProfiles;
    renderWorkProfiles();
    workProfileNameInputEl.value = "";
    onStatusChange(t("settings.profiles.deleted"), "success");
  });

  workProfileSelectEl?.addEventListener("change", () => {
    const profile = workProfiles.find(({ id }) => id === workProfileSelectEl.value);
    workProfileNameInputEl.value = profile?.name ?? "";
  });

  return { open, close, refreshDynamicLabels };
}
