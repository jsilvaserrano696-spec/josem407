const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/;

function cleanIpcErrorMessage(error) {
  const message = typeof error?.message === "string" ? error.message : String(error ?? "");
  return message.replace(IPC_ERROR_PREFIX, "").trim() || message;
}

function normalizeIpcError(error) {
  const cleanMessage = cleanIpcErrorMessage(error);
  if (cleanMessage === error?.message) return error;
  const normalized = new Error(cleanMessage);
  normalized.name = error?.name || "Error";
  normalized.cause = error;
  return normalized;
}

module.exports = { cleanIpcErrorMessage, normalizeIpcError };
