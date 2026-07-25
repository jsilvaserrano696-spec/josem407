// Wraps the browser's SpeechRecognition API behind a small start/stop/callback interface.
// Electron's renderer is Chromium, so this works without any extra dependency — but recognition
// is routed through a Google web speech service under the hood, which can be flaky or blocked
// depending on the Electron/Chromium build and network policy. That's a platform limitation, not
// something app code can fully guarantee, so callers must handle onError gracefully (this class
// never throws synchronously — everything surfaces through the callbacks).
//
// Kept behind this interface specifically so a future swap to a cloud STT call (reusing the same
// Gemini/Google API key already in Settings) only requires changes in this one file.
const getSpeechRecognitionImpl = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || null;
};

export class SpeechService {
  constructor() {
    this.recognition = null;
    this.listening = false;
  }

  isSupported() {
    return Boolean(getSpeechRecognitionImpl());
  }

  start({ lang = "en-US", onResult, onError, onEnd } = {}) {
    const SpeechRecognitionImpl = getSpeechRecognitionImpl();

    if (!SpeechRecognitionImpl) {
      onError?.(new Error("Voice recognition is not supported in this environment."));
      return;
    }

    if (this.listening) {
      return;
    }

    this.recognition = new SpeechRecognitionImpl();
    this.recognition.lang = lang;
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;
    this.recognition.continuous = false;

    this.recognition.onresult = (event) => {
      const resultIndex = typeof event.resultIndex === "number" ? event.resultIndex : event.results.length - 1;
      const transcript = event.results?.[resultIndex]?.[0]?.transcript?.trim() ?? "";

      if (transcript) {
        onResult?.(transcript);
      } else {
        onError?.(new Error("Didn't catch that — try again."));
      }
    };

    this.recognition.onerror = (event) => {
      this.listening = false;
      onError?.(new Error(`Voice recognition error: ${event.error}`));
    };

    this.recognition.onend = () => {
      this.listening = false;
      onEnd?.();
    };

    try {
      this.recognition.start();
      this.listening = true;
    } catch (error) {
      this.listening = false;
      onError?.(error);
    }
  }

  stop() {
    if (!this.listening || !this.recognition) {
      return;
    }

    try {
      this.recognition.stop();
    } finally {
      this.listening = false;
    }
  }
}
