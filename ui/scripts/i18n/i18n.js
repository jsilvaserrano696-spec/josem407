// Minimal i18n engine for the renderer: loads flat key->string JSON dictionaries from
// ui/locales/, looks up translated strings with {var} interpolation, and applies them to
// static DOM elements marked with data-i18n* attributes. No framework/build step needed for
// the app's ~90 translation keys across 2 languages.
const SUPPORTED_LOCALES = ["en", "es"];
const FALLBACK_LOCALE = "en";

const dictionaries = {};
let currentLocale = FALLBACK_LOCALE;

async function fetchDictionary(locale) {
  const url = new URL(`../../locales/${locale}.json`, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load locale "${locale}": HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Loads (and caches) both supported dictionaries, and sets the active locale. Safe to call
 * again later to switch languages at runtime — already-loaded dictionaries aren't re-fetched.
 */
async function loadTranslations(locale) {
  await Promise.all(
    SUPPORTED_LOCALES.filter((code) => !dictionaries[code]).map(async (code) => {
      dictionaries[code] = await fetchDictionary(code);
    })
  );
  currentLocale = SUPPORTED_LOCALES.includes(locale) ? locale : FALLBACK_LOCALE;
}

function getLocale() {
  return currentLocale;
}

function interpolate(str, vars) {
  return Object.entries(vars).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), str);
}

/**
 * Looks up a UI-copy string. Missing keys fall back to English, then to the key itself — a
 * visible "some.key" on screen is a bug you can't miss, which is the right failure mode for
 * copy that's supposed to always exist.
 */
function t(key, vars) {
  const dict = dictionaries[currentLocale] ?? {};
  const enDict = dictionaries[FALLBACK_LOCALE] ?? {};
  const template = dict[key] ?? enDict[key] ?? key;
  return vars ? interpolate(template, vars) : template;
}

/**
 * Same lookup as t(), but for data-derived labels (style/template names) where a missing key
 * is expected — e.g. a user-added template has no translation entry — not a bug. Falls back to
 * the caller-supplied default instead of the raw key string.
 */
function tOrDefault(key, fallback) {
  const dict = dictionaries[currentLocale] ?? {};
  const enDict = dictionaries[FALLBACK_LOCALE] ?? {};
  return dict[key] ?? enDict[key] ?? fallback;
}

const ATTRIBUTE_BINDINGS = [
  ["data-i18n", (el, value) => { el.textContent = value; }],
  ["data-i18n-placeholder", (el, value) => el.setAttribute("placeholder", value)],
  ["data-i18n-title", (el, value) => el.setAttribute("title", value)],
  ["data-i18n-aria-label", (el, value) => el.setAttribute("aria-label", value)],
  ["data-i18n-alt", (el, value) => el.setAttribute("alt", value)],
];

/**
 * Applies translations to every element under `root` carrying a data-i18n* attribute. Safe to
 * call repeatedly (e.g. on every language switch) — it's a pure re-render of static copy.
 */
function applyTranslations(root = document) {
  for (const [attr, apply] of ATTRIBUTE_BINDINGS) {
    root.querySelectorAll(`[${attr}]`).forEach((el) => apply(el, t(el.getAttribute(attr))));
  }
  document.documentElement.lang = currentLocale;
}

export { loadTranslations, getLocale, t, tOrDefault, applyTranslations };
