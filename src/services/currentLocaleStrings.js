// Resolves the user's configured locale strings, safely — never throws, never returns something
// that could make a validation error become `Error(undefined)`. Lives in `services/` (not
// `shared/`) because it depends on configStore.js and, transitively, Electron; the pure loader in
// src/shared/localeStrings.js stays ignorant of both, unchanged.
//
// `configStore`/`sharedLocaleStrings` are required as a namespace (not destructured) so their
// exported functions remain independently replaceable by tests — the same pattern already used
// across src/gemini/ — without any test-only branch in this file.
const configStore = require("./configStore");
const sharedLocaleStrings = require("../shared/localeStrings");

// Last-resort fallback — used only if loading locale files fails entirely (both the configured
// locale and loadLocaleStrings()'s own internal "es" fallback). Covers only the five
// validation-error keys the Gemini modules throw, in safe, understandable Spanish. Not a
// substitute for ui/locales/es.json — a final line of defense so a validation error can never
// resolve to `undefined`. Never logged, never derived from user data.
const LAST_RESORT_STRINGS = {
  "error.emptyPrompt": "El texto de la instrucción no puede estar vacío.",
  "error.missingSourceImage": "Se necesita una imagen de origen para editar.",
  "error.optimizationFailed": "No se ha podido interpretar tu petición. Inténtalo de nuevo.",
  "error.noAudioProvided": "No se ha recibido ningún audio para transcribir.",
  "error.unsupportedAudioFormat": "Formato de audio no compatible.",
};

function currentStrings() {
  let locale;
  try {
    locale = configStore.getSettings()?.language || "es";
  } catch {
    // configStore/Electron unavailable or misbehaving — never let a locale lookup crash the
    // caller. Falls back to the default locale.
    locale = "es";
  }

  try {
    return sharedLocaleStrings.loadLocaleStrings(locale);
  } catch {
    // loadLocaleStrings() already falls back to es.json internally when the requested locale
    // file fails; this only catches the extreme case where even that fails.
    return LAST_RESORT_STRINGS;
  }
}

module.exports = { currentStrings };
