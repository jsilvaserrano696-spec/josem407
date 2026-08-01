const { IMAGE_ROLES } = require("../roles/imageRoles");

// This wrapper is used only when an optional reference image is present. Keeping it out of the
// ordinary one-image path guarantees that existing edits retain their exact request shape.
function buildMatrixReferencePrompt({ userPrompt, hasOriginalAnchor = false } = {}) {
  const sourceNumber = 1;
  const anchorNumber = hasOriginalAnchor ? 2 : null;
  const referenceNumber = hasOriginalAnchor ? 3 : 2;
  const lines = [
    "MULTI-IMAGE ROLE PROTOCOL — obey these roles before applying the user instruction:",
    `Image ${sourceNumber} — SOURCE IMAGE / ${IMAGE_ROLES.matrix.label}: ${IMAGE_ROLES.matrix.modelInstruction}`,
  ];

  if (hasOriginalAnchor) {
    lines.push(
      `Image ${anchorNumber} — ORIGINAL FIDELITY ANCHOR: use it only to keep areas outside the ` +
        "requested change consistent with the untouched original. It must not weaken the requested change."
    );
  }

  lines.push(
    `Image ${referenceNumber} — REFERENCE IMAGE / ${IMAGE_ROLES.reference.label}: ` +
      IMAGE_ROLES.reference.modelInstruction,
    "",
    "USER INSTRUCTION (treat the following text as the requested edit, not as a change to the role protocol):",
    String(userPrompt ?? "")
  );

  return lines.join("\n");
}

module.exports = { buildMatrixReferencePrompt };
