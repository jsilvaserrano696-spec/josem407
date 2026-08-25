const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanIpcErrorMessage, normalizeIpcError } = require("./ipcError");

test("removes Electron's remote-method wrapper and nested Error label", () => {
  assert.equal(
    cleanIpcErrorMessage(new Error("Error invoking remote method 'image:edit': Error: Clave no válida.")),
    "Clave no válida."
  );
});

test("preserves an ordinary application error unchanged", () => {
  const original = new Error("No se ha podido generar la imagen.");
  assert.equal(normalizeIpcError(original), original);
});

test("normalized errors keep the original error as their cause", () => {
  const original = new Error("Error invoking remote method 'prompt:optimize': Falló la optimización.");
  const normalized = normalizeIpcError(original);
  assert.equal(normalized.message, "Falló la optimización.");
  assert.equal(normalized.cause, original);
});
