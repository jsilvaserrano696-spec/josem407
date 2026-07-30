// AXION CORE — orchestrates ANALYZE → DIRECTOR → EXECUTE → INSPECTOR. Importable and callable on
// its own, but NOT wired into src/main/ipcHandlers.js yet: nothing in the real edit/generate flow
// calls this module today (see ARCHITECTURE.md). EXECUTE is reused as-is from
// src/gemini/imageEditor.js, unmodified.
//
// Every stage other than EXECUTE runs through safeStage(): a failure in ANALYZE, DIRECTOR or
// INSPECTOR is logged and ignored, never thrown onward. Only imageEditor's own call is allowed to
// reject, exactly as it already does when called directly — this module changes nothing about
// that behavior, it only wraps stages around it.
const { analyzeRequest } = require("./analyze");
const { decideDirection } = require("./director");
const { inspectResult } = require("./inspector");
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

/**
 * Runs one edit through the full CORE pipeline. `prompt` is expected to already be the final
 * instruction sent to the image model (PROMPT ENGINE's own optimization step,
 * src/gemini/promptOptimizer.js, stays a separate, user-triggered IPC call today — unchanged by
 * this function). Returns exactly what imageEditor.editImage() returns.
 */
async function runEditPipeline({ prompt, currentImage, originalImage, displayPrompt, styleId } = {}) {
  const analysis = safeStage(
    "ANALYZE",
    () => analyzeRequest({ userPrompt: displayPrompt ?? prompt, currentImage, styleId }),
    null
  );
  const direction = safeStage("DIRECTOR", () => decideDirection({ analysis }), null);

  const result = await imageEditor.editImage({ prompt, currentImage, originalImage });

  safeStage(
    "INSPECTOR",
    () => inspectResult({ resultMeta: { mimeType: result.mimeType, bytes: result.data.length }, analysis, direction }),
    null
  );

  return result;
}

/** Same pipeline for from-scratch generation (no source image) — mirrors imageEditor.generateImage(). */
async function runGeneratePipeline({ prompt, displayPrompt, styleId } = {}) {
  const analysis = safeStage(
    "ANALYZE",
    () => analyzeRequest({ userPrompt: displayPrompt ?? prompt, currentImage: null, styleId }),
    null
  );
  const direction = safeStage("DIRECTOR", () => decideDirection({ analysis }), null);

  const result = await imageEditor.generateImage({ prompt });

  safeStage(
    "INSPECTOR",
    () => inspectResult({ resultMeta: { mimeType: result.mimeType, bytes: result.data.length }, analysis, direction }),
    null
  );

  return result;
}

module.exports = { runEditPipeline, runGeneratePipeline };
