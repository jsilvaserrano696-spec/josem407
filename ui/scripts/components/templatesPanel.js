// Renders the sidebar's built-in template list. Read-only for now (seeded server-side in
// src/prompts/promptTemplates.js) — the extension point for a full "save as template" manager.
import { escapeHtml } from "../utils.js";
import { t, tOrDefault } from "../i18n/i18n.js";

// Both the label and the prompt text are translated (via translation keys namespaced by the
// seed template's stable id) — see DESIGN_PHILOSOPHY.md: the user should never see (or have
// inserted into their own prompt box) raw English text they didn't write. A template with no
// matching translation key (e.g. a future user-added one) falls back to its own stored
// label/prompt, which is correct for user-generated content — there's nothing to translate.
function displayLabel(template) {
  return tOrDefault(`template.${template.id}`, template.label);
}

function displayPrompt(template) {
  return tOrDefault(`template.${template.id}.prompt`, template.prompt);
}

export function renderTemplates(containerEl, templates, onReuse) {
  containerEl.innerHTML = "";

  if (templates.length === 0) {
    containerEl.innerHTML = `<li class="empty-state">${escapeHtml(t("templates.empty"))}</li>`;
    return;
  }

  templates.forEach((template) => {
    const label = displayLabel(template);
    const prompt = displayPrompt(template);
    const item = document.createElement("li");
    item.className = "template-item";
    item.innerHTML = `
      <div class="template-item-label">${escapeHtml(label)}</div>
      <div class="template-item-prompt">${escapeHtml(prompt)}</div>
    `;
    // Pass the already-localized prompt through, not the raw stored one — app.js's
    // handleTemplateReuse() fills the user's prompt box with whatever `template.prompt` is
    // handed here.
    item.addEventListener("click", () => onReuse({ ...template, prompt }, label));
    containerEl.appendChild(item);
  });
}
