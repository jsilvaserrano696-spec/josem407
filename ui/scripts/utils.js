// Small shared helpers used by more than one component.
export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// crypto.randomUUID() requires a secure context, which file:// pages aren't guaranteed to be
// treated as. This falls back to a good-enough unique id so session/state ids never throw.
export function generateId() {
  if (window.crypto?.randomUUID) {
    try {
      return window.crypto.randomUUID();
    } catch {
      // fall through to the fallback below
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Deliberate, fixed-duration pause — not tied to any network latency — used for brief status
// confirmations that need to be readable for a moment before moving on (see
// DESIGN_PHILOSOPHY.md's "cada mensaje es una promesa de tiempo y sentido").
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
