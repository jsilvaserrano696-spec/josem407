// Renders the sidebar's built-in template list. Read-only for now (seeded server-side in
// src/prompts/promptTemplates.js) — the extension point for a full "save as template" manager.
import { escapeHtml } from "../utils.js";

export function renderTemplates(containerEl, templates, onReuse) {
  containerEl.innerHTML = "";

  if (templates.length === 0) {
    containerEl.innerHTML = '<li class="empty-state">No templates yet.</li>';
    return;
  }

  templates.forEach((template) => {
    const item = document.createElement("li");
    item.className = "template-item";
    item.innerHTML = `
      <div class="template-item-label">${escapeHtml(template.label)}</div>
      <div class="template-item-prompt">${escapeHtml(template.prompt)}</div>
    `;
    item.addEventListener("click", () => onReuse(template));
    containerEl.appendChild(item);
  });
}
