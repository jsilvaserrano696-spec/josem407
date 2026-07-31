// Transcribes a short voice-command recording to text via Gemini's audio understanding, as a
// replacement for the browser's native webkitSpeechRecognition — which reaches a Google backend
// that requires a proprietary API key baked only into official Google Chrome builds, and always
// fails with a "network" error under Electron's open-source Chromium (see ARCHITECTURE.md's
// "Known limitation: voice recognition"). Deliberately a separate module/model call from
// imageEditor.js, same reasoning as promptOptimizer.js: transcription is a fast, cheap, text-out
// task that has no business sharing a model/session with image editing.
const geminiClient = require("./geminiClient");

// Same fast text-capable alias promptOptimizer.js already uses — Flash models are natively
// multimodal (text/image/audio), so no separate/heavier model is needed just for transcription.
const TRANSCRIBE_MODEL = "gemini-flash-latest";

const TRANSCRIBE_INSTRUCTION =
  "Transcribe this audio verbatim. Return only the spoken words as plain text, with no " +
  "quotation marks, labels, or commentary. If no speech is audible, return an empty response.";

// Extracts the transcript defensively: `response` itself may be null/undefined, `.text` may be
// absent, non-string, or a throwing getter — all of these fold into the same "nothing
// intelligible" empty-string path the module already documents and speechService.js's caller
// already handles (see voice.notCaught), rather than a new kind of thrown error. Never logs
// (never has — see the file-level comment) and never throws.
function extractTranscript(response) {
  try {
    const text = response?.text;
    return typeof text === "string" ? text.trim() : "";
  } catch {
    return "";
  }
}

/**
 * `base64`/`mimeType` describe a single recorded clip (expected: a WAV file the renderer encoded
 * from raw mic PCM — see ui/scripts/services/speechService.js). Returns the transcript as a
 * trimmed string, or an empty string if nothing intelligible was said.
 */
async function transcribeAudio({ base64, mimeType }) {
  if (typeof base64 !== "string" || base64.length === 0) {
    throw new Error("No audio data was provided to transcribe.");
  }

  // mimeType is optional (defaults to audio/wav, unvalidated, exactly as before) — but when the
  // caller does provide one, it's trimmed (accidental surrounding whitespace is not a valid
  // format change) and must be a non-empty string starting with "audio/". No closed list of
  // concrete formats yet — Gemini itself is the authority on which audio/* subtypes it accepts.
  let resolvedMimeType = "audio/wav";
  if (mimeType !== undefined && mimeType !== null) {
    const trimmedMimeType = typeof mimeType === "string" ? mimeType.trim() : mimeType;
    if (typeof trimmedMimeType !== "string" || trimmedMimeType.length === 0 || !trimmedMimeType.startsWith("audio/")) {
      throw new Error("Unsupported audio format for transcription.");
    }
    resolvedMimeType = trimmedMimeType;
  }

  const ai = geminiClient.getClient();
  let response;
  try {
    response = await ai.models.generateContent({
      model: TRANSCRIBE_MODEL,
      contents: [
        { text: TRANSCRIBE_INSTRUCTION },
        { inlineData: { mimeType: resolvedMimeType, data: base64 } },
      ],
    });
  } catch (error) {
    throw geminiClient.describeGeminiError(error);
  }

  return extractTranscript(response);
}

module.exports = { transcribeAudio };
