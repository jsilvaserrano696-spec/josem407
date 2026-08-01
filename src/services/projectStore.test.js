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
    selectedStyleId: null,
    conversationMode: true,
    activePrompt: "Dame una polla de plástico",
    ...overrides,
  };
}

function memoryFileSystem(initialContent = null) {
  let content = initialContent;
  return {
    existsSync: () => content !== null,
    readFileSync: () => content,
    mkdirSync: () => {},
    writeFileSync: (_path, next) => { content = next; },
    unlinkSync: () => { content = null; },
    content: () => content,
  };
}

test("normalizeProject accepts a valid project and strips unknown fields", () => {
  const result = normalizeProject({ ...validProject(), unknown: "discard me" });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.unknown, undefined);
  assert.equal(result.versionHistory[0].image.base64, "AAAA");
  assert.equal(result.activePrompt, "Dame una polla de plástico");
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
