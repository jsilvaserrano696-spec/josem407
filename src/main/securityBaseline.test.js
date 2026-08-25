const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), "utf-8");

test("renderer security baseline remains explicit and restrictive", () => {
  const mainSource = read("src/main/main.js");
  const preloadSource = read("src/preload/preload.js");
  const html = read("ui/index.html");

  assert.match(mainSource, /contextIsolation:\s*true/);
  assert.match(mainSource, /nodeIntegration:\s*false/);
  assert.match(mainSource, /will-navigate[\s\S]*preventDefault\(\)/);
  assert.match(mainSource, /setWindowOpenHandler\(\(\)\s*=>\s*\(\{\s*action:\s*["']deny["']/);
  assert.match(mainSource, /setPermissionCheckHandler/);
  assert.match(mainSource, /setPermissionRequestHandler/);

  assert.match(preloadSource, /contextBridge\.exposeInMainWorld\(["']axion["']/);
  assert.doesNotMatch(preloadSource, /exposeInMainWorld\([^,]+,\s*ipcRenderer\b/);

  const csp = html.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/)?.[1] ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:/);
});
