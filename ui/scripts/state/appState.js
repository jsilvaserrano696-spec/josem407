// A minimal observable store — no framework needed for a UI this size. Components read/write
// through this instead of passing state around by hand, while app.js stays the only place that
// wires state changes to DOM updates.
export function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    setState(partial) {
      const patch = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const appState = createStore({
  // Version history for the current image, in edit order — index 0 is always the original,
  // unedited import (prompt: null). Undo/Redo just move versionCursor; no Gemini call, no
  // network. Editing while versionCursor isn't at the end truncates everything after it
  // (replace, not branch — see DESIGN_PHILOSOPHY.md/the Undo-Redo design discussion).
  // Each entry: { id, versionNumber, prompt, styleId, timestamp, image: { base64, mimeType } }
  versionHistory: [],
  versionCursor: -1, // -1 = no image loaded yet
  selectedStyleId: null,
  conversationMode: true,
  isBusy: false,
});
