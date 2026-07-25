// Single line of status text at the bottom of the prompt panel. `type` drives color only
// ("info" | "success" | "error") — callers pass plain, already-formatted messages.
export function setStatus(statusBarEl, message, type = "info") {
  statusBarEl.textContent = message;
  statusBarEl.classList.remove("error", "success");
  if (type === "error" || type === "success") {
    statusBarEl.classList.add(type);
  }
}
