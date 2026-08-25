import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const uiRoot = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(uiRoot, "index.html"), "utf-8");
const english = JSON.parse(fs.readFileSync(path.join(uiRoot, "locales", "en.json"), "utf-8"));
const spanish = JSON.parse(fs.readFileSync(path.join(uiRoot, "locales", "es.json"), "utf-8"));

test("English and Spanish locale files expose the same keys", () => {
  assert.deepEqual(Object.keys(english).sort(), Object.keys(spanish).sort());
});

test("every static data-i18n reference exists in both locales", () => {
  const attributes = /\bdata-i18n(?:-title|-placeholder|-aria-label|-alt|-tooltip)?="([^"]+)"/g;
  const keys = [...html.matchAll(attributes)].map((match) => match[1]);
  const missing = keys.filter((key) => !(key in english) || !(key in spanish));
  assert.deepEqual([...new Set(missing)], []);
});

test("HTML ids are unique and label/dialog references resolve", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);

  const references = [...html.matchAll(/\b(?:for|aria-labelledby)="([^"]+)"/g)]
    .flatMap((match) => match[1].split(/\s+/));
  assert.deepEqual([...new Set(references.filter((id) => !ids.includes(id)))], []);
});

test("icon-only buttons have an accessible name", () => {
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  const unnamed = buttons.filter(([, attributes, body]) => {
    const visibleText = body.replace(/<[^>]+>/g, "").trim();
    return !visibleText && !/\b(?:aria-label|data-i18n-aria-label)="[^"]+"/.test(attributes);
  });
  assert.deepEqual(unnamed.map(([, attributes]) => attributes), []);
});
