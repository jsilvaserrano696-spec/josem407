// Handles drag & drop and the "Browse files…" fallback. Both paths converge on the same
// onImageSelected callback so app.js has one place to react to a new image.
export function initDropzone({ dropzoneEl, browseButtonEl, originalImageEl, onImageSelected, onError }) {
  const contentEl = dropzoneEl.querySelector(".dropzone-content");

  async function loadFromPath(filePath) {
    try {
      const { base64, mimeType, sourceFormat, wasConverted } = await window.nanoBanana.loadImage(filePath);
      const dataUrl = `data:${mimeType};base64,${base64}`;
      originalImageEl.src = dataUrl;
      originalImageEl.classList.remove("hidden");
      contentEl.classList.add("hidden");
      onImageSelected({ filePath, dataUrl, mimeType, sourceFormat, wasConverted });
    } catch (error) {
      onError?.(error);
    }
  }

  dropzoneEl.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzoneEl.classList.add("drag-over");
  });

  dropzoneEl.addEventListener("dragleave", () => {
    dropzoneEl.classList.remove("drag-over");
  });

  dropzoneEl.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzoneEl.classList.remove("drag-over");

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;

    const filePath = window.nanoBanana.getPathForFile(file);
    if (!filePath) {
      onError?.(new Error("Could not resolve the dropped file's path."));
      return;
    }
    loadFromPath(filePath);
  });

  browseButtonEl.addEventListener("click", async () => {
    const filePath = await window.nanoBanana.openImageDialog();
    if (filePath) {
      loadFromPath(filePath);
    }
  });
}
