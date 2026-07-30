// AXION CORE — orchestrates ANALYZE → DIRECTOR → EXECUTE → INSPECTOR. Importable and callable on
// its own, but NOT wired into src/main/ipcHandlers.js's *behavior* in any observable way: EXECUTE
// is reused as-is from src/gemini/imageEditor.js, called with exactly the same arguments as
// before, and the AXION Intent (src/core/intentSchema.js) that now travels ANALYZE → DIRECTOR →
// INSPECTOR never reaches EXECUTE and never touches `prompt` or the returned result.
//
// Every stage other than EXECUTE runs through safeStage(): a failure in ANALYZE, DIRECTOR or
// INSPECTOR is logged and ignored, never thrown onward. Only imageEditor's own call is allowed to
// reject, exactly as it already does when called directly.
const { analyzeRequest } = require("./analyze");
const { decideDirection } = require("./director");
const { inspectResult } = require("./inspector");
const { buildIntent } = require("./intentSchema");
const imageEditor = require("../gemini/imageEditor");
const editDebugLogger = require("../debug/editDebugLogger");

function safeStage(label, fn, fallback) {
  try {
    return fn();
  } catch (error) {
    editDebugLogger.logError(`[AXION CORE] ${label} stage failed (ignored)`, error);
    return fallback;
  }
}

// Minimal, always-valid-shaped Intent used only if ANALYZE itself throws — never `undefined`.
// Built with the same buildIntent() normalizer ANALYZE uses, so it's structurally identical to a
// real ANALYZE result, just with no interpretation in it.
function fallbackIntent({ operation, hasImage, text, styleId }) {
  return buildIntent({
    operation,
    hasImage,
    request: { text: text ?? "", styleId: styleId ?? null },
    metadata: { createdAt: Date.now(), source: "axionCore@fallback" },
  });
}

/**
 * Runs one edit through the full CORE pipeline. `prompt` is expected to already be the final
 * instruction sent to the image model (PROMPT ENGINE's own optimization step,
 * src/gemini/promptOptimizer.js, stays a separate, user-triggered IPC call today — unchanged by
 * this function). Returns exactly what imageEditor.editImage() returns.
 */
async function runEditPipeline({ prompt, currentImage, originalImage, displayPrompt, styleId } = {}) {
  const requestText = displayPrompt ?? prompt;

  const intent = safeStage(
    "ANALYZE",
    () => analyzeRequest({ operation: "edit", userPrompt: requestText, currentImage, styleId }),
    fallbackIntent({ operation: "edit", hasImage: Boolean(currentImage?.base64), text: requestText, styleId })
  );
  const directedIntent = safeStage("DIRECTOR", () => decideDirection({ intent }), intent);

  const result = await imageEditor.editImage({ prompt, currentImage, originalImage });

  safeStage(
    "INSPECTOR",
    () => inspectResult({ resultMeta: { mimeType: result.mimeType, bytes: result.data.length }, intent: directedIntent }),
    null
  );

  return result;
}

/** Same pipeline for from-scratch generation (no source image) — mirrors imageEditor.generateImage(). */
async function runGeneratePipeline({ prompt, displayPrompt, styleId } = {}) {
  const requestText = displayPrompt ?? prompt;

  const intent = safeStage(
    "ANALYZE",
    () => analyzeRequest({ operation: "generate", userPrompt: requestText, currentImage: null, styleId }),
    fallbackIntent({ operation: "generate", hasImage: false, text: requestText, styleId })
  );
  const directedIntent = safeStage("DIRECTOR", () => decideDirection({ intent }), intent);

  const result = await imageEditor.generateImage({ prompt });

  safeStage(
    "INSPECTOR",
    () => inspectResult({ resultMeta: { mimeType: result.mimeType, bytes: result.data.length }, intent: directedIntent }),
    null
  );

  return result;
}

module.exports = { runEditPipeline, runGeneratePipeline };
