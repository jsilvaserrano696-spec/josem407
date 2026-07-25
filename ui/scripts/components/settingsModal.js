// Settings modal: view/replace the Gemini API key and toggle "always optimize prompts". Reads
// and writes through the same configStore-backed IPC calls the rest of the app uses, so there's
// a single source of truth for these values.
export function wireSettingsModal({
  overlayEl,
  openButtonEl,
  closeButtonEl,
  apiKeyInputEl,
  apiKeyStatusEl,
  saveApiKeyButtonEl,
  autoOptimizeToggleEl,
  onStatusChange,
  onSettingsChanged,
}) {
  async function open() {
    const config = await window.nanoBanana.getConfig();
    apiKeyStatusEl.textContent = config.hasApiKey
      ? `Current key: ${config.maskedApiKey}`
      : "No key configured yet.";
    apiKeyInputEl.value = "";
    autoOptimizeToggleEl.checked = Boolean(config.settings?.alwaysOptimizePrompts);
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
      onStatusChange("Enter an API key before saving.", "error");
      return;
    }
    const result = await window.nanoBanana.setApiKey(apiKey);
    apiKeyStatusEl.textContent = `Current key: ${result.maskedApiKey}`;
    apiKeyInputEl.value = "";
    onStatusChange("API key saved.", "success");
  });

  autoOptimizeToggleEl.addEventListener("change", async () => {
    const settings = await window.nanoBanana.setSettings({
      alwaysOptimizePrompts: autoOptimizeToggleEl.checked,
    });
    onSettingsChanged(settings);
  });

  return { open, close };
}
