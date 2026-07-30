// Wires the mic button to SpeechService. Voice commands ("Make this photo look cinematic",
// "Remove the background", …) come through as a plain transcript string and simply replace the
// current prompt text, same as picking a template.
import { t } from "../i18n/i18n.js";

export function wireVoiceButton({ buttonEl, speechService, onTranscript, onStatusChange }) {
  buttonEl.addEventListener("click", () => {
    if (speechService.listening) {
      speechService.stop();
      return;
    }

    if (!speechService.isSupported()) {
      onStatusChange(t("voice.unavailable"), "error");
      return;
    }

    buttonEl.classList.add("listening");
    onStatusChange(t("voice.listening"), "info");

    speechService.start({
      onTranscribing: () => {
        buttonEl.classList.remove("listening");
        buttonEl.classList.add("transcribing");
        onStatusChange(t("status.interpreting"), "info");
      },
      onResult: (transcript) => {
        if (transcript) {
          onTranscript(transcript);
          onStatusChange(t("voice.heard", { transcript }), "success");
        } else {
          onStatusChange(t("voice.notCaught"), "error");
        }
      },
      onError: (error) => {
        onStatusChange(error.message, "error");
      },
      onEnd: () => {
        buttonEl.classList.remove("listening", "transcribing");
      },
    });
  });
}
