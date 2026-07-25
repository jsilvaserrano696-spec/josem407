// Expands a short, casual user instruction into a detailed professional prompt using a
// text-only Gemini call, before it's ever sent to the image model. Deliberately a separate
// module/model call from imageEditor.js: optimizing text and editing images are different
// concerns, and using a plain text model here keeps this fast and cheap.
const { getClient } = require("./geminiClient");
const { buildOptimizerMetaPrompt } = require("../prompts/optimizerPromptBuilder");
const { getStyleById } = require("../styles/styleLibrary");

// The "-latest" alias tracks Google's current recommended fast text model, so this doesn't
// need to be updated by hand every time a dated model version is deprecated for new projects.
const OPTIMIZER_MODEL = "gemini-flash-latest";

async function optimizePrompt({ userPrompt, styleId, conversationContext }) {
  if (!userPrompt || !userPrompt.trim()) {
    throw new Error("Cannot optimize an empty prompt.");
  }

  const style = styleId ? getStyleById(styleId) : null;
  const metaPrompt = buildOptimizerMetaPrompt({
    userPrompt,
    styleFragment: style?.promptFragment ?? null,
    conversationContext: conversationContext ?? null,
  });

  const ai = getClient();
  const response = await ai.models.generateContent({
    model: OPTIMIZER_MODEL,
    contents: metaPrompt,
  });

  const optimized = response.text?.trim();
  if (!optimized) {
    throw new Error("The prompt optimizer did not return any text.");
  }

  return optimized;
}

module.exports = { optimizePrompt };
