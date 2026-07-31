// Closed vocabulary for INSPECTOR's deterministic structural report — status/severity/stage/
// anomaly codes are fixed constants, never free text, never built dynamically. Nothing here
// touches image content, prompts, or the Intent's own free-text fields (see
// inspectorHeuristics.js for how the report is assembled from resultMeta/intent).

const STATUS = {
  PASSED: "passed",
  PASSED_WITH_WARNINGS: "passed_with_warnings",
  FAILED_STRUCTURAL_CHECK: "failed_structural_check",
  // Reserved exclusively for inspector.js's own outermost catch — never produced by
  // inspectorHeuristics.js itself (every read in there is already defensive; see safeRead()).
  INSPECTION_ERROR: "inspection_error",
};

const SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
};

const STAGE = {
  EDIT: "edit",
  GENERATE: "generate",
  UNKNOWN: "unknown",
};

const ANOMALIES = {
  MISSING_RESULT: "missing_result",
  MISSING_DATA_LENGTH: "missing_data_length",
  EMPTY_DATA: "empty_data",
  UNUSUALLY_SMALL_DATA: "unusually_small_data",
  MISSING_MIME_TYPE: "missing_mime_type",
  UNSUPPORTED_MIME_TYPE: "unsupported_mime_type",
  INTENT_INVALID: "intent_invalid",
};

// Every anomaly's severity, fixed. UNUSUALLY_SMALL_DATA is deliberately "warning", never
// "error" — a size threshold alone must never be able to fail/block the pipeline (see
// computeStatus() in inspectorHeuristics.js and MIN_PLAUSIBLE_BYTES below).
const ANOMALY_SEVERITY = {
  [ANOMALIES.MISSING_RESULT]: SEVERITY.ERROR,
  [ANOMALIES.MISSING_DATA_LENGTH]: SEVERITY.ERROR,
  [ANOMALIES.EMPTY_DATA]: SEVERITY.ERROR,
  [ANOMALIES.UNUSUALLY_SMALL_DATA]: SEVERITY.WARNING,
  [ANOMALIES.MISSING_MIME_TYPE]: SEVERITY.WARNING,
  [ANOMALIES.UNSUPPORTED_MIME_TYPE]: SEVERITY.WARNING,
  [ANOMALIES.INTENT_INVALID]: SEVERITY.WARNING,
};

// Reflects what src/gemini/imageEditor.js can actually produce
// (`imagePart.inlineData.mimeType || "image/png"`), not a general image-mimetype list.
const KNOWN_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

// A real PNG/JPEG/WEBP from an image model is realistically tens of kilobytes at minimum even
// at low resolution — 256 bytes is far below any legitimate output, so this only catches
// genuinely truncated/near-empty results, never a real (if small) image. A tripwire for
// "basically empty", not an attempt to model "what a normal image size looks like" (no
// production data exists yet to calibrate that more finely — see the INSPECTOR v1 design
// writeup's residual-risks section).
const MIN_PLAUSIBLE_BYTES = 256;

module.exports = {
  STATUS,
  SEVERITY,
  STAGE,
  ANOMALIES,
  ANOMALY_SEVERITY,
  KNOWN_IMAGE_MIME_TYPES,
  MIN_PLAUSIBLE_BYTES,
};
