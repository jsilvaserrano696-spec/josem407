// Bridges AXION's local, deterministic ANALYZE output into PROMPT ENGINE's meta-prompt. This is
// the only place PROMPT ENGINE v1 is authorized to read from an AXION Intent — and only two
// fields: `protect` entries with `source:"user"`, and known `constraints` codes. Never reads
// `direction`, `analysis.targets`, `analysis.assumptions`, `analysis.confidence`, or inferred
// `protect` entries (see the PROMPT ENGINE v1 design writeup for why those are out of scope).
//
// Pure, synchronous, no I/O, no Gemini. Never throws — any unexpected shape on `intent` degrades
// to "nothing found" (returns `null`) rather than propagating, since the caller
// (src/gemini/promptOptimizer.js) treats a thrown error and a `null` result identically: omit the
// section, use the meta-prompt exactly as it would be without this module.
const CONSTRAINT_LABELS = {
  no_text_overlay: "no añadir texto ni tipografía",
  preserve_aspect_ratio: "mantener la relación de aspecto original",
  no_watermark: "no añadir marcas de agua",
};

/**
 * Returns `null` (meaning: the caller should omit the section entirely) when there is nothing
 * safe to report — never an empty-but-present `{ protectedRefs: [], constraintLabels: [] }`.
 * Unknown constraint codes are silently dropped, never invented into a label.
 */
function extractDetectedElements(intent) {
  if (!intent || typeof intent !== "object") return null;

  const protect = Array.isArray(intent.protect) ? intent.protect : [];
  const protectedRefs = protect
    .filter((entry) => entry && entry.source === "user" && typeof entry.ref === "string" && entry.ref.trim().length > 0)
    .map((entry) => entry.ref.trim());

  const constraints = Array.isArray(intent.constraints) ? intent.constraints : [];
  const constraintLabels = constraints.map((code) => CONSTRAINT_LABELS[code]).filter(Boolean);

  if (protectedRefs.length === 0 && constraintLabels.length === 0) return null;
  return { protectedRefs, constraintLabels };
}

module.exports = { extractDetectedElements, CONSTRAINT_LABELS };
