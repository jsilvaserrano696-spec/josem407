// ANALYZE stage (stub). Will eventually turn a user's request (+ image, when editing) into a
// structured understanding of subject/intent/constraints for DIRECTOR to act on. For now it does
// no real analysis and makes no Gemini call — it only shapes its input into a stable, predictable
// return value so axionCore.js and future stages have a fixed contract to build against.
function analyzeRequest({ userPrompt, currentImage, styleId } = {}) {
  return {
    subject: null,
    intent: userPrompt ?? null,
    hasImage: Boolean(currentImage?.base64),
    styleId: styleId ?? null,
    constraints: [],
  };
}

module.exports = { analyzeRequest };
