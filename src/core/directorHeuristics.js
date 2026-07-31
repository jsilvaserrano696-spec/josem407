// DIRECTOR's deterministic decision logic — pure functions only, no Gemini call, no I/O, no
// config access, no logging (never logs the Intent/prompt/image data — see ARCHITECTURE.md's
// AXION CORE section). Deliberately self-contained: does not import analyzeHeuristics.js, so
// DIRECTOR's contradiction/normalization logic never depends on ANALYZE's internals changing.
//
// Every function here operates on plain data (action/targets/protect/constraints/confidence), not
// on a whole Intent object — director.js owns the Intent-shaped orchestration (validity gate,
// reading fields, reassembling the result); this module only ever computes the new `direction`.
const V = require("./directorVocabulary");

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function normalizeRefForComparison(ref) {
  const normalized = String(ref).normalize("NFD").replace(COMBINING_DIACRITICS, "").toLowerCase().trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 1 && V.LEADING_ARTICLES.includes(words[0])) {
    return words.slice(1).join(" ");
  }
  return words.join(" ");
}

/**
 * `null` and anything below CONFIDENCE_MEDIUM_THRESHOLD are both "LOW" — an unknown confidence is
 * treated with the same caution as a confirmed low one, never as a silent pass-through.
 */
function classifyConfidence(confidence) {
  if (confidence === null || confidence < V.CONFIDENCE_MEDIUM_THRESHOLD) return "LOW";
  if (confidence < V.CONFIDENCE_HIGH_THRESHOLD) return "MEDIUM";
  return "HIGH";
}

function hasExplicitUserProtection(protect) {
  return protect.some((entry) => entry.source === "user");
}

/**
 * Only ever reports — never resolves or removes anything. A target and a user-sourced protect
 * entry that normalize to the same string are treated as contradictory regardless of case/accents.
 */
function detectContradiction(targets, protect) {
  const normalizedTargets = targets.map(normalizeRefForComparison);
  return protect.some(
    (entry) => entry.source === "user" && normalizedTargets.includes(normalizeRefForComparison(entry.ref))
  );
}

function resolveActionProfile(action) {
  return V.ACTION_PROFILES[action] ?? V.DEFAULT_ACTION_PROFILE;
}

/**
 * Repositions `itemToMove` to sit immediately before `anchor`, preserving the relative order of
 * everything else. A no-op (returns a shallow copy) if either isn't present — never throws, never
 * invents a position for something that isn't there.
 */
function moveBefore(list, itemToMove, anchor) {
  if (!list.includes(itemToMove) || !list.includes(anchor)) return list.slice();
  const rest = list.filter((item) => item !== itemToMove);
  const anchorIndex = rest.indexOf(anchor);
  return [...rest.slice(0, anchorIndex), itemToMove, ...rest.slice(anchorIndex)];
}

/**
 * Precedence, applied in this exact order (see the DIRECTOR v1 design writeup, section F):
 * 1. Start from the action's base profile.
 * 2. If conservative (low confidence or contradiction), move protected_elements before
 *    requested_change.
 * 3. If the user explicitly protected anything, prepend explicit_user_protection — always last,
 *    so nothing above can ever displace it from position 0.
 * Deduplicated at the end as a defensive guarantee, though none of the steps above can produce a
 * duplicate on their own given the closed vocabulary in directorVocabulary.js.
 */
function computePriorities({ profile, hasUserProtection, conservative }) {
  let priorities = profile.priorities.slice();
  if (conservative) {
    priorities = moveBefore(priorities, V.PRIORITIES.PROTECTED_ELEMENTS, V.PRIORITIES.REQUESTED_CHANGE);
  }
  if (hasUserProtection) {
    priorities = [V.PRIORITIES.EXPLICIT_USER_PROTECTION, ...priorities.filter((p) => p !== V.PRIORITIES.EXPLICIT_USER_PROTECTION)];
  }
  return [...new Set(priorities)];
}

/**
 * Fixed assembly order: action note, then "no target identified" (only for actions that expect
 * one), then one note per constraint (in the order constraints already appear), then the
 * confidence-band note (LOW and MEDIUM are mutually exclusive, HIGH adds nothing), then the
 * contradiction note. Deduplicated at the end.
 */
function computeNotes({ profile, targets, constraints, confidenceBand, hasContradiction }) {
  const notes = [];
  if (profile.note) notes.push(profile.note);
  if (profile.expectsTarget && targets.length === 0) notes.push(V.NOTES.NO_TARGET_IDENTIFIED);
  for (const constraint of constraints) {
    const note = V.CONSTRAINT_NOTES[constraint];
    if (note) notes.push(note); // unknown constraint codes: no note is invented for them
  }
  if (confidenceBand === "LOW") notes.push(V.NOTES.LOW_CONFIDENCE);
  else if (confidenceBand === "MEDIUM") notes.push(V.NOTES.MEDIUM_CONFIDENCE);
  if (hasContradiction) notes.push(V.NOTES.CONTRADICTION);
  return [...new Set(notes)];
}

/**
 * The single entry point director.js calls once an Intent has already been confirmed valid. A
 * pure function of these five inputs alone — never reads any prior `direction`, so calling it
 * twice with the same arguments always returns the same result (idempotent by construction).
 */
function computeDirection({ action, targets, protect, constraints, confidence, styleId }) {
  const profile = resolveActionProfile(action);
  const hasUserProtection = hasExplicitUserProtection(protect);
  const hasContradiction = detectContradiction(targets, protect);
  const confidenceBand = classifyConfidence(confidence);
  const conservative = hasContradiction || confidenceBand === "LOW";

  const priorities = computePriorities({ profile, hasUserProtection, conservative });
  const notes = computeNotes({ profile, targets, constraints, confidenceBand, hasContradiction });

  return { styleId, priorities, notes };
}

module.exports = {
  normalizeRefForComparison,
  classifyConfidence,
  hasExplicitUserProtection,
  detectContradiction,
  resolveActionProfile,
  moveBefore,
  computePriorities,
  computeNotes,
  computeDirection,
};
