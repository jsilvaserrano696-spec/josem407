// Records a short voice command from the mic and sends it to the main process for transcription
// via Gemini (src/gemini/voiceTranscriber.js), replacing the browser's native
// webkitSpeechRecognition — which reaches a Google backend that requires a proprietary API key
// only present in official Google Chrome builds, and always fails with a "network" error under
// Electron's open-source Chromium (see ARCHITECTURE.md's "Known limitation: voice recognition").
//
// Audio is captured as raw PCM via the Web Audio API and hand-encoded into a WAV container in
// encodeWav() below, rather than using MediaRecorder: Chromium's MediaRecorder only produces
// audio/webm (Opus), which isn't one of the MIME types the Gemini API accepts for inline audio
// (wav/mp3/aiff/aac/ogg-Vorbis/flac). Recording at 16kHz mono also matches the rate Gemini
// downsamples audio to internally, so nothing is wasted capturing higher quality than the model
// will actually use.
//
// Kept behind this same start/stop/callback interface so a future swap to a different STT engine
// only requires changes in this one file (and, if the new engine needs a different audio format,
// in encodeWav() below) — ui/scripts/components/voiceButton.js and app.js never change.
import { t } from "../i18n/i18n.js";

const SAMPLE_RATE = 16000;

function floatTo16BitPCM(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return buffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Builds a minimal 16-bit PCM mono WAV file (44-byte header + samples) — no dependency needed,
// the format is simple enough to write by hand.
function encodeWav(samples, sampleRate) {
  const pcmData = floatTo16BitPCM(samples);
  const buffer = new ArrayBuffer(44 + pcmData.byteLength);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + pcmData.byteLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (sampleRate * blockAlign)
  view.setUint16(32, 2, true); // block align (channels * bytesPerSample)
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, pcmData.byteLength, true);

  new Uint8Array(buffer, 44).set(new Uint8Array(pcmData));
  return buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function mergeChunks(chunks, totalLength) {
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export class SpeechService {
  constructor() {
    this.listening = false;
    this.recording = false;
    this.stream = null;
    this.audioContext = null;
    this.source = null;
    this.processor = null;
    this.silentGain = null;
    this.chunks = [];
  }

  isSupported() {
    return Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(window.AudioContext || window.webkitAudioContext);
  }

  async start({ onResult, onError, onTranscribing, onEnd } = {}) {
    if (!this.isSupported()) {
      onError?.(new Error(t("voice.unavailable")));
      return;
    }

    if (this.listening) {
      return;
    }

    this._onResult = onResult;
    this._onError = onError;
    this._onTranscribing = onTranscribing;
    this._onEnd = onEnd;
    this.chunks = [];

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: SAMPLE_RATE, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      onError?.(new Error(t("voice.micDenied")));
      return;
    }

    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextImpl({ sampleRate: SAMPLE_RATE });
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    // ScriptProcessorNode is deprecated in favor of AudioWorklet, but AudioWorklet requires
    // loading a separate module script via a URL — an extra file, or a blob: URL that the app's
    // strict CSP (script-src 'self') would need to be relaxed for. For a short, one-shot,
    // non-realtime recording like a voice command, running on the main thread has no perceptible
    // downside, so it's kept for simplicity.
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    // Routing the processor through a silenced gain node (instead of connecting it straight to
    // destination) is required in Chromium for onaudioprocess to fire at all, but connecting
    // straight to destination would also play the mic input back out loud — an echo/feedback risk.
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;

    this.processor.onaudioprocess = (event) => {
      this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };

    this.source.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);

    this.listening = true;
    this.recording = true;
  }

  stop() {
    if (!this.recording) {
      return;
    }
    this.recording = false;
    this._finish();
  }

  async _finish() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.silentGain?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    const audioContext = this.audioContext;
    this.audioContext = null;

    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = mergeChunks(this.chunks, totalLength);
    this.chunks = [];

    await audioContext?.close();

    if (totalLength === 0) {
      this.listening = false;
      this._onError?.(new Error(t("voice.notCaught")));
      this._onEnd?.();
      return;
    }

    this._onTranscribing?.();

    try {
      const base64 = arrayBufferToBase64(encodeWav(samples, SAMPLE_RATE));
      const transcript = await window.axion.transcribeAudio({ base64, mimeType: "audio/wav" });
      if (transcript) {
        this._onResult?.(transcript);
      } else {
        this._onError?.(new Error(t("voice.notCaught")));
      }
    } catch (error) {
      this._onError?.(error);
    } finally {
      this.listening = false;
      this._onEnd?.();
    }
  }
}
