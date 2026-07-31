// Turns a short, casual user instruction into a precise, targeted image-editing instruction
// using a fast Gemini call, before it's ever sent to the image model — see
// optimizerPromptBuilder.js for the actual "art director" framing (preserve everything not
// explicitly asked to change). Deliberately a separate module/model call from imageEditor.js:
// optimizing text and editing images are different concerns, and using a plain text model here
// keeps this fast and cheap.
//
// When `currentImage` is provided (editing, not creating from scratch), the same call also does
// the image diagnosis described in optimizerPromptBuilder.js — one multimodal request, not two,
// asking the model to reason in two phases and return both, separated by a fixed marker. Only
// the instruction half ever leaves this module; the diagnosis is developer-mode-only (see
// DESIGN_PHILOSOPHY.md), logged for debugging and never surfaced in the UI.
//
// PROMPT ENGINE v1: this is a separate, user-triggered IPC call — there is no AXION Intent
// available here (ANALYZE only runs later, inside axionCore.js's own IMAGE_EDIT/IMAGE_GENERATE
// handling). Rather than transporting one across two independent IPC calls, a fresh local Intent
// is computed here via the same deterministic `analyzeRequest()` ANALYZE itself uses — cheap,
// synchronous, no Gemini call added. Only `protect` (`source:"user"`) and `constraints` are ever
// used (via optimizerIntentBridge.js) — never `direction`/`targets`/`assumptions`/`confidence`.
// If ANALYZE or the bridge fail for any reason, the meta-prompt falls back to exactly what it
// would be without this enrichment — never blocks, never throws, still exactly one Gemini call.
//
// `geminiClient`/`analyze`/`optimizerIntentBridge` are called via their module namespace (not
// destructured into local consts) so their exported functions remain replaceable in isolation by
// tests — the same pattern already used in src/core/inspector.js — without any test-only branch
// in this file.
const geminiClient = require("./geminiClient");
const { buildOptimizerMetaPrompt } = require("../prompts/optimizerPromptBuilder");
const { getStyleById } = require("../styles/styleLibrary");
const editDebugLogger = require("../debug/editDebugLogger");
const analyze = require("../core/analyze");
const optimizerIntentBridge = require("../prompts/optimizerIntentBridge");

// The "-latest" alias tracks Google's current recommended fast text model, so this doesn't
// need to be updated by hand every time a dated model version is deprecated for new projects.
const OPTIMIZER_MODEL = "gemini-flash-latest";

const INSTRUCTION_MARKER = "### INSTRUCTION";
const DIAGNOSIS_MARKER = "### DIAGNOSIS";

// If the model doesn't follow the requested two-section format for some reason, falling back
// to the whole raw response as the instruction is safer than failing the edit outright.
function splitDiagnosisAndInstruction(rawText) {
  const markerIndex = rawText.indexOf(INSTRUCTION_MARKER);
  if (markerIndex === -1) {
    return { diagnosis: null, instruction: rawText.trim() };
  }
  const diagnosis = rawText.slice(0, markerIndex).replace(DIAGNOSIS_MARKER, "").trim();
  const instruction = rawText.slice(markerIndex + INSTRUCTION_MARKER.length).trim();
  return { diagnosis: diagnosis || null, instruction };
}

async function optimizePrompt({ userPrompt, styleId, priorEdits, currentImage }) {
  if (!userPrompt || !userPrompt.trim()) {
    throw new Error("Cannot optimize an empty prompt.");
  }

  const style = styleId ? getStyleById(styleId) : null;
  const hasImage = Boolean(currentImage?.base64);

  let detectedElements = null;
  try {
    const intent = analyze.analyzeRequest({ userPrompt, currentImage, styleId });
    detectedElements = optimizerIntentBridge.extractDetectedElements(intent);
  } catch {
    // ANALYZE (or the bridge) failing must never affect optimization — fall back to exactly the
    // meta-prompt that would be built without this enrichment.
    detectedElements = null;
  }

  const metaPrompt = buildOptimizerMetaPrompt({
    userPrompt,
    styleFragment: style?.promptFragment ?? null,
    priorEdits: priorEdits ?? null,
    hasImage,
    detectedElements,
  });

  const ai = geminiClient.getClient();
  let response;
  try {
    response = await ai.models.generateContent({
      model: OPTIMIZER_MODEL,
      contents: hasImage
        ? [{ text: metaPrompt }, { inlineData: { mimeType: currentImage.mimeType, data: currentImage.base64 } }]
        : metaPrompt,
    });
  } catch (error) {
    throw geminiClient.describeGeminiError(error);
  }

  const raw = response.text?.trim();
  if (!raw) {
    throw new Error("The prompt optimizer did not return any text.");
  }

  if (!hasImage) {
    return raw;
  }

  const { diagnosis, instruction } = splitDiagnosisAndInstruction(raw);
  if (diagnosis) {
    editDebugLogger.log("Image diagnosis (developer mode detail)", { diagnosis });
  }
  if (!instruction) {
    throw new Error("The prompt optimizer did not return any text.");
  }
  return instruction;
}

module.exports = { optimizePrompt };
