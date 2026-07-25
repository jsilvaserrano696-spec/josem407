// Wires the mic button to SpeechService. Voice commands ("Make this photo look cinematic",
// "Remove the background", …) come through as a plain transcript string and simply replace the
// current prompt text, same as picking a template.
export function wireVoiceButton({ buttonEl, speechService, onTranscript, onStatusChange }) {
  buttonEl.addEventListener("click", () => {
    if (speechService.listening) {
      speechService.stop();
      return;
    }

    if (!speechService.isSupported()) {
      onStatusChange("Voice recognition isn't available in this environment.", "error");
      return;
    }

    buttonEl.classList.add("listening");
    onStatusChange("Listening…", "info");

    speechService.start({
      onResult: (transcript) => {
        if (transcript) {
          onTranscript(transcript);
          onStatusChange(`Heard: "${transcript}"`, "success");
        } else {
          onStatusChange("Didn't catch that — try again.", "error");
        }
      },
      onError: (error) => {
        buttonEl.classList.remove("listening");
        onStatusChange(error.message, "error");
      },
      onEnd: () => {
        buttonEl.classList.remove("listening");
      },
    });
  });
}
