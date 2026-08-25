import { escapeHtml } from "../utils.js";
import { t, tOrDefault } from "../i18n/i18n.js";

function displayLabel(template) {
  return tOrDefault(`template.${template.id}`, template.label);
}

function displayPrompt(template) {
  return tOrDefault(`template.${template.id}.prompt`, template.prompt);
}

export function renderTemplates(containerEl, templates, onReuse, onEdit, onDelete) {
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
      <div class="template-item-heading">
        <div class="template-item-label">${escapeHtml(label)}</div>
        <span class="template-item-action">${escapeHtml(t("templates.use"))} →</span>
      </div>
      <div class="template-item-prompt">${escapeHtml(prompt)}</div>
    `;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.title = t("help.template.body");
    item.addEventListener("click", () => onReuse({ ...template, prompt }, label));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onReuse({ ...template, prompt }, label);
      }
    });

    if (!template.builtIn) {
      const actions = document.createElement("div");
      actions.className = "template-personal-actions";
      actions.innerHTML = `
        <button type="button" class="text-button">${escapeHtml(t("templates.edit"))}</button>
        <button type="button" class="text-button danger-text">${escapeHtml(t("templates.delete"))}</button>
      `;
      const [editButton, deleteButton] = actions.querySelectorAll("button");
      for (const button of [editButton, deleteButton]) {
        button.addEventListener("click", (event) => event.stopPropagation());
        button.addEventListener("keydown", (event) => event.stopPropagation());
      }
      editButton.addEventListener("click", () => onEdit(template));
      deleteButton.addEventListener("click", () => onDelete(template));
      item.appendChild(actions);
    }
    containerEl.appendChild(item);
  });
}
