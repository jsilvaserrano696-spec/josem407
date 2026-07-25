// Renders the sidebar's prompt history: favorites first, then newest-first. Each entry can be
// clicked to reuse its prompt (and style, if it had one), starred, or deleted.
import { escapeHtml, formatTimestamp } from "../utils.js";

export function renderHistory(containerEl, entries, { onReuse, onDelete, onToggleFavorite, getStyleIcon }) {
  containerEl.innerHTML = "";

  if (entries.length === 0) {
    containerEl.innerHTML = '<li class="empty-state">No edits yet. Your prompt history will show up here.</li>';
    return;
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return b.timestamp - a.timestamp;
  });

  sorted.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "history-item";

    const styleIcon = entry.styleId ? getStyleIcon?.(entry.styleId) ?? "" : "";

    item.innerHTML = `
      <div class="history-item-row">
        <div class="history-item-meta">
          <div class="history-item-time">${formatTimestamp(entry.timestamp)}${styleIcon ? ` · ${styleIcon}` : ""}</div>
          <div class="history-item-prompt">${escapeHtml(entry.prompt)}</div>
        </div>
        <div class="history-item-actions">
          <button type="button" class="favorite-btn ${entry.favorite ? "favorited" : ""}" title="Favorite">★</button>
          <button type="button" class="delete-btn" title="Delete">🗑</button>
        </div>
      </div>
    `;

    item.querySelector(".history-item-meta").addEventListener("click", () => onReuse(entry));
    item.querySelector(".favorite-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      onToggleFavorite(entry.id);
    });
    item.querySelector(".delete-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      onDelete(entry.id);
    });

    containerEl.appendChild(item);
  });
}
