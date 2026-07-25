// A minimal observable store — no framework needed for a UI this size. Components read/write
// through this instead of passing state around by hand, while app.js stays the only place that
// wires state changes to DOM updates.
import { generateId } from "../utils.js";

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
  sessionId: generateId(),
  hasActiveSession: false,
  originalImage: null, // { filePath, dataUrl, mimeType }
  editedImage: null, // { base64, mimeType, dataUrl }
  selectedStyleId: null,
  conversationMode: true,
  autoOptimizePrompts: false,
  isBusy: false,
});
