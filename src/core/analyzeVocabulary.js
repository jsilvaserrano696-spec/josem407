// Pure data for ANALYZE's deterministic heuristic classifier — no functions with branching logic
// live here. Every matcher is a static alternation of literal words/phrases anchored with \b, so
// matching cost is linear in input length regardless of what the user typed (see
// analyzeHeuristics.js's normalizeForMatching/capForAnalysis for how input size is bounded).
// Spanish only, since this is what displayPrompt/userPrompt always is (see ARCHITECTURE.md).

// Words stripped from the very front of a captured target/protect phrase. Includes common
// contractions ("del", "al") and the bare preposition "a" alongside articles/demonstratives, since
// all of them are equally noise at the start of a noun phrase for this purpose.
const LEADING_DETERMINERS = [
  "a", "al", "del",
  "el", "la", "los", "las",
  "un", "una", "unos", "unas",
  "este", "esta", "estos", "estas",
  "ese", "esa", "esos", "esas",
];

// Each entry's own match consumes the negation word AND, when present, the verb that immediately
// follows it (e.g. "sin cambiar", "no toques") — so the protect zone that starts right after never
// leaks that verb into the captured element (see splitIntoClauses()).
const NEGATION_MARKERS = [
  /\bsin\s+(?:cambiar|tocar|modificar|alterar)?\s*/i,
  /\bno\s+(?:cambies|toques|modifiques|alteres)\s*/i,
  /\bpero\s+(?:no\s+(?:cambies|toques|modifiques|alteres)?|conserva\w*|manten\w*|mant[eé]n\w*)\s*/i,
  /\bexcepto\s*/i,
  /\bmenos\s*/i,
  /\bsalvo\s*/i,
  /\bmanteniendo\s*/i,
  /\bconservando\s*/i,
  /\bpreservando\s*/i,
  /\by\s+conserva\w*\s*/i,
];

// Checked in this exact order — the first rule with any matching pattern wins, regardless of
// where in the text it matches (see analyzeHeuristics.js#detectAction and ARCHITECTURE-level
// design notes on precedence). replace_element's matchers carry two capture groups: group 1 is
// the verb, group 2 is the text between the verb and "por"/"con" — that's the target, captured
// directly instead of via the generic post-verb window used by every other action.
const ACTION_RULES = [
  {
    action: "replace_element",
    matchers: [
      /\b(cambia(?:r)?)\b(.+?)\bpor\b/i,
      /\b(sustituye|sustituir)\b(.+?)\bpor\b/i,
      /\b(reemplaza|reemplazar)\b(.+?)\b(?:por|con)\b/i,
    ],
  },
  {
    action: "remove_element",
    matchers: [/\b(elimina|eliminar|quita|quitar|borra|borrar|saca|sacar)\b/i],
  },
  {
    action: "add_element",
    matchers: [/\b(añade|añadir|agrega|agregar|incluye|incluir|coloca|colocar|pon|poner)\b/i],
  },
  {
    action: "transform_style",
    matchers: [
      /\bestilo\b/i,
      /\bconvi[ée]rte(?:lo)?\b/i,
      /\b(acuarela|[óo]leo|anime|c[óo]mic|cinemat\w*|fantas[íi]a|medieval|sci-?fi|vintage|met[áa]lico)\b/i,
    ],
  },
  {
    action: "adjust_composition",
    matchers: [/\b(encuadre|composici[óo]n|[áa]ngulo de c[áa]mara|plano|perspectiva|recuadre)\b/i],
  },
  {
    // Generic catch-all for a specific-but-not-structural change. Checked last among the concrete
    // actions on purpose: every rule above targets a more specific pattern that would otherwise be
    // swallowed by this one's broad verb list (e.g. "cambia ... por ..." must resolve to
    // replace_element, not here).
    action: "change_attribute",
    matchers: [/\b(cambia|cambiar|haz|hacer|ajusta|ajustar|modifica|modificar|mejora|mejorar)\b/i],
  },
];

// Only consulted when nothing in ACTION_RULES matched at all.
const GENERIC_IMPROVE_MARKERS = [
  /\bm[áa]s bonito\b/i,
  /\bmejor\b/i,
  /\bm[áa]s (épico|epico|realista|profesional|atractivo)\b/i,
  /\bmejora(r)? esto\b/i,
  /\bhazlo mejor\b/i,
];

// "mejorar"/"mejora" alone never determines change_attribute — see
// analyzeHeuristics.js#detectAction. Only consulted when the change_attribute rule's matched verb
// was specifically "mejora"/"mejorar" AND the captured target is *exactly* one of these generic
// referents (nothing more specific alongside it). Deliberately small and closed, per design: this
// is not a general "vague noun" detector, only the handful of words the user actually refers to
// the whole image/result with.
const GENERIC_IMPROVEMENT_REFERENTS = ["esto", "eso", "imagen", "foto", "resultado", "lo"];

const CONSTRAINT_RULES = [
  { constraint: "no_text_overlay", matchers: [/\bno (añadas|agregues|pongas) texto\b/i, /\bsin texto\b/i] },
  {
    constraint: "preserve_aspect_ratio",
    matchers: [
      /\bsin cambiar (el|la) (aspecto|relaci[óo]n de aspecto)\b/i,
      /\bmant[ée]n (el|la) (aspecto|formato)\b/i,
    ],
  },
  { constraint: "no_watermark", matchers: [/\bsin marca de agua\b/i] },
];

// Deliberately excludes "fondo"/"frente": both are common, unambiguous target/protect nouns in
// image editing (background; a face's forehead) that happen to also have a positional sense —
// including them here produced false ambiguity on ordinary requests like "sin tocar el fondo".
const SPATIAL_MARKERS = [
  /\bizquierda\b/i, /\bderecha\b/i, /\barriba\b/i, /\babajo\b/i, /\bcentro\b/i,
];
const COLLECTIVE_MARKERS = [
  /\blas dem[áa]s\b/i, /\blos dem[áa]s\b/i, /\bel resto\b/i, /\blos otros\b/i, /\blas otras\b/i, /\btodos\b/i, /\btodas\b/i,
];

// change_attribute-only: a recognized trailing attribute VALUE (in v1, colors) is split off the
// captured target instead of kept as part of it — e.g. "coche rojo" -> target "coche". An
// unrecognized trailing word (e.g. "deportivo") is never split off: v1 deliberately does not
// attempt generic postnominal-adjective stripping, only this closed, explicit vocabulary.
const ATTRIBUTE_VALUE_WORDS = [
  "rojo", "roja", "azul", "verde", "amarillo", "amarilla", "negro", "negra", "blanco", "blanca",
  "gris", "morado", "morada", "rosa", "naranja", "marron", "dorado", "dorada", "plateado", "plateada",
  "violeta", "turquesa", "beige", "celeste", "purpura",
];

const DEFAULT_PROTECT_ENTRIES = [
  { type: "attribute", ref: "composition", of: null, source: "inferred", note: null },
  { type: "attribute", ref: "camera_angle", of: null, source: "inferred", note: null },
];

// Words after the matched verb that end the captured target window, checked in addition to the
// hard MAX_TARGET_PHRASE_WORDS cap below.
const STOP_MARKERS_FOR_TARGET_WINDOW = [",", " sin ", " pero ", " no ", " excepto ", " menos ", " por ", " manteniendo ", " conservando "];
const MAX_TARGET_PHRASE_WORDS = 6;

// Analysis-only cap (see analyzeHeuristics.js#capForAnalysis) — request.text is NEVER truncated;
// only the working copy used for pattern matching is, so cost stays bounded regardless of how long
// the actual user prompt is.
const MAX_ANALYSIS_LENGTH = 2000;

module.exports = {
  LEADING_DETERMINERS,
  NEGATION_MARKERS,
  ACTION_RULES,
  GENERIC_IMPROVE_MARKERS,
  CONSTRAINT_RULES,
  SPATIAL_MARKERS,
  COLLECTIVE_MARKERS,
  ATTRIBUTE_VALUE_WORDS,
  GENERIC_IMPROVEMENT_REFERENTS,
  DEFAULT_PROTECT_ENTRIES,
  STOP_MARKERS_FOR_TARGET_WINDOW,
  MAX_TARGET_PHRASE_WORDS,
  MAX_ANALYSIS_LENGTH,
};
