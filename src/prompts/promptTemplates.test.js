const test = require("node:test");
const assert = require("node:assert/strict");
const { createTemplateStore, SEED_TEMPLATES } = require("./promptTemplates");

function memoryFileSystem(initial = null) {
  let content = initial;
  let temporary = null;
  return {
    existsSync: (filePath) => filePath.endsWith(".tmp") ? temporary !== null : content !== null,
    readFileSync: (filePath) => filePath.endsWith(".tmp") ? temporary : content,
    mkdirSync: () => {},
    writeFileSync: (filePath, value) => {
      if (filePath.endsWith(".tmp")) temporary = value;
      else content = value;
    },
    renameSync: () => { content = temporary; temporary = null; },
  };
}

function makeStore(initial = null) {
  return createTemplateStore({
    fileSystem: memoryFileSystem(initial),
    filePath: "C:\\profile\\templates.json",
    createId: () => "fixed-id",
  });
}

test("template store seeds a new profile with immutable built-in templates", () => {
  const templates = makeStore().listTemplates();
  assert.equal(templates.length, SEED_TEMPLATES.length);
  assert.ok(templates.every(({ builtIn }) => builtIn));
});

test("template store creates, updates and deletes a personal template", () => {
  const store = makeStore();
  const created = store.saveTemplate({ label: "  Mi estilo  ", prompt: "  Hazlo cálido  " });
  assert.deepEqual(created, {
    id: "user-fixed-id", label: "Mi estilo", prompt: "Hazlo cálido", builtIn: false,
  });
  assert.equal(store.updateTemplate(created.id, { label: "Nuevo", prompt: "Texto nuevo" }).label, "Nuevo");
  assert.equal(store.listTemplates().at(-1).prompt, "Texto nuevo");
  assert.equal(store.deleteTemplate(created.id), true);
  assert.equal(store.listTemplates().length, SEED_TEMPLATES.length);
});

test("template store rejects invalid input and protects built-in templates", () => {
  const store = makeStore();
  assert.throws(() => store.saveTemplate({ label: "", prompt: "text" }), /label cannot be empty/);
  assert.throws(() => store.saveTemplate({ label: "name", prompt: " " }), /prompt cannot be empty/);
  assert.throws(() => store.updateTemplate("portrait-enhance", { label: "x", prompt: "y" }), /cannot be changed/);
  assert.throws(() => store.deleteTemplate("portrait-enhance"), /cannot be deleted/);
});

test("template store ignores malformed entries and restores current built-ins", () => {
  const oldSeed = [{ id: "portrait-enhance", label: "Old", prompt: "Old" }, { junk: true }];
  const templates = makeStore(JSON.stringify(oldSeed)).listTemplates();
  assert.deepEqual(templates, SEED_TEMPLATES);
});
