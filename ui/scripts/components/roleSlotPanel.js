import { t } from "../i18n/i18n.js";

export function createReferenceSlot({ containerEl, onSelect, onRemove, onError }) {
  let referenceImage = null;
  let isBusy = false;
  let hasMatrix = false;

  async function loadFromPath(filePath) {
    try {
      const image = await window.axion.loadImage(filePath);
      referenceImage = { base64: image.base64, mimeType: image.mimeType };
      render();
      onSelect(referenceImage);
    } catch (error) {
      onError?.(error);
    }
  }

  async function browse() {
    if (isBusy) return;
    const filePath = await window.axion.openImageDialog();
    if (filePath) await loadFromPath(filePath);
  }

  function remove() {
    if (isBusy || !referenceImage) return;
    referenceImage = null;
    render();
    onRemove();
  }

  function render() {
    containerEl.replaceChildren();
    containerEl.classList.toggle("hidden", !hasMatrix);
    if (!hasMatrix) return;

    const matrixLabel = document.createElement("div");
    matrixLabel.className = "role-slot role-slot-matrix";
    matrixLabel.title = t("reference.matrix.title");
    matrixLabel.textContent = `🧬 ${t("reference.matrix.label")}`;
    containerEl.append(matrixLabel);

    if (!referenceImage) {
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "role-slot role-slot-add";
      addButton.disabled = isBusy;
      addButton.title = t("reference.add.title");
      addButton.textContent = `🎨 + ${t("reference.label")}`;
      addButton.addEventListener("click", browse);
      addButton.addEventListener("dragover", (event) => {
        event.preventDefault();
        addButton.classList.add("drag-over");
      });
      addButton.addEventListener("dragleave", () => addButton.classList.remove("drag-over"));
      addButton.addEventListener("drop", (event) => {
        event.preventDefault();
        addButton.classList.remove("drag-over");
        const file = event.dataTransfer?.files?.[0];
        const filePath = file ? window.axion.getPathForFile(file) : null;
        if (filePath) loadFromPath(filePath);
        else onError?.(new Error(t("dropzone.pathError")));
      });
      containerEl.append(addButton);
      return;
    }

    const filledSlot = document.createElement("div");
    filledSlot.className = "role-slot role-slot-filled";
    filledSlot.title = t("reference.active.title");
    const thumbnail = document.createElement("img");
    thumbnail.className = "gallery-thumb active";
    thumbnail.src = `data:${referenceImage.mimeType};base64,${referenceImage.base64}`;
    thumbnail.alt = t("reference.image.alt");
    thumbnail.addEventListener("click", browse);
    const label = document.createElement("span");
    label.textContent = `🎨 ${t("reference.label")}`;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "role-slot-remove";
    removeButton.disabled = isBusy;
    removeButton.title = t("reference.remove.title");
    removeButton.setAttribute("aria-label", t("reference.remove.title"));
    removeButton.textContent = "×";
    removeButton.addEventListener("click", remove);
    filledSlot.append(thumbnail, label, removeButton);
    containerEl.append(filledSlot);
  }

  function setReference(image) {
    referenceImage = image?.base64 ? { base64: image.base64, mimeType: image.mimeType } : null;
    render();
  }

  function setBusy(nextBusy) {
    isBusy = nextBusy;
    render();
  }

  function setHasMatrix(nextHasMatrix) {
    hasMatrix = Boolean(nextHasMatrix);
    if (!hasMatrix) referenceImage = null;
    render();
  }

  render();
  return { setReference, setBusy, setHasMatrix, browse };
}
