import { floodSelect, paintMaskCircle } from "../services/maskSelection.mjs";

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo preparar la imagen para la selección."));
    image.src = dataUrl;
  });
}

export function createProtectedSelectionPanel({ elements, onConfirm, onStatus }) {
  const { overlay, baseCanvas, maskCanvas, brushCursor, magicButton, brushButton, eraserButton, handButton, toleranceInput, toleranceValue, brushSizeInput, brushSizeValue, clearButton, cancelButton, confirmButton, closeButton, zoomResetButton } = elements;
  let sourceImage = null;
  let sourceId = null;
  let pixels = null;
  let mask = null;
  let tool = "magic";
  let painting = false;
  let lastPoint = null;
  let pendingChanges = null;
  let undoStack = [];
  let redoStack = [];
  let lastCursorEvent = null;
  const HISTORY_LIMIT = 30;
  const DENSE_CHANGE_THRESHOLD = 262_144;
  const view = { scale: 1, x: 0, y: 0, startX: 0, startY: 0, originX: 0, originY: 0 };

  function createChangeSet() {
    let indices = [];
    let bitmap = null;
    let count = 0;
    return {
      push(index) {
        count += 1;
        if (bitmap) {
          bitmap[index] = 1;
          return;
        }
        indices.push(index);
        if (indices.length < DENSE_CHANGE_THRESHOLD) return;
        bitmap = new Uint8Array(mask.length);
        for (const changedIndex of indices) bitmap[changedIndex] = 1;
        indices = null;
      },
      get count() { return count; },
      compact() {
        return bitmap
          ? { bitmap, count }
          : { indices: Int32Array.from(indices), count };
      },
    };
  }

  function renderView() {
    const transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    baseCanvas.style.transform = transform;
    maskCanvas.style.transform = transform;
    zoomResetButton.textContent = `${Math.round(view.scale * 100)}%`;
    zoomResetButton.classList.toggle("active", view.scale > 1);
  }

  function resetView() {
    view.scale = 1;
    view.x = 0;
    view.y = 0;
    renderView();
  }

  function setTool(nextTool) {
    tool = nextTool;
    magicButton.classList.toggle("active", tool === "magic");
    brushButton.classList.toggle("active", tool === "brush");
    eraserButton.classList.toggle("active", tool === "eraser");
    handButton.classList.toggle("active", tool === "hand");
    maskCanvas.dataset.tool = tool;
    brushCursor.dataset.tool = tool;
    if (tool !== "brush" && tool !== "eraser") brushCursor.classList.add("hidden");
    else updateBrushCursor();
  }

  function updateBrushCursor(event = lastCursorEvent) {
    if (!event || (tool !== "brush" && tool !== "eraser")) return;
    const stageRect = maskCanvas.parentElement.getBoundingClientRect();
    const canvasRect = maskCanvas.getBoundingClientRect();
    const imageScale = Math.min(canvasRect.width / maskCanvas.width, canvasRect.height / maskCanvas.height);
    const diameter = Math.max(2, Number(brushSizeInput.value) * imageScale);
    brushCursor.style.left = `${event.clientX - stageRect.left}px`;
    brushCursor.style.top = `${event.clientY - stageRect.top}px`;
    brushCursor.style.width = `${diameter}px`;
    brushCursor.style.height = `${diameter}px`;
    brushCursor.classList.remove("hidden");
  }

  function renderMask() {
    const context = maskCanvas.getContext("2d");
    context.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    const overlayPixels = context.createImageData(maskCanvas.width, maskCanvas.height);
    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index]) continue;
      const offset = index * 4;
      overlayPixels.data[offset] = 255;
      overlayPixels.data[offset + 1] = 55;
      overlayPixels.data[offset + 2] = 45;
      overlayPixels.data[offset + 3] = Math.round(mask[index] * 0.32);
    }
    context.putImageData(overlayPixels, 0, 0);
  }

  function commitChange(changes, before, after) {
    const count = changes?.count ?? changes?.length ?? 0;
    if (!count) return;
    const compactChanges = typeof changes.compact === "function"
      ? changes.compact()
      : { indices: Int32Array.from(changes), count };
    undoStack.push({ ...compactChanges, before, after });
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
  }

  function applyHistoryEntry(entry, value) {
    if (entry.bitmap) {
      for (let index = 0; index < entry.bitmap.length; index += 1) {
        if (entry.bitmap[index]) mask[index] = value;
      }
    } else {
      for (const index of entry.indices) mask[index] = value;
    }
    renderMask();
  }

  function undo() {
    const entry = undoStack.pop();
    if (!entry) return onStatus("protected.status.nothingToUndo");
    applyHistoryEntry(entry, entry.before);
    redoStack.push(entry);
    onStatus("protected.status.undone");
  }

  function redo() {
    const entry = redoStack.pop();
    if (!entry) return onStatus("protected.status.nothingToRedo");
    applyHistoryEntry(entry, entry.after);
    undoStack.push(entry);
    onStatus("protected.status.redone");
  }

  function pointFromEvent(event) {
    const rect = maskCanvas.getBoundingClientRect();
    const scale = Math.min(rect.width / maskCanvas.width, rect.height / maskCanvas.height);
    const displayedWidth = maskCanvas.width * scale;
    const displayedHeight = maskCanvas.height * scale;
    const left = rect.left + (rect.width - displayedWidth) / 2;
    const top = rect.top + (rect.height - displayedHeight) / 2;
    const x = (event.clientX - left) / scale;
    const y = (event.clientY - top) / scale;
    if (x < 0 || y < 0 || x >= maskCanvas.width || y >= maskCanvas.height) return null;
    return { x, y };
  }

  function paintBetween(from, to, erase) {
    const radius = Number(brushSizeInput.value) / 2;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)));
    const context = maskCanvas.getContext("2d");
    context.save();
    context.globalCompositeOperation = erase ? "destination-out" : "source-over";
    context.fillStyle = "rgba(255, 55, 45, 0.32)";
    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      const x = from.x + (to.x - from.x) * ratio;
      const y = from.y + (to.y - from.y) * ratio;
      paintMaskCircle({
        mask,
        width: maskCanvas.width,
        height: maskCanvas.height,
        x,
        y,
        radius,
        erase,
        changedIndices: pendingChanges,
      });
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function pointerDown(event) {
    if (tool === "hand") {
      if (view.scale <= 1) return;
      event.preventDefault();
      painting = true;
      view.startX = event.clientX;
      view.startY = event.clientY;
      view.originX = view.x;
      view.originY = view.y;
      maskCanvas.classList.add("is-panning");
      maskCanvas.setPointerCapture(event.pointerId);
      return;
    }
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    if (tool === "magic") {
      onStatus("protected.status.detecting");
      const changedIndices = createChangeSet();
      floodSelect({ pixels, width: maskCanvas.width, height: maskCanvas.height, x: point.x, y: point.y, tolerance: toleranceInput.value, mask, changedIndices });
      commitChange(changedIndices, 0, 255);
      renderMask();
      onStatus("protected.status.detected");
      return;
    }
    painting = true;
    lastPoint = point;
    pendingChanges = createChangeSet();
    maskCanvas.setPointerCapture(event.pointerId);
    paintBetween(point, point, tool === "eraser");
  }

  function pointerMove(event) {
    lastCursorEvent = event;
    updateBrushCursor(event);
    if (!painting) return;
    if (tool === "hand") {
      view.x = view.originX + event.clientX - view.startX;
      view.y = view.originY + event.clientY - view.startY;
      renderView();
      return;
    }
    const point = pointFromEvent(event);
    if (!point) return;
    paintBetween(lastPoint, point, tool === "eraser");
    lastPoint = point;
  }

  function pointerUp(event) {
    if (!painting) return;
    painting = false;
    lastPoint = null;
    if (tool === "brush" || tool === "eraser") {
      commitChange(pendingChanges, tool === "eraser" ? 255 : 0, tool === "eraser" ? 0 : 255);
      pendingChanges = null;
    }
    maskCanvas.classList.remove("is-panning");
    if (maskCanvas.hasPointerCapture(event.pointerId)) maskCanvas.releasePointerCapture(event.pointerId);
  }

  function close() {
    overlay.classList.add("hidden");
    painting = false;
    lastPoint = null;
    sourceImage = null;
    sourceId = null;
    pixels = null;
    mask = null;
    pendingChanges = null;
    undoStack = [];
    redoStack = [];
    lastCursorEvent = null;
    brushCursor.classList.add("hidden");
    baseCanvas.width = 1;
    baseCanvas.height = 1;
    maskCanvas.width = 1;
    maskCanvas.height = 1;
  }

  async function open({ id, image, existingMask }) {
    sourceId = id;
    sourceImage = await loadImage(`data:${image.mimeType};base64,${image.base64}`);
    baseCanvas.width = sourceImage.naturalWidth;
    baseCanvas.height = sourceImage.naturalHeight;
    maskCanvas.width = sourceImage.naturalWidth;
    maskCanvas.height = sourceImage.naturalHeight;
    const context = baseCanvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(sourceImage, 0, 0);
    pixels = context.getImageData(0, 0, baseCanvas.width, baseCanvas.height).data;
    mask = existingMask?.width === baseCanvas.width && existingMask?.height === baseCanvas.height
      ? new Uint8Array(existingMask.mask)
      : new Uint8Array(baseCanvas.width * baseCanvas.height);
    undoStack = [];
    redoStack = [];
    renderMask();
    resetView();
    setTool("magic");
    overlay.classList.remove("hidden");
    onStatus("protected.status.clickColor");
  }

  magicButton.addEventListener("click", () => setTool("magic"));
  brushButton.addEventListener("click", () => setTool("brush"));
  eraserButton.addEventListener("click", () => setTool("eraser"));
  handButton.addEventListener("click", () => setTool("hand"));
  toleranceInput.addEventListener("input", () => {
    toleranceValue.textContent = toleranceInput.value;
  });
  brushSizeInput.addEventListener("input", () => {
    brushSizeValue.textContent = `${brushSizeInput.value} px`;
    updateBrushCursor();
  });
  zoomResetButton.addEventListener("click", resetView);
  maskCanvas.parentElement.addEventListener("wheel", (event) => {
    event.preventDefault();
    const previous = view.scale;
    const next = Math.max(1, Math.min(8, previous * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
    if (next === previous) return;
    const rect = maskCanvas.parentElement.getBoundingClientRect();
    const pointerX = event.clientX - rect.left - rect.width / 2;
    const pointerY = event.clientY - rect.top - rect.height / 2;
    const ratio = next / previous;
    view.x = pointerX - (pointerX - view.x) * ratio;
    view.y = pointerY - (pointerY - view.y) * ratio;
    view.scale = next;
    renderView();
    updateBrushCursor(event);
  }, { passive: false });
  clearButton.addEventListener("click", () => {
    const changedIndices = createChangeSet();
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index]) changedIndices.push(index);
    }
    mask.fill(0);
    commitChange(changedIndices, 255, 0);
    renderMask();
  });
  cancelButton.addEventListener("click", close);
  closeButton.addEventListener("click", close);
  confirmButton.addEventListener("click", () => {
    if (!mask.some(Boolean)) return onStatus("protected.status.empty");
    onConfirm({ sourceId, width: maskCanvas.width, height: maskCanvas.height, mask: new Uint8Array(mask) });
    close();
  });
  maskCanvas.addEventListener("pointerdown", pointerDown);
  maskCanvas.addEventListener("pointermove", pointerMove);
  maskCanvas.addEventListener("pointerup", pointerUp);
  maskCanvas.addEventListener("pointercancel", pointerUp);
  maskCanvas.addEventListener("pointerleave", () => brushCursor.classList.add("hidden"));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  window.addEventListener("keydown", (event) => {
    if (overlay.classList.contains("hidden") || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      undo();
    } else if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      redo();
    }
  }, true);

  return { open, close };
}

export async function compositeWithProtectedMask({ source, edited, selection }) {
  const [sourceImage, editedImage] = await Promise.all([
    loadImage(`data:${source.mimeType};base64,${source.base64}`),
    loadImage(`data:${edited.mimeType};base64,${edited.base64}`),
  ]);
  const { width, height, mask } = selection;
  if (sourceImage.naturalWidth !== width || sourceImage.naturalHeight !== height || mask.length !== width * height) {
    throw new Error("La selección protegida ya no corresponde a esta imagen.");
  }

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d");
  outputContext.drawImage(sourceImage, 0, 0, width, height);

  const editedLayer = document.createElement("canvas");
  editedLayer.width = width;
  editedLayer.height = height;
  const editedContext = editedLayer.getContext("2d");
  editedContext.drawImage(editedImage, 0, 0, width, height);

  const rawMask = document.createElement("canvas");
  rawMask.width = width;
  rawMask.height = height;
  const rawContext = rawMask.getContext("2d");
  const maskPixels = rawContext.createImageData(width, height);
  for (let index = 0; index < mask.length; index += 1) maskPixels.data[index * 4 + 3] = mask[index];
  rawContext.putImageData(maskPixels, 0, 0);

  const featheredMask = document.createElement("canvas");
  featheredMask.width = width;
  featheredMask.height = height;
  const featheredContext = featheredMask.getContext("2d");
  featheredContext.filter = "blur(4px)";
  featheredContext.drawImage(rawMask, 0, 0);

  editedContext.globalCompositeOperation = "destination-in";
  editedContext.drawImage(featheredMask, 0, 0);
  outputContext.drawImage(editedLayer, 0, 0);
  const dataUrl = output.toDataURL("image/png");
  return { mimeType: "image/png", base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}
