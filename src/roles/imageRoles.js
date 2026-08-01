const IMAGE_ROLES = Object.freeze({
  matrix: Object.freeze({
    id: "matrix",
    label: "MATRIX",
    priority: 0,
    modelInstruction:
      "The source image is the MATRIX and owns all final-image content: subjects, identity, " +
      "proportions, pose, objects, architecture, framing, layout, text, logos, symbols, and " +
      "defining structure. Preserve every one of those unless the user instruction explicitly " +
      "names it as something to change.",
  }),
  reference: Object.freeze({
    id: "reference",
    label: "REFERENCE",
    priority: 10,
    modelInstruction:
      "The reference image is a sealed visual sample, not a source of content. Transfer only " +
      "the specific visual qualities explicitly requested by the user. Never copy or introduce " +
      "its text, lettering, captions, logos, watermarks, symbols, people, faces, animals, " +
      "objects, buildings, scenery, or composition unless the user explicitly asks for that " +
      "exact category. Never replace the MATRIX subject or identity with the reference subject.",
  }),
});

module.exports = { IMAGE_ROLES };
