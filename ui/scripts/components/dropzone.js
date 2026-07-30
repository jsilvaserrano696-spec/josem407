// Handles drag & drop and the "Browse files…" fallback. Both paths converge on the same
// onImageSelected callback so app.js has one place to react to a new image.
import { t } from "../i18n/i18n.js";

export function initDropzone({
  dropzoneEl,
  browseButtonEl,
  addImageButtonEl,
  originalImageEl,
  onImageSelected,
  onError,
}) {
  const contentEl = dropzoneEl.querySelector(".dropzone-content");

  async function loadFromPath(filePath) {
    try {
      const { base64, mimeType, sourceFormat, wasConverted } = await window.axion.loadImage(filePath);
      const dataUrl = `data:${mimeType};base64,${base64}`;
      originalImageEl.src = dataUrl;
      originalImageEl.classList.remove("hidden");
      contentEl.classList.add("hidden");
      onImageSelected({ filePath, base64, dataUrl, mimeType, sourceFormat, wasConverted });
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

    const filePath = window.axion.getPathForFile(file);
    if (!filePath) {
      onError?.(new Error(t("dropzone.pathError")));
      return;
    }
    loadFromPath(filePath);
  });

  // Opens the native file picker and loads whatever was chosen. This is the single trigger
  // behind three entry points that must all behave identically: the dropzone's inline
  // "Browse files…" button (empty state only), the panel header's persistent "Add image"
  // button (always visible, lets the user replace the image at any time), and the
  // File > Open Image… menu item (wired in app.js via window.axion.onOpenImage).
  async function browseForImage() {
    const filePath = await window.axion.openImageDialog();
    if (filePath) {
      loadFromPath(filePath);
    }
  }

  browseButtonEl.addEventListener("click", browseForImage);
  addImageButtonEl?.addEventListener("click", browseForImage);

  // For the "New" project flow (app.js): the first generated image has no source file, but the
  // Original panel should still show it — it's literally what the project started from. Exposed
  // here rather than duplicated in app.js since this module already owns originalImageEl/contentEl.
  function showOriginalImage(dataUrl) {
    originalImageEl.src = dataUrl;
    originalImageEl.classList.remove("hidden");
    contentEl.classList.add("hidden");
  }

  function clearOriginalImage() {
    originalImageEl.removeAttribute("src");
    originalImageEl.classList.add("hidden");
    contentEl.classList.remove("hidden");
  }

  return { browseForImage, showOriginalImage, clearOriginalImage };
}
