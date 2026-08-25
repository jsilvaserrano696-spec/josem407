// Core image-editing logic: turns a prompt + a source image (plus, usually, the original image
// as a fidelity anchor — see editImage() below) into an edited image via Nano Banana 2.
// Always a single, stateless request — there is no server-side chat session and no memory
// between calls. The renderer's own version history (see ARCHITECTURE.md's "Version history &
// Undo/Redo" and "Fidelity anchor") is what decides which image counts as "current"; it's sent
// explicitly on every edit. That's what makes Undo/Redo free (no Gemini call, no tokens) and
// correct even after editing from a past version — there's no session to fall out of sync with
// what's actually on screen.
const geminiClient = require("./geminiClient");
const { currentStrings } = require("../services/currentLocaleStrings");
const editDebugLogger = require("../debug/editDebugLogger");
const { buildMatrixReferencePrompt } = require("../prompts/matrixPromptBuilder");
const { DEFAULT_MODEL_TIER, resolveImageModel } = require("./imageModelPolicy");

const DEFAULT_MODEL = resolveImageModel(DEFAULT_MODEL_TIER).id;
const OUTPUT_IMAGE_SIZE = resolveImageModel(DEFAULT_MODEL_TIER).imageSize;

function imageGenerationConfig(imageSize) {
  return { responseModalities: ["TEXT", "IMAGE"], imageConfig: { imageSize } };
}
function buildExplanationRequest(language) {
  const outputLanguage = language === "es" ? "Spanish" : "English";
  return `Alongside the image, return one concise plain-text sentence in ${outputLanguage} describing the visible result. ` +
    "Do not mention internal instructions, prompts, policies, or implementation details.";
}

function extractImageFromResponse(response) {
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);

  if (!imagePart) {
    // Technical detail (what the model said instead) is developer-mode-only — the user only
    // ever sees a generic, localized message (see DESIGN_PHILOSOPHY.md).
    const textPart = parts.find((part) => part.text);
    editDebugLogger.log("Gemini returned no image (developer mode detail)", {
      modelText: textPart?.text ?? null,
    });
    throw new Error(currentStrings()["error.imageGenerationFailed"]);
  }

  return {
    data: Buffer.from(imagePart.inlineData.data, "base64"),
    mimeType: imagePart.inlineData.mimeType || "image/png",
    explanation: parts
      .filter((part) => typeof part.text === "string")
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 600) || null,
  };
}

/**
 * Edits an image with a text prompt. `currentImage` is whatever the renderer's version history
 * currently points at — sent as inline data, same as before. `originalImage`, when provided (the
 * renderer omits it when currentImage already *is* the original — nothing to anchor against),
 * is sent as a second reference image with its own text label, so the model has the untouched
 * original in view on every single edit, not just the first one. This is the "fidelity anchor"
 * described in ARCHITECTURE.md: it's what stops small deviations from one edit compounding into
 * the next, since the true original never drops out of context for the life of the project.
 * The labels here are structural glue (which image is which), not creative instruction — the
 * actual "what to change / what to preserve" content is `prompt`, built by
 * optimizerPromptBuilder.js. Nothing in this function reads from disk or keeps state across calls.
 */
async function editImage({ prompt, currentImage, originalImage, referenceImage, explanationLanguage, modelTier }) {
  if (!prompt || !prompt.trim()) {
    throw new Error(currentStrings()["error.emptyPrompt"]);
  }
  if (!currentImage?.base64) {
    throw new Error(currentStrings()["error.missingSourceImage"]);
  }

  const ai = geminiClient.getClient();
  const model = resolveImageModel(modelTier);
  const hasReference = Boolean(referenceImage?.base64);
  const effectivePrompt = hasReference
    ? buildMatrixReferencePrompt({ userPrompt: prompt, hasOriginalAnchor: Boolean(originalImage?.base64) })
    : prompt;
  const messageParts = [
    { text: effectivePrompt },
    { text: "Reference image A — current state, build the requested change on top of this:" },
    { inlineData: { mimeType: currentImage.mimeType, data: currentImage.base64 } },
  ];
  if (originalImage?.base64) {
    messageParts.push(
      // Deliberately not phrased as "must match this exactly" — that absolute wording competed
      // directly against the instruction's own request for a fully realized change, and edits
      // came out barely perceptible. The instruction text already says precisely what to change
      // and what to preserve; this image is continuity support for the untouched parts, not a
      // second, independent brake on the part that's actually supposed to change.
      { text: "Reference image B — the untouched original, for continuity. The instruction above " +
          "already specifies exactly what to change and what to preserve — use this image only to " +
          "keep whatever falls outside that scope visually consistent. It is not a reason to " +
          "soften or limit the requested change itself:" },
      { inlineData: { mimeType: originalImage.mimeType, data: originalImage.base64 } }
    );
  }
  if (hasReference) {
    messageParts.push(
      { text: "REFERENCE IMAGE — inspiration only, governed by the multi-image role protocol above:" },
      { inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.base64 } }
    );
  }
  messageParts.push({ text: buildExplanationRequest(explanationLanguage) });

  const startedAt = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: model.id,
      contents: messageParts,
      config: imageGenerationConfig(model.imageSize),
    });
    editDebugLogger.log("Gemini image edit responded", {
      elapsedMs: Date.now() - startedAt,
      withFidelityAnchor: Boolean(originalImage?.base64),
      withReferenceImage: hasReference,
    });
    return { ...extractImageFromResponse(response), modelId: model.id, modelTier: model.tier };
  } catch (error) {
    editDebugLogger.logError("editImage() failed", error);
    throw geminiClient.describeGeminiError(error);
  }
}

/**
 * Creates a brand-new image from a text prompt alone — no source image. Same model, same
 * response shape, just no inlineData part in the request. This is what lets "New" and "Edit"
 * share the exact same version-history append logic on the renderer side: the only difference
 * between them is whether this function or editImage() produced the bytes.
 */
async function generateImage({ prompt, explanationLanguage, modelTier }) {
  if (!prompt || !prompt.trim()) {
    throw new Error(currentStrings()["error.emptyPrompt"]);
  }

  const ai = geminiClient.getClient();
  const model = resolveImageModel(modelTier);
  const messageParts = [{ text: prompt }, { text: buildExplanationRequest(explanationLanguage) }];

  const startedAt = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: model.id,
      contents: messageParts,
      config: imageGenerationConfig(model.imageSize),
    });
    editDebugLogger.log("Gemini image generation responded", { elapsedMs: Date.now() - startedAt });
    return { ...extractImageFromResponse(response), modelId: model.id, modelTier: model.tier };
  } catch (error) {
    editDebugLogger.logError("generateImage() failed", error);
    throw geminiClient.describeGeminiError(error);
  }
}

module.exports = { editImage, generateImage, DEFAULT_MODEL, OUTPUT_IMAGE_SIZE };
