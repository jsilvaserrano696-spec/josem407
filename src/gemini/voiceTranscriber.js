// Transcribes a short voice-command recording to text via Gemini's audio understanding, as a
// replacement for the browser's native webkitSpeechRecognition — which reaches a Google backend
// that requires a proprietary API key baked only into official Google Chrome builds, and always
// fails with a "network" error under Electron's open-source Chromium (see ARCHITECTURE.md's
// "Known limitation: voice recognition"). Deliberately a separate module/model call from
// imageEditor.js, same reasoning as promptOptimizer.js: transcription is a fast, cheap, text-out
// task that has no business sharing a model/session with image editing.
const { getClient, describeGeminiError } = require("./geminiClient");

// Same fast text-capable alias promptOptimizer.js already uses — Flash models are natively
// multimodal (text/image/audio), so no separate/heavier model is needed just for transcription.
const TRANSCRIBE_MODEL = "gemini-flash-latest";

const TRANSCRIBE_INSTRUCTION =
  "Transcribe this audio verbatim. Return only the spoken words as plain text, with no " +
  "quotation marks, labels, or commentary. If no speech is audible, return an empty response.";

/**
 * `base64`/`mimeType` describe a single recorded clip (expected: a WAV file the renderer encoded
 * from raw mic PCM — see ui/scripts/services/speechService.js). Returns the transcript as a
 * trimmed string, or an empty string if nothing intelligible was said.
 */
async function transcribeAudio({ base64, mimeType }) {
  if (!base64) {
    throw new Error("No audio data was provided to transcribe.");
  }

  const ai = getClient();
  let response;
  try {
    response = await ai.models.generateContent({
      model: TRANSCRIBE_MODEL,
      contents: [
        { text: TRANSCRIBE_INSTRUCTION },
        { inlineData: { mimeType: mimeType || "audio/wav", data: base64 } },
      ],
    });
  } catch (error) {
    throw describeGeminiError(error);
  }

  return response.text?.trim() ?? "";
}

module.exports = { transcribeAudio };
