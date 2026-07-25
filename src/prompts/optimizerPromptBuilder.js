// Builds the meta-prompt sent to Gemini's text model to expand a short, casual user instruction
// into a detailed, professional image-editing prompt. Kept as pure string-building (no network
// calls) so it's trivially testable and reusable from the optimizer service.
function buildOptimizerMetaPrompt({ userPrompt, styleFragment, conversationContext }) {
  const lines = [
    "You are a professional prompt engineer for an AI image editing tool.",
    "Rewrite the user's short instruction into a single, detailed, professional image-editing " +
      "prompt for Gemini's image model.",
    "",
    "Rules:",
    "- Preserve the user's original intent exactly; do not invent a different edit.",
    "- Expand it with concrete, professional detail: lighting, composition, texture, quality " +
      "descriptors (e.g. \"ultra realistic\", \"highly detailed\", \"masterpiece quality\") where " +
      "they genuinely strengthen the result.",
    "- If a visual style is provided below, weave it in naturally.",
    "- Preserve facial identity and the subject's core likeness unless the user explicitly asks " +
      "to change them.",
    "- Output ONLY the rewritten prompt text. No preamble, no quotes, no explanation.",
    "",
    `User instruction: "${userPrompt}"`,
  ];

  if (styleFragment) {
    lines.push(`Requested visual style: ${styleFragment}`);
  }

  if (conversationContext) {
    lines.push(
      "",
      "This is a follow-up edit continuing an existing conversation. Prior context:",
      conversationContext
    );
  }

  return lines.join("\n");
}

module.exports = { buildOptimizerMetaPrompt };
