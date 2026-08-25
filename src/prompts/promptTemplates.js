const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { app } = require("electron");

const TEMPLATES_FILE_NAME = "templates.json";
const MAX_LABEL_LENGTH = 80;
const MAX_PROMPT_LENGTH = 8000;

const SEED_TEMPLATES = [
  {
    id: "portrait-enhance",
    label: "Enhance Portrait",
    prompt:
      "Enhance this portrait with professional studio lighting, natural skin retouching, sharp " +
      "focus on the eyes, and a subtly blurred background, while preserving the subject's identity.",
    builtIn: true,
  },
  {
    id: "remove-background",
    label: "Remove Background",
    prompt:
      "Precisely isolate the main subject and replace the entire background with uniform pure white " +
      "(#FFFFFF), with no shadows, floor, texture, or additional elements. Preserve every edge and " +
      "detail of the subject unchanged.",
    builtIn: true,
  },
  {
    id: "product-shot",
    label: "Clean Product Shot",
    prompt:
      "Place the product on a seamless white studio background with soft, even lighting and a " +
      "subtle realistic shadow, e-commerce catalog quality.",
    builtIn: true,
  },
];

const BUILT_IN_IDS = new Set(SEED_TEMPLATES.map(({ id }) => id));

function normalizeText(value, maxLength, field) {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${field} cannot be empty`);
  if (normalized.length > maxLength) throw new TypeError(`${field} is too long`);
  return normalized;
}

function normalizeStoredTemplate(value) {
  if (!value || typeof value !== "object" || typeof value.id !== "string") return null;
  try {
    return {
      id: value.id,
      label: normalizeText(value.label, MAX_LABEL_LENGTH, "label"),
      prompt: normalizeText(value.prompt, MAX_PROMPT_LENGTH, "prompt"),
      builtIn: BUILT_IN_IDS.has(value.id),
    };
  } catch {
    return null;
  }
}

function createTemplateStore({ fileSystem = fs, filePath, createId = () => crypto.randomUUID() }) {
  function readTemplates() {
    if (!fileSystem.existsSync(filePath)) {
      writeTemplates(SEED_TEMPLATES);
      return SEED_TEMPLATES.map((template) => ({ ...template }));
    }
    try {
      const stored = JSON.parse(fileSystem.readFileSync(filePath, "utf-8"));
      if (!Array.isArray(stored)) throw new TypeError("templates file must contain an array");
      const valid = stored.map(normalizeStoredTemplate).filter(Boolean);
      const personal = valid.filter(({ id }) => !BUILT_IN_IDS.has(id));
      return [...SEED_TEMPLATES.map((template) => ({ ...template })), ...personal];
    } catch (error) {
      console.warn(`Failed to read templates file, using seed templates: ${error.message}`);
      return SEED_TEMPLATES.map((template) => ({ ...template }));
    }
  }

  function writeTemplates(templates) {
    fileSystem.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    fileSystem.writeFileSync(temporaryPath, JSON.stringify(templates, null, 2), "utf-8");
    fileSystem.renameSync(temporaryPath, filePath);
  }

  function saveTemplate(input) {
    const template = {
      id: `user-${createId()}`,
      label: normalizeText(input?.label, MAX_LABEL_LENGTH, "label"),
      prompt: normalizeText(input?.prompt, MAX_PROMPT_LENGTH, "prompt"),
      builtIn: false,
    };
    const templates = readTemplates();
    templates.push(template);
    writeTemplates(templates);
    return { ...template };
  }

  function updateTemplate(id, input) {
    if (BUILT_IN_IDS.has(id)) throw new TypeError("Built-in templates cannot be changed");
    const templates = readTemplates();
    const index = templates.findIndex((template) => template.id === id && !template.builtIn);
    if (index === -1) return null;
    templates[index] = {
      ...templates[index],
      label: normalizeText(input?.label, MAX_LABEL_LENGTH, "label"),
      prompt: normalizeText(input?.prompt, MAX_PROMPT_LENGTH, "prompt"),
    };
    writeTemplates(templates);
    return { ...templates[index] };
  }

  function deleteTemplate(id) {
    if (BUILT_IN_IDS.has(id)) throw new TypeError("Built-in templates cannot be deleted");
    const templates = readTemplates();
    const nextTemplates = templates.filter((template) => template.id !== id);
    if (nextTemplates.length === templates.length) return false;
    writeTemplates(nextTemplates);
    return true;
  }

  return { listTemplates: readTemplates, saveTemplate, updateTemplate, deleteTemplate };
}

function defaultStore() {
  return createTemplateStore({ filePath: path.join(app.getPath("userData"), TEMPLATES_FILE_NAME) });
}

module.exports = {
  listTemplates: () => defaultStore().listTemplates(),
  saveTemplate: (input) => defaultStore().saveTemplate(input),
  updateTemplate: (id, input) => defaultStore().updateTemplate(id, input),
  deleteTemplate: (id) => defaultStore().deleteTemplate(id),
  createTemplateStore,
  SEED_TEMPLATES,
};
