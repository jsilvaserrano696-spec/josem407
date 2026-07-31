// INSPECTOR's deterministic structural checks — pure functions only, no Gemini call, no image
// decoding, no I/O. Never receives the real image bytes: inspector.js/axionCore.js only ever pass
// `resultMeta` (`{ mimeType, bytes }`), already derived from the real result before this module
// sees anything — so there is no code path here through which raw data could be copied, logged, or
// serialized (see the INSPECTOR v1 design writeup, section G).
const V = require("./inspectorVocabulary");
const { validateIntent } = require("./intentSchema");

/**
 * Wraps a single property read so a throwing getter degrades to "value absent" instead of
 * propagating. Used for every access on resultMeta/intent below.
 */
function safeRead(getter) {
  try {
    return getter();
  } catch {
    return undefined;
  }
}

/**
 * Checks only `resultMeta.bytes`/`resultMeta.mimeType` — never anything else on the object, even
 * if other properties happen to be present. `resultMeta` not being a plain object at all is its
 * own anomaly (MISSING_RESULT) and short-circuits the rest of this check, since there is nothing
 * meaningful left to inspect on a non-object.
 */
function checkResultMeta(resultMeta) {
  const isObject = resultMeta !== null && typeof resultMeta === "object";
  if (!isObject) {
    return { anomalies: [V.ANOMALIES.MISSING_RESULT] };
  }

  const anomalies = [];
  const bytes = safeRead(() => resultMeta.bytes);
  const mimeType = safeRead(() => resultMeta.mimeType);

  if (typeof bytes !== "number") {
    anomalies.push(V.ANOMALIES.MISSING_DATA_LENGTH);
  } else if (bytes === 0) {
    anomalies.push(V.ANOMALIES.EMPTY_DATA);
  } else if (bytes < V.MIN_PLAUSIBLE_BYTES) {
    anomalies.push(V.ANOMALIES.UNUSUALLY_SMALL_DATA);
  }

  if (typeof mimeType !== "string" || mimeType.length === 0) {
    anomalies.push(V.ANOMALIES.MISSING_MIME_TYPE);
  } else if (!V.KNOWN_IMAGE_MIME_TYPES.includes(mimeType)) {
    anomalies.push(V.ANOMALIES.UNSUPPORTED_MIME_TYPE);
  }

  return { anomalies };
}

/**
 * `validateIntent()` itself is not guaranteed getter-safe (it reads intent.operation/hasImage/etc.
 * directly, with no try/catch of its own — confirmed in intentSchema.js) — so the call itself is
 * wrapped, not just the individual field reads that follow it.
 */
function checkIntentValidity(intent) {
  const validation = safeRead(() => validateIntent(intent)) ?? { valid: false };
  if (!validation.valid) {
    return { anomalies: [V.ANOMALIES.INTENT_INVALID], stage: V.STAGE.UNKNOWN };
  }

  const operation = safeRead(() => intent.operation);
  const stage = operation === "edit" ? V.STAGE.EDIT : operation === "generate" ? V.STAGE.GENERATE : V.STAGE.UNKNOWN;
  return { anomalies: [], stage };
}

/** A single error-severity anomaly dominates any number of warnings — no counting, no averaging. */
function computeStatus(anomalies) {
  if (anomalies.length === 0) return V.STATUS.PASSED;
  const hasError = anomalies.some((code) => V.ANOMALY_SEVERITY[code] === V.SEVERITY.ERROR);
  return hasError ? V.STATUS.FAILED_STRUCTURAL_CHECK : V.STATUS.PASSED_WITH_WARNINGS;
}

/**
 * Deliberately coarse-grained (4 fixed values, never a weighted average) — a purely structural
 * check can't honestly offer more precision than "passed / with warnings / failed / not
 * evaluable".
 */
function computeScore(status) {
  if (status === V.STATUS.PASSED) return 1;
  if (status === V.STATUS.PASSED_WITH_WARNINGS) return 0.5;
  if (status === V.STATUS.FAILED_STRUCTURAL_CHECK) return 0;
  return null; // INSPECTION_ERROR
}

/**
 * Deterministic order: resultMeta-derived anomalies (size, then mimeType) always precede the
 * intent-derived one. Pure function of (resultMeta, intent) — never reads Date.now(), never
 * touches module-level state, so calling it twice with the same arguments is always idempotent.
 */
function buildReport({ resultMeta, intent }) {
  const resultMetaCheck = checkResultMeta(resultMeta);
  const intentCheck = checkIntentValidity(intent);
  const anomalies = [...resultMetaCheck.anomalies, ...intentCheck.anomalies];
  const status = computeStatus(anomalies);
  return { status, stage: intentCheck.stage, score: computeScore(status), anomalies };
}

module.exports = {
  safeRead,
  checkResultMeta,
  checkIntentValidity,
  computeStatus,
  computeScore,
  buildReport,
};
