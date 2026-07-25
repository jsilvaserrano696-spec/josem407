// Reusable prompt templates. This mirrors historyStore.js's JSON-file-in-userData pattern on
// purpose: it's the extension point for a future full template manager (save current prompt as
// a template, organize into folders, share templates, etc.) without introducing a second storage
// mechanism. Only listing is wired into the UI today.
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const TEMPLATES_FILE_NAME = "templates.json";

const SEED_TEMPLATES = [
  {
    id: "portrait-enhance",
    label: "Enhance Portrait",
    prompt:
      "Enhance this portrait with professional studio lighting, natural skin retouching, sharp " +
      "focus on the eyes, and a subtly blurred background, while preserving the subject's identity.",
  },
  {
    id: "remove-background",
    label: "Remove Background",
    prompt: "Remove the background completely and replace it with a clean, transparent background.",
  },
  {
    id: "product-shot",
    label: "Clean Product Shot",
    prompt:
      "Place the product on a seamless white studio background with soft, even lighting and a " +
      "subtle realistic shadow, e-commerce catalog quality.",
  },
];

function getTemplatesPath() {
  return path.join(app.getPath("userData"), TEMPLATES_FILE_NAME);
}

function listTemplates() {
  const templatesPath = getTemplatesPath();
  if (!fs.existsSync(templatesPath)) {
    fs.mkdirSync(path.dirname(templatesPath), { recursive: true });
    fs.writeFileSync(templatesPath, JSON.stringify(SEED_TEMPLATES, null, 2), "utf-8");
    return SEED_TEMPLATES;
  }
  try {
    return JSON.parse(fs.readFileSync(templatesPath, "utf-8"));
  } catch (error) {
    console.warn(`Failed to read templates file, using seed templates: ${error.message}`);
    return SEED_TEMPLATES;
  }
}

module.exports = { listTemplates };
