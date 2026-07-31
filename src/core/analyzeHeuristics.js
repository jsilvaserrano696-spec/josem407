// ANALYZE's deterministic heuristic classifier — pure functions only, no Gemini call, no I/O, no
// config access. Reads (never writes) the user's own text and produces the pieces analyze.js
// assembles into an AXION Intent's `analysis`/`protect`/`constraints`. See ARCHITECTURE.md's
// AXION CORE section and AXION_INTENT_SCHEMA.md for how this fits into the pipeline.
//
// Index safety note: every string search below that relies on a match's character offset
// (splitIntoClauses, extractConstraints, captureTargetWindow) matches directly against the
// original (or a same-length, space-masked) string using regexes whose accented/unaccented
// variants are written out explicitly (e.g. `[áa]`) or via `.toLowerCase()` (which never changes
// string length for the characters this app deals with). NFD accent-folding
// (normalizeForMatching) intentionally never feeds an index/slice operation — it's only used for
// whole-word equality checks (stripLeadingDeterminers, detectContradiction), where losing the
// original offsets doesn't matter.
const V = require("./analyzeVocabulary");

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function normalizeForMatching(text) {
  return text.normalize("NFD").replace(COMBINING_DIACRITICS, "").toLowerCase();
}

/**
 * Bounds analysis cost to a fixed constant regardless of actual input size. Callers must keep
 * using the original, untruncated string for anything that ends up in the Intent's `request.text`
 * — this truncated copy exists only for pattern matching.
 */
function capForAnalysis(rawText) {
  if (rawText.length <= V.MAX_ANALYSIS_LENGTH) {
    return { text: rawText, wasTruncated: false };
  }
  return { text: rawText.slice(0, V.MAX_ANALYSIS_LENGTH), wasTruncated: true };
}

function stripLeadingDeterminers(phrase) {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && V.LEADING_DETERMINERS.includes(normalizeForMatching(words[0]))) {
    words.shift();
  }
  return words.join(" ");
}

// change_attribute-only (see ATTRIBUTE_VALUE_WORDS): splits off a single recognized trailing
// value word. Never touches a phrase down to zero words, and never strips anything beyond this
// closed vocabulary — no generic postnominal-adjective logic.
function stripKnownAttributeValueSuffix(phrase) {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return phrase;
  const last = normalizeForMatching(words[words.length - 1]);
  if (V.ATTRIBUTE_VALUE_WORDS.includes(last)) {
    return words.slice(0, -1).join(" ");
  }
  return phrase;
}

/**
 * Finds every constraint phrase present, masking each matched span with spaces of the same
 * length (preserving all other offsets) so later steps (splitIntoClauses, detectAction) never see
 * a verb that only appeared inside a constraint phrase (e.g. "añadas" in "no añadas texto").
 */
function extractConstraints(text) {
  const constraints = [];
  let masked = text;
  for (const rule of V.CONSTRAINT_RULES) {
    for (const matcher of rule.matchers) {
      const match = masked.match(matcher);
      if (match) {
        constraints.push(rule.constraint);
        masked = masked.slice(0, match.index) + " ".repeat(match[0].length) + masked.slice(match.index + match[0].length);
        break;
      }
    }
  }
  return { constraints, maskedText: masked };
}

/**
 * Splits on the earliest-occurring negation marker (checked in NEGATION_MARKERS order when tied
 * on position — ties are not expected in practice given how specific each pattern is). Everything
 * before it is the "action zone"; everything after is split further into individual protect
 * candidates on commas/" ni ".
 */
function splitIntoClauses(text) {
  let splitIndex = -1;
  let matchedLength = 0;
  for (const marker of V.NEGATION_MARKERS) {
    const match = text.match(marker);
    if (match && (splitIndex === -1 || match.index < splitIndex)) {
      splitIndex = match.index;
      matchedLength = match[0].length;
    }
  }
  if (splitIndex === -1) {
    return { actionZone: text, protectZones: [] };
  }
  const actionZone = text.slice(0, splitIndex);
  const protectZones = text
    .slice(splitIndex + matchedLength)
    .split(/,| ni /i)
    .map((zone) => zone.trim())
    .filter(Boolean);
  return { actionZone, protectZones };
}

/**
 * Captures a bounded noun-phrase window right after a matched verb: up to the nearest stop marker
 * or MAX_TARGET_PHRASE_WORDS words, whichever comes first, then strips leading determiners. This
 * is intentionally coarse — a raw bounded substring, not a grammatical parse (see the "Limitación
 * aceptada de v1" note in the design writeup): closing that gap is future work for a semantic
 * ANALYZE, not this deterministic v1.
 */
function captureTargetWindow(zone, matchStartIndex, matchedLength) {
  const after = zone.slice(matchStartIndex + matchedLength);
  let cut = after.length;
  const afterLower = after.toLowerCase();
  for (const stop of V.STOP_MARKERS_FOR_TARGET_WINDOW) {
    const idx = afterLower.indexOf(stop);
    if (idx !== -1) cut = Math.min(cut, idx);
  }
  const words = after.slice(0, cut).trim().split(/\s+/).filter(Boolean).slice(0, V.MAX_TARGET_PHRASE_WORDS);
  return stripLeadingDeterminers(words.join(" "));
}

/**
 * Runs ACTION_RULES in precedence order (first matching rule wins, regardless of match position)
 * and, only if none matched, GENERIC_IMPROVE_MARKERS. Returns "unknown_edit" if nothing at all
 * matched. replace_element uses its own two-group capture (verb, target-before-"por") instead of
 * the generic post-verb window, since the generic window would otherwise capture the replacement
 * value instead of the target.
 *
 * "mejorar"/"mejora" alone never determines change_attribute (it's the one verb in that rule's
 * list that's just as often a vague, no-target request as a specific one — unlike "cambia"/"haz"/
 * "ajusta"/"modifica", which only ever introduce a concrete change). When that specific verb is
 * what matched change_attribute, the captured target is checked against
 * GENERIC_IMPROVEMENT_REFERENTS: if the whole target IS one of those words (nothing more specific
 * alongside it), this reclassifies as generic_improve. transform_style/adjust_composition/
 * replace_element/remove_element/add_element are unaffected — they're checked earlier in
 * ACTION_RULES and never reach this branch, so "Mejora la composición"/"Mejora el estilo..." are
 * already adjust_composition/transform_style by the time change_attribute would even be tried.
 */
function detectAction(actionZone) {
  for (const rule of V.ACTION_RULES) {
    for (const matcher of rule.matchers) {
      const match = actionZone.match(matcher);
      if (!match) continue;

      if (rule.action === "replace_element") {
        const words = (match[2] ?? "").trim().split(/\s+/).filter(Boolean).slice(0, V.MAX_TARGET_PHRASE_WORDS);
        const target = stripLeadingDeterminers(words.join(" "));
        return { action: rule.action, target: target || null };
      }

      let target = captureTargetWindow(actionZone, match.index, match[0].length);
      if (rule.action === "change_attribute") {
        target = stripKnownAttributeValueSuffix(target);
        const matchedVerb = normalizeForMatching(match[0]);
        if ((matchedVerb === "mejora" || matchedVerb === "mejorar") && target && V.GENERIC_IMPROVEMENT_REFERENTS.includes(normalizeForMatching(target))) {
          return { action: "generic_improve", target: null };
        }
      }
      return { action: rule.action, target: target || null };
    }
  }

  for (const marker of V.GENERIC_IMPROVE_MARKERS) {
    if (marker.test(actionZone)) {
      return { action: "generic_improve", target: null };
    }
  }

  return { action: "unknown_edit", target: null };
}

function extractProtectEntries(protectZones) {
  return protectZones
    .map((zone) => ({ type: "element", ref: stripLeadingDeterminers(zone), of: null, source: "user", note: null }))
    .filter((entry) => entry.ref.length > 0);
}

function detectAmbiguity({ actionZone, protectZones }) {
  const whole = [actionZone, ...protectZones].join(" ");
  return V.SPATIAL_MARKERS.some((marker) => marker.test(whole)) || V.COLLECTIVE_MARKERS.some((marker) => marker.test(whole));
}

function normalizeRef(ref) {
  return normalizeForMatching(stripLeadingDeterminers(ref));
}

/**
 * Never resolves a conflict — only reports one. A target and a user-sourced protect entry that
 * normalize to the same string are both left exactly as they were found.
 */
function detectContradiction(targets, userProtectEntries) {
  const normalizedTargets = targets.map(normalizeRef);
  const conflicting = [
    ...new Set(userProtectEntries.map((entry) => entry.ref).filter((ref) => normalizedTargets.includes(normalizeRef(ref)))),
  ];
  return { hasContradiction: conflicting.length > 0, conflictingRefs: conflicting };
}

/**
 * Always a number in [0, 1] when ANALYZE runs to completion — `null` is reserved exclusively for
 * axionCore.js's outer technical fallback (analyzeRequest() throwing), never produced here.
 */
function scoreConfidence({ operation, action, targets, hasContradiction, hasAmbiguity }) {
  if (operation === "generate") return 0.9;

  let base;
  if (action === "unknown_edit") base = 0.15;
  else if (action === "generic_improve") base = 0.25;
  else if (targets.length === 0) base = 0.4;
  else base = hasAmbiguity ? 0.6 : 0.85;

  const value = hasContradiction ? Math.min(base, 0.15) : base;
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function buildAssumptions({ operation, action, wasTruncated, hasContradiction, conflictingRefs, hasAmbiguity }) {
  const assumptions = [];
  if (wasTruncated) {
    assumptions.push(
      "La petición es muy larga; solo se analizó el primer fragmento para detectar acción/objetivos (el texto completo del usuario se conserva sin cambios)."
    );
  }
  if (operation === "edit" && action === "generic_improve") {
    assumptions.push("Sin objetivo específico mencionado; interpretado como mejora general de la imagen.");
  }
  if (hasAmbiguity) {
    assumptions.push(
      "La petición hace referencia a una posición o a un grupo (\"la izquierda\", \"los demás\"...) sin identificar el elemento exacto de forma inequívoca."
    );
  }
  if (hasContradiction) {
    assumptions.push(
      `Contradicción detectada: "${conflictingRefs.join(", ")}" aparece como objetivo del cambio y como elemento a proteger simultáneamente; no se resuelve automáticamente.`
    );
  }
  return assumptions;
}

function analyzeEditText(rawUserPrompt) {
  const { text: capped, wasTruncated } = capForAnalysis(rawUserPrompt ?? "");
  const { constraints, maskedText } = extractConstraints(capped);
  const { actionZone, protectZones } = splitIntoClauses(maskedText);
  const { action, target } = detectAction(actionZone);
  const targets = target ? [target] : [];
  const userProtect = extractProtectEntries(protectZones);
  const protect = [...userProtect, ...V.DEFAULT_PROTECT_ENTRIES];
  const hasAmbiguity = detectAmbiguity({ actionZone, protectZones });
  const { hasContradiction, conflictingRefs } = detectContradiction(targets, userProtect);
  const confidence = scoreConfidence({ operation: "edit", action, targets, hasContradiction, hasAmbiguity });
  const assumptions = buildAssumptions({ operation: "edit", action, wasTruncated, hasContradiction, conflictingRefs, hasAmbiguity });
  return { action, targets, protect, constraints, confidence, assumptions };
}

function analyzeGenerateText(rawUserPrompt) {
  const { text: capped, wasTruncated } = capForAnalysis(rawUserPrompt ?? "");
  const { constraints } = extractConstraints(capped);
  const assumptions = buildAssumptions({
    operation: "generate",
    action: "generate_image",
    wasTruncated,
    hasContradiction: false,
    conflictingRefs: [],
    hasAmbiguity: false,
  });
  return { action: "generate_image", targets: [], protect: [], constraints, confidence: 0.9, assumptions };
}

module.exports = {
  normalizeForMatching,
  capForAnalysis,
  stripLeadingDeterminers,
  stripKnownAttributeValueSuffix,
  extractConstraints,
  splitIntoClauses,
  captureTargetWindow,
  detectAction,
  extractProtectEntries,
  detectAmbiguity,
  detectContradiction,
  scoreConfidence,
  buildAssumptions,
  analyzeEditText,
  analyzeGenerateText,
};
