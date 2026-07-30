// Renders the horizontal row of style chips (Photorealistic, Oil Painting, …). Selecting a
// chip toggles it (click again to deselect) and reports the new selection up to app.js, which
// owns whether/how the fragment gets woven into the prompt.
import { tOrDefault } from "../i18n/i18n.js";

// Only the display label is translated, by id — style.promptFragment is sent to Gemini as-is,
// regardless of UI language (translating it would change generation input/quality).
export function renderStyleLibrary(containerEl, styles, selectedStyleId, onSelect) {
  containerEl.innerHTML = "";

  styles.forEach((style) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "style-chip" + (style.id === selectedStyleId ? " selected" : "");
    chip.dataset.styleId = style.id;
    chip.innerHTML = `<span>${style.icon}</span><span>${tOrDefault(`style.${style.id}`, style.label)}</span>`;
    chip.addEventListener("click", () => {
      const nextSelected = style.id === selectedStyleId ? null : style.id;
      onSelect(nextSelected);
    });
    containerEl.appendChild(chip);
  });
}
