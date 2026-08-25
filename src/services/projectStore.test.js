const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeProject, createProjectStore, MAX_VERSIONS } = require("./projectStore");

function validProject(overrides = {}) {
  return {
    schemaVersion: 1,
    versionHistory: [
      {
        id: "v0",
        versionNumber: 0,
        prompt: null,
        styleId: null,
        timestamp: 123,
        image: { base64: "AAAA", mimeType: "image/png" },
      },
    ],
    versionCursor: 0,
    projectName: "Roble Natural",
    projectReference: "ROB-1842",
    selectedStyleId: null,
    conversationMode: true,
    activePrompt: "Dame una polla de plástico",
    ...overrides,
  };
}

function memoryFileSystem(initialContent = null, { failRename = false } = {}) {
  let content = initialContent;
  let temporaryContent = null;
  const operations = [];
  return {
    existsSync: (filePath) => filePath.endsWith(".tmp") ? temporaryContent !== null : content !== null,
    readFileSync: (filePath) => filePath.endsWith(".tmp") ? temporaryContent : content,
    mkdirSync: () => {},
    writeFileSync: (filePath, next) => {
      operations.push(`write:${filePath}`);
      if (filePath.endsWith(".tmp")) temporaryContent = next;
      else content = next;
    },
    renameSync: (from, to) => {
      operations.push(`rename:${from}->${to}`);
      if (failRename) throw new Error("simulated rename failure");
      content = temporaryContent;
      temporaryContent = null;
    },
    unlinkSync: (filePath) => {
      operations.push(`unlink:${filePath}`);
      if (filePath.endsWith(".tmp")) temporaryContent = null;
      else content = null;
    },
    content: () => content,
    temporaryContent: () => temporaryContent,
    operations: () => [...operations],
  };
}

test("normalizeProject accepts a valid project and strips unknown fields", () => {
  const result = normalizeProject({ ...validProject(), unknown: "discard me" });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.unknown, undefined);
  assert.equal(result.versionHistory[0].image.base64, "AAAA");
  assert.equal(result.activePrompt, "Dame una polla de plástico");
  assert.equal(result.projectName, "Roble Natural");
  assert.equal(result.projectReference, "ROB-1842");
});

test("normalizeProject rejects unsupported schemas and empty histories", () => {
  assert.equal(normalizeProject(validProject({ schemaVersion: 99 })), null);
  assert.equal(normalizeProject(validProject({ versionHistory: [] })), null);
});

test("normalizeProject rejects an invalid undo/redo cursor", () => {
  assert.equal(normalizeProject(validProject({ versionCursor: -1 })), null);
  assert.equal(normalizeProject(validProject({ versionCursor: 1 })), null);
});

test("normalizeProject rejects missing, empty, and non-image data", () => {
  assert.equal(normalizeProject(validProject({ versionHistory: [{}] })), null);
  assert.equal(
    normalizeProject(validProject({ versionHistory: [{ ...validProject().versionHistory[0], image: { base64: "", mimeType: "image/png" } }] })),
    null
  );
  assert.equal(
    normalizeProject(validProject({ versionHistory: [{ ...validProject().versionHistory[0], image: { base64: "AAAA", mimeType: "text/plain" } }] })),
    null
  );
});

test("normalizeProject bounds the number of persisted versions", () => {
  const version = validProject().versionHistory[0];
  assert.equal(normalizeProject(validProject({ versionHistory: Array(MAX_VERSIONS + 1).fill(version) })), null);
});

test("normalizeProject repairs derived version numbers and optional metadata", () => {
  const input = validProject({
    versionHistory: [{ ...validProject().versionHistory[0], id: "", versionNumber: 42, timestamp: NaN }],
    selectedStyleId: 42,
    conversationMode: "bad",
  });
  const result = normalizeProject(input);
  assert.equal(result.versionHistory[0].id, "restored-0");
  assert.equal(result.versionHistory[0].versionNumber, 0);
  assert.equal(result.versionHistory[0].timestamp, 0);
  assert.equal(result.selectedStyleId, null);
  assert.equal(result.conversationMode, true);
});

test("store round-trip saves and restores the complete normalized project", () => {
  const fileSystem = memoryFileSystem();
  const store = createProjectStore({ fileSystem, filePath: "C:/memory/current-project.json" });
  assert.equal(store.saveProject(validProject()), true);
  assert.deepEqual(store.loadProject(), normalizeProject(validProject()));
});

test("save is atomic: it writes a sibling temporary file before replacing the live project", () => {
  const fileSystem = memoryFileSystem();
  const store = createProjectStore({ fileSystem, filePath: "C:/memory/current-project.json" });
  store.saveProject(validProject());
  assert.deepEqual(fileSystem.operations(), [
    "write:C:/memory/current-project.json.tmp",
    "rename:C:/memory/current-project.json.tmp->C:/memory/current-project.json",
  ]);
  assert.equal(fileSystem.temporaryContent(), null);
});

test("a failed atomic replacement preserves the previous project and cleans the temporary file", () => {
  const original = JSON.stringify(validProject({ projectReference: "OLD" }));
  const fileSystem = memoryFileSystem(original, { failRename: true });
  const store = createProjectStore({ fileSystem, filePath: "C:/memory/current-project.json" });
  assert.throws(() => store.saveProject(validProject({ projectReference: "NEW" })), /simulated rename failure/);
  assert.equal(fileSystem.content(), original);
  assert.equal(fileSystem.temporaryContent(), null);
});

test("project persistence keeps an optional reference image", () => {
  const referenceImage = { base64: "REFERENCE", mimeType: "image/jpeg" };
  assert.deepEqual(normalizeProject(validProject({ referenceImage })).referenceImage, referenceImage);
});

test("project persistence keeps a bounded explanation for each generated version", () => {
  const normalized = normalizeProject(validProject({
    versionHistory: [{ ...validProject().versionHistory[0], explanation: `  ${"cambio ".repeat(120)}  ` }],
  }));

  assert.equal(normalized.versionHistory[0].explanation.length, 600);
  assert.match(normalized.versionHistory[0].explanation, /^cambio/);
});

test("project persistence keeps safe model audit metadata", () => {
  const normalized = normalizeProject(validProject({
    versionHistory: [{
      ...validProject().versionHistory[0],
      modelId: "gemini-3-pro-image",
      modelTier: "pro",
    }],
  }));
  assert.equal(normalized.versionHistory[0].modelId, "gemini-3-pro-image");
  assert.equal(normalized.versionHistory[0].modelTier, "pro");

  const invalid = normalizeProject(validProject({
    versionHistory: [{ ...validProject().versionHistory[0], modelTier: "toString" }],
  }));
  assert.equal(invalid.versionHistory[0].modelTier, undefined);
});

test("project identity is optional, bounded, and safe for legacy projects", () => {
  const legacy = validProject();
  delete legacy.projectName;
  delete legacy.projectReference;
  assert.deepEqual(
    { name: normalizeProject(legacy).projectName, reference: normalizeProject(legacy).projectReference },
    { name: "", reference: "" }
  );
  const normalized = normalizeProject(validProject({ projectName: "N".repeat(200), projectReference: "R".repeat(120) }));
  assert.equal(normalized.projectName.length, 120);
  assert.equal(normalized.projectReference.length, 80);
});

test("legacy and malformed reference images safely normalize to null", () => {
  assert.equal(normalizeProject(validProject()).referenceImage, null);
  assert.equal(normalizeProject(validProject({ referenceImage: { base64: "", mimeType: "image/png" } })).referenceImage, null);
});

test("normalizeProject keeps a deliberately cleared active prompt", () => {
  const result = normalizeProject(
    validProject({
      activePrompt: "",
      versionHistory: [{ ...validProject().versionHistory[0], prompt: "historical instruction" }],
    })
  );
  assert.equal(result.activePrompt, "");
  assert.equal(result.versionHistory[0].prompt, "historical instruction");
});

test("legacy projects derive the active prompt from the visible version", () => {
  const project = validProject({
    versionHistory: [{ ...validProject().versionHistory[0], prompt: "legacy instruction" }],
  });
  delete project.activePrompt;
  assert.equal(normalizeProject(project).activePrompt, "legacy instruction");
});

test("store returns null for missing, corrupt, or structurally invalid files", () => {
  assert.equal(createProjectStore({ fileSystem: memoryFileSystem(), filePath: "x" }).loadProject(), null);
  assert.equal(createProjectStore({ fileSystem: memoryFileSystem("not-json"), filePath: "x" }).loadProject(), null);
  assert.equal(createProjectStore({ fileSystem: memoryFileSystem("{}"), filePath: "x" }).loadProject(), null);
});

test("clearProject removes a saved project and is idempotent", () => {
  const fileSystem = memoryFileSystem();
  const store = createProjectStore({ fileSystem, filePath: "C:/memory/current-project.json" });
  store.saveProject(validProject());
  assert.equal(store.clearProject(), true);
  assert.equal(store.loadProject(), null);
  assert.equal(store.clearProject(), true);
});
