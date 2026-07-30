// AXION Intent Schema v1 — the internal contract ANALYZE -> DIRECTOR -> PROMPT ENGINE -> EXECUTE
// -> INSPECTOR will eventually share. See AXION_INTENT_SCHEMA.md for the full spec, field-by-field
// rationale and worked examples. This module only defines the shape and validates it — nothing
// here is wired into axionCore.js, analyze.js, director.js or inspector.js yet.
//
// `operation` and `hasImage` are deliberately both present and are NOT redundant: `operation` is
// which pipeline ran (edit vs. generate), `hasImage` is a fact about the actual payload. In v1
// they're expected to agree (edit -> true, generate -> false) because that's the only combination
// the current EXECUTE stage (imageEditor.js) supports, but validateIntent() checks this as a rule
// of today's business logic, not as a structural constraint baked into the shape itself — a future
// operation (e.g. "generate with a reference image") could legitimately break that agreement
// without a schema change.

const SCHEMA_VERSION = 1;

const VALID_OPERATIONS = ["edit", "generate"];
const VALID_PROTECT_TYPES = ["element", "attribute", "region", "rule"];
const VALID_PROTECT_SOURCES = ["user", "inferred"];

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structurally-safe defaults — every field present, every array/object freshly allocated. NOT
 * guaranteed to pass validateIntent() as-is (e.g. `operation` has no meaningful default), since
 * there is no safe guess for which operation is intended. Use as a base to merge real data into
 * via buildIntent(), not as a ready-to-use Intent.
 */
function createEmptyIntent() {
  return {
    schemaVersion: SCHEMA_VERSION,
    operation: null,
    hasImage: false,
    request: {
      text: "",
      styleId: null,
    },
    analysis: {
      targets: [],
      action: null,
      assumptions: [],
      confidence: null,
    },
    direction: {
      styleId: null,
      priorities: [],
      notes: [],
    },
    protect: [],
    constraints: [],
    metadata: {
      createdAt: null,
      source: null,
    },
  };
}

// Shared normalization rule used everywhere below: a field left `undefined` is filled with a safe
// default (tolerant of absent data); a field present with the wrong container type is passed
// through untouched rather than silently replaced or coerced (buildIntent never hides a clearly
// invalid type — that's validateIntent()'s job to report). Either way the input itself is never
// mutated: defaults and clones are always new objects/arrays.

function buildStringArray(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return value;
  return value.slice();
}

function buildProtectEntry(entry) {
  if (!isPlainObject(entry)) return entry;
  return {
    type: entry.type,
    ref: entry.ref,
    of: entry.of === undefined ? null : entry.of,
    source: entry.source === undefined ? "inferred" : entry.source,
    note: entry.note === undefined ? null : entry.note,
  };
}

function buildProtectList(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return value;
  return value.map(buildProtectEntry);
}

function buildRequest(value) {
  if (value === undefined) return { text: "", styleId: null };
  if (!isPlainObject(value)) return value;
  return {
    text: value.text === undefined ? "" : value.text,
    styleId: value.styleId === undefined ? null : value.styleId,
  };
}

function buildAnalysis(value) {
  if (value === undefined) return { targets: [], action: null, assumptions: [], confidence: null };
  if (!isPlainObject(value)) return value;
  return {
    targets: buildStringArray(value.targets),
    action: value.action === undefined ? null : value.action,
    assumptions: buildStringArray(value.assumptions),
    confidence: value.confidence === undefined ? null : value.confidence,
  };
}

function buildDirection(value) {
  if (value === undefined) return { styleId: null, priorities: [], notes: [] };
  if (!isPlainObject(value)) return value;
  return {
    styleId: value.styleId === undefined ? null : value.styleId,
    priorities: buildStringArray(value.priorities),
    notes: buildStringArray(value.notes),
  };
}

function buildMetadata(value) {
  if (value === undefined) return { createdAt: null, source: null };
  if (!isPlainObject(value)) return value;
  return {
    createdAt: value.createdAt === undefined ? null : value.createdAt,
    source: value.source === undefined ? null : value.source,
  };
}

/**
 * Normalizes a partial/loose object into full Intent shape. Tolerant of missing fields (filled
 * with safe defaults) but never coerces or discards a field that's present with an unexpected
 * type — it's passed through as-is so validateIntent() can report it. Never mutates `partial` or
 * anything nested inside it; every returned array/object is newly allocated. A non-object
 * `partial` (null, a string, etc.) is treated the same as no data at all, since there's nothing
 * structured to merge from it.
 */
function buildIntent(partial) {
  const source = isPlainObject(partial) ? partial : {};
  return {
    schemaVersion: source.schemaVersion === undefined ? SCHEMA_VERSION : source.schemaVersion,
    operation: source.operation === undefined ? null : source.operation,
    hasImage: source.hasImage === undefined ? false : source.hasImage,
    request: buildRequest(source.request),
    analysis: buildAnalysis(source.analysis),
    direction: buildDirection(source.direction),
    protect: buildProtectList(source.protect),
    constraints: buildStringArray(source.constraints),
    metadata: buildMetadata(source.metadata),
  };
}

function validateStringArrayField(value, label, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${label}[${index}] must be a string.`);
    }
  });
}

function validateProtectList(value, errors) {
  if (!Array.isArray(value)) {
    errors.push("protect must be an array.");
    return;
  }
  value.forEach((entry, index) => {
    const prefix = `protect[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }
    if (!VALID_PROTECT_TYPES.includes(entry.type)) {
      errors.push(`${prefix}.type must be one of ${VALID_PROTECT_TYPES.join(", ")}, got ${JSON.stringify(entry.type)}.`);
    }
    if (typeof entry.ref !== "string" || entry.ref.trim() === "") {
      errors.push(`${prefix}.ref must be a non-empty string.`);
    }
    if (entry.of !== null && typeof entry.of !== "string") {
      errors.push(`${prefix}.of must be a string or null.`);
    }
    if (!VALID_PROTECT_SOURCES.includes(entry.source)) {
      errors.push(`${prefix}.source must be one of ${VALID_PROTECT_SOURCES.join(", ")}, got ${JSON.stringify(entry.source)}.`);
    }
    if (entry.note !== null && typeof entry.note !== "string") {
      errors.push(`${prefix}.note must be a string or null.`);
    }
  });
}

/**
 * Validates an Intent's shape without throwing — always returns { valid, errors }, even for
 * garbage input (wrong type, null, missing sections). Does not attempt to fix anything; a
 * contradiction between `operation` and `hasImage` is reported, never silently resolved.
 */
function validateIntent(intent) {
  const errors = [];

  if (!isPlainObject(intent)) {
    return { valid: false, errors: ["Intent must be a plain object."] };
  }

  if (intent.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}, got ${JSON.stringify(intent.schemaVersion)}.`);
  }

  const hasValidOperation = VALID_OPERATIONS.includes(intent.operation);
  if (!hasValidOperation) {
    errors.push(`operation must be one of ${VALID_OPERATIONS.join(", ")}, got ${JSON.stringify(intent.operation)}.`);
  }

  const hasValidHasImage = typeof intent.hasImage === "boolean";
  if (!hasValidHasImage) {
    errors.push("hasImage must be a boolean.");
  }

  // Only checked once both fields individually have a sane type/value — otherwise this would pile
  // a confusing second error on top of one already reported above.
  if (hasValidOperation && hasValidHasImage) {
    if (intent.operation === "edit" && intent.hasImage === false) {
      errors.push('operation "edit" requires hasImage to be true — editing needs a source image.');
    }
    if (intent.operation === "generate" && intent.hasImage === true) {
      errors.push('operation "generate" is inconsistent with hasImage true — generation has no source image in v1.');
    }
  }

  if (!isPlainObject(intent.request)) {
    errors.push("request must be an object.");
  } else {
    if (typeof intent.request.text !== "string") {
      errors.push("request.text must be a string.");
    }
    if (intent.request.styleId !== null && typeof intent.request.styleId !== "string") {
      errors.push("request.styleId must be a string or null.");
    }
  }

  if (!isPlainObject(intent.analysis)) {
    errors.push("analysis must be an object.");
  } else {
    validateStringArrayField(intent.analysis.targets, "analysis.targets", errors);
    if (intent.analysis.action !== null && typeof intent.analysis.action !== "string") {
      errors.push("analysis.action must be a string or null.");
    }
    validateStringArrayField(intent.analysis.assumptions, "analysis.assumptions", errors);
    const confidence = intent.analysis.confidence;
    if (confidence !== null && (typeof confidence !== "number" || Number.isNaN(confidence) || confidence < 0 || confidence > 1)) {
      errors.push("analysis.confidence must be null or a number between 0 and 1.");
    }
  }

  if (!isPlainObject(intent.direction)) {
    errors.push("direction must be an object.");
  } else {
    if (intent.direction.styleId !== null && typeof intent.direction.styleId !== "string") {
      errors.push("direction.styleId must be a string or null.");
    }
    validateStringArrayField(intent.direction.priorities, "direction.priorities", errors);
    validateStringArrayField(intent.direction.notes, "direction.notes", errors);
  }

  validateProtectList(intent.protect, errors);
  validateStringArrayField(intent.constraints, "constraints", errors);

  if (!isPlainObject(intent.metadata)) {
    errors.push("metadata must be an object.");
  } else {
    if (intent.metadata.createdAt !== null && typeof intent.metadata.createdAt !== "number") {
      errors.push("metadata.createdAt must be a number or null.");
    }
    if (intent.metadata.source !== null && typeof intent.metadata.source !== "string") {
      errors.push("metadata.source must be a string or null.");
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { SCHEMA_VERSION, createEmptyIntent, buildIntent, validateIntent };
