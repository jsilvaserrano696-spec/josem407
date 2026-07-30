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
  onStatusChange,
  onLanguageChanged,
}) {
  // undefined = modal never opened yet (nothing to refresh); null = no key configured;
  // string = the last masked key shown. Tracked so refreshDynamicLabels() can re-translate the
  // status line on a live language change without an extra IPC round-trip.
  let lastMaskedKey;

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

  return { open, close, refreshDynamicLabels };
}
