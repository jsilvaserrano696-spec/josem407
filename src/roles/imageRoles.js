const IMAGE_ROLES = Object.freeze({
  matrix: Object.freeze({
    id: "matrix",
    label: "MATRIX",
    priority: 0,
    modelInstruction:
      "The source image is the MATRIX: it owns the subject's identity, proportions, core " +
      "likeness, and defining structure. Preserve those attributes unless the user explicitly " +
      "asks to change them.",
  }),
  reference: Object.freeze({
    id: "reference",
    label: "REFERENCE",
    priority: 10,
    modelInstruction:
      "The reference image is inspiration only. Use it only for the visual qualities requested " +
      "by the user, such as style, lighting, setting, composition, palette, materials, or " +
      "clothing. Never replace the MATRIX subject or identity with the reference subject.",
  }),
});

module.exports = { IMAGE_ROLES };
