// Tiny read/write helpers for the prompt textarea.
export function getPrompt(promptEl) {
  return promptEl.value.trim();
}

export function setPrompt(promptEl, text) {
  promptEl.value = text;
}
