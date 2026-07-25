// Renders the horizontal row of style chips (Photorealistic, Oil Painting, …). Selecting a
// chip toggles it (click again to deselect) and reports the new selection up to app.js, which
// owns whether/how the fragment gets woven into the prompt.
export function renderStyleLibrary(containerEl, styles, selectedStyleId, onSelect) {
  containerEl.innerHTML = "";

  styles.forEach((style) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "style-chip" + (style.id === selectedStyleId ? " selected" : "");
    chip.dataset.styleId = style.id;
    chip.innerHTML = `<span>${style.icon}</span><span>${style.label}</span>`;
    chip.addEventListener("click", () => {
      const nextSelected = style.id === selectedStyleId ? null : style.id;
      onSelect(nextSelected);
    });
    containerEl.appendChild(chip);
  });
}
