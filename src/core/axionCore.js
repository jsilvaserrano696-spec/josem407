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
const { buildIntent, validateIntent } = require("./intentSchema");
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

// Drops everything from the first literal ", got " onward in a validateIntent() error message —
// that's the exact, consistent point where intentSchema.js embeds the actual (possibly corrupted,
// possibly prompt-derived) field value via JSON.stringify(). Keeps the structural part (which
// field, what was expected) for diagnostics, never the value itself.
function sanitizeValidationError(message) {
  const cutAt = message.indexOf(", got ");
  return cutAt === -1 ? message : message.slice(0, cutAt) + ".";
}

// Diagnostics only: never blocks the pipeline, never throws, never modifies or replaces the
// Intent — always returns the exact same reference it was given. Logs nothing when the Intent is
// valid (no noise in normal operation). When invalid, logs only stage/valid/errorCount/sanitized
// errors — never the Intent itself, never userRequest/prompt/image data. If validateIntent()
// itself throws, that's caught too, logged as a generic notice, and the original Intent is kept.
function validateIntentForDiagnostics(intent, stage) {
  try {
    const { valid, errors } = validateIntent(intent);
    if (!valid) {
      editDebugLogger.log(
        `[AXION CORE] Intent invalid after ${stage} (diagnostics only, pipeline continues)`,
        { stage, valid: false, errorCount: errors.length, errors: errors.map(sanitizeValidationError) }
      );
    }
  } catch (error) {
    editDebugLogger.log(
      `[AXION CORE] validateIntent() failed unexpectedly at ${stage} (diagnostics only, pipeline continues)`,
      { stage, warning: "validateIntent() threw; ignored, pipeline continues" }
    );
  }
  return intent;
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
async function runEditPipeline({ prompt, currentImage, originalImage, referenceImage, displayPrompt, styleId } = {}) {
  const requestText = displayPrompt ?? prompt;

  const intent = safeStage(
    "ANALYZE",
    () => analyzeRequest({ operation: "edit", userPrompt: requestText, currentImage, styleId }),
    fallbackIntent({ operation: "edit", hasImage: Boolean(currentImage?.base64), text: requestText, styleId })
  );
  validateIntentForDiagnostics(intent, "ANALYZE");
  const directedIntent = safeStage("DIRECTOR", () => decideDirection({ intent }), intent);
  validateIntentForDiagnostics(directedIntent, "DIRECTOR");

  const result = await imageEditor.editImage({ prompt, currentImage, originalImage, referenceImage });

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
  validateIntentForDiagnostics(intent, "ANALYZE");
  const directedIntent = safeStage("DIRECTOR", () => decideDirection({ intent }), intent);
  validateIntentForDiagnostics(directedIntent, "DIRECTOR");

  const result = await imageEditor.generateImage({ prompt });

  safeStage(
    "INSPECTOR",
    () => inspectResult({ resultMeta: { mimeType: result.mimeType, bytes: result.data.length }, intent: directedIntent }),
    null
  );

  return result;
}

module.exports = { runEditPipeline, runGeneratePipeline };
