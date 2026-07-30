// Reads the same ui/locales/*.json dictionaries the renderer uses (via i18n.js's fetch), so any
// main-process code that needs a user-facing string (the native menu, generic error messages
// from the Gemini/image-import layers) stays in sync with the rest of the UI from one source of
// truth. This file is CommonJS/Node, so it reads them directly with fs rather than sharing code
// with the renderer's ES-module i18n engine — not enough shared surface to justify a bridge
// between the two module systems.
const fs = require("node:fs");
const path = require("node:path");

function loadLocaleStrings(locale) {
  const localesDir = path.join(__dirname, "..", "..", "ui", "locales");
  try {
    return JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), "utf-8"));
  } catch (error) {
    console.warn(`Failed to load locale strings for "${locale}", falling back to Spanish: ${error.message}`);
    return JSON.parse(fs.readFileSync(path.join(localesDir, "es.json"), "utf-8"));
  }
}

module.exports = { loadLocaleStrings };
