// Tiny read/write helpers for the prompt textarea, plus the rule for merging a style fragment
// into a base prompt when the optimizer isn't the one doing the merging (e.g. a direct edit
// with no "Improve Prompt" step). Centralized here so app.js and any future caller apply the
// exact same merge rule.
export function getPrompt(promptEl) {
  return promptEl.value.trim();
}

export function setPrompt(promptEl, text) {
  promptEl.value = text;
}

export function mergeStyleFragment(basePrompt, style) {
  if (!style) return basePrompt;
  if (!basePrompt) return style.promptFragment;
  return `${basePrompt}, ${style.promptFragment}`;
}
