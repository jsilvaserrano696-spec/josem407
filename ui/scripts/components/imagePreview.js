// Small helpers for swapping the before/after <img> elements in and out of view. Kept separate
// from dropzone.js because the "original" and "edited" panels are conceptually different: the
// original is set once per image, the edited panel updates after every edit.
export function showImage(imgEl, placeholderEl, dataUrl) {
  imgEl.src = dataUrl;
  imgEl.classList.remove("hidden");
  placeholderEl?.classList.add("hidden");
}

export function clearImage(imgEl, placeholderEl) {
  imgEl.removeAttribute("src");
  imgEl.classList.add("hidden");
  placeholderEl?.classList.remove("hidden");
}
