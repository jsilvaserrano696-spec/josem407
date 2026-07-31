// Closed vocabulary for DIRECTOR's deterministic decisions — direction.priorities/direction.notes
// must never contain free-form or dynamically-built text (see the DIRECTOR v1 design writeup).
// directorHeuristics.js only ever selects among these fixed values; it never constructs a new
// string. This closure is an implementation discipline, not a schema constraint: intentSchema.js's
// validateIntent() only checks that priorities/notes are string arrays, the same as any other
// AXION Intent field — see AXION_INTENT_SCHEMA.md ("vocabulario abierto, no forma cerrada").

const PRIORITIES = {
  EXPLICIT_USER_PROTECTION: "explicit_user_protection",
  PROTECTED_ELEMENTS: "protected_elements",
  REQUESTED_CHANGE: "requested_change",
  CREATIVE_BRIEF: "creative_brief",
  STYLE_CONSISTENCY: "style_consistency",
  OVERALL_QUALITY: "overall_quality",
};

const NOTES = {
  LOW_CONFIDENCE:
    "Confianza baja: priorizar la preservación sobre la intensidad del cambio solicitado.",
  MEDIUM_CONFIDENCE:
    "Confianza media: aplicar el cambio de forma moderada, verificando que no contradiga otros elementos de la imagen.",
  CONTRADICTION:
    "Contradicción entre objetivo y protección detectada; no se resuelve automáticamente — proceder con la interpretación más conservadora posible.",
  NO_TARGET_IDENTIFIED:
    "Sin objetivo identificado por ANALYZE; evitar cambios amplios no solicitados explícitamente.",
  GENERIC_IMPROVEMENT:
    "Petición genérica de mejora: priorizar coherencia con lo ya existente antes que cambios drásticos.",
  ADD_ELEMENT: "Añadir el elemento pedido sin alterar el resto de la composición.",
  REMOVE_ELEMENT: "Eliminar únicamente el elemento indicado; el resto debe permanecer intacto.",
  REPLACE_ELEMENT:
    "Sustituir el elemento indicado sin afectar a los elementos protegidos ni a la composición general.",
  CHANGE_ATTRIBUTE:
    "Aplicar el cambio de atributo de forma clara y visible, preservando todo lo no mencionado.",
  TRANSFORM_STYLE:
    "Aplicar el estilo de forma coherente, preservando identidad y composición.",
  ADJUST_COMPOSITION:
    "Ajustar encuadre/composición según lo solicitado, sin alterar el contenido de la escena más allá de lo pedido.",
  UNKNOWN_EDIT: "No se reconoció una acción concreta; abordar con la máxima cautela posible.",
  CONSTRAINT_NO_TEXT_OVERLAY: "No añadir texto ni tipografía.",
  CONSTRAINT_PRESERVE_ASPECT_RATIO: "Mantener la relación de aspecto original.",
  CONSTRAINT_NO_WATERMARK: "No añadir marcas de agua.",
};

// action -> { priorities: [...PRIORITIES values, base order], note: NOTES value | null, expectsTarget }
// expectsTarget: whether an empty analysis.targets is itself noteworthy for this action (drives
// NOTES.NO_TARGET_IDENTIFIED — see directorHeuristics.js#computeNotes).
const ACTION_PROFILES = {
  generate_image: { priorities: [PRIORITIES.CREATIVE_BRIEF], note: null, expectsTarget: false },
  generic_improve: {
    priorities: [PRIORITIES.PROTECTED_ELEMENTS, PRIORITIES.OVERALL_QUALITY],
    note: NOTES.GENERIC_IMPROVEMENT,
    expectsTarget: false,
  },
  add_element: {
    priorities: [PRIORITIES.REQUESTED_CHANGE, PRIORITIES.PROTECTED_ELEMENTS],
    note: NOTES.ADD_ELEMENT,
    expectsTarget: true,
  },
  remove_element: {
    priorities: [PRIORITIES.REQUESTED_CHANGE, PRIORITIES.PROTECTED_ELEMENTS],
    note: NOTES.REMOVE_ELEMENT,
    expectsTarget: true,
  },
  replace_element: {
    priorities: [PRIORITIES.REQUESTED_CHANGE, PRIORITIES.PROTECTED_ELEMENTS],
    note: NOTES.REPLACE_ELEMENT,
    expectsTarget: true,
  },
  change_attribute: {
    priorities: [PRIORITIES.REQUESTED_CHANGE, PRIORITIES.PROTECTED_ELEMENTS],
    note: NOTES.CHANGE_ATTRIBUTE,
    expectsTarget: true,
  },
  transform_style: {
    priorities: [PRIORITIES.STYLE_CONSISTENCY, PRIORITIES.PROTECTED_ELEMENTS],
    note: NOTES.TRANSFORM_STYLE,
    expectsTarget: true,
  },
  adjust_composition: {
    priorities: [PRIORITIES.REQUESTED_CHANGE, PRIORITIES.PROTECTED_ELEMENTS],
    note: NOTES.ADJUST_COMPOSITION,
    expectsTarget: true,
  },
  unknown_edit: {
    priorities: [PRIORITIES.PROTECTED_ELEMENTS],
    note: NOTES.UNKNOWN_EDIT,
    expectsTarget: false,
  },
};

// Any analysis.action not present above (e.g. a future ANALYZE action DIRECTOR doesn't know about
// yet) resolves to this same conservative profile — never throws on an unrecognized key.
const DEFAULT_ACTION_PROFILE = ACTION_PROFILES.unknown_edit;

const CONSTRAINT_NOTES = {
  no_text_overlay: NOTES.CONSTRAINT_NO_TEXT_OVERLAY,
  preserve_aspect_ratio: NOTES.CONSTRAINT_PRESERVE_ASPECT_RATIO,
  no_watermark: NOTES.CONSTRAINT_NO_WATERMARK,
};

// Stripped by directorHeuristics.js#normalizeRefForComparison before comparing a target against a
// protect ref — the schema doesn't guarantee refs arrive pre-stripped of a leading article/
// contraction (that's only ANALYZE's own current formatting convention, not a contract), so
// DIRECTOR's own contradiction check stays robust to it independently, without importing
// analyzeVocabulary.js. Includes "al"/"del" (a + el / de + el) alongside the plain articles for
// the same reason.
const LEADING_ARTICLES = ["el", "la", "los", "las", "un", "una", "unos", "unas", "al", "del"];

// classifyConfidence() bucket boundaries — see directorHeuristics.js. Both are inclusive lower
// bounds: exactly 0.4 is MEDIUM, exactly 0.7 is HIGH.
const CONFIDENCE_HIGH_THRESHOLD = 0.7;
const CONFIDENCE_MEDIUM_THRESHOLD = 0.4;

module.exports = {
  PRIORITIES,
  NOTES,
  ACTION_PROFILES,
  DEFAULT_ACTION_PROFILE,
  CONSTRAINT_NOTES,
  LEADING_ARTICLES,
  CONFIDENCE_HIGH_THRESHOLD,
  CONFIDENCE_MEDIUM_THRESHOLD,
};
