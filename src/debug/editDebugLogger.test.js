const test = require("node:test");
const assert = require("node:assert/strict");
const configStore = require("../services/configStore");
const logger = require("./editDebugLogger");

test("diagnostics are disabled during normal use", (t) => {
  const originalGetSettings = configStore.getSettings;
  t.after(() => { configStore.getSettings = originalGetSettings; });
  configStore.getSettings = () => ({ developerMode: false });

  assert.equal(logger.isEnabled(), false);
  assert.equal(logger.log("must not be persisted", { prompt: "private" }), false);
});

test("diagnostics are enabled only by an explicit developer-mode setting", (t) => {
  const originalGetSettings = configStore.getSettings;
  t.after(() => { configStore.getSettings = originalGetSettings; });
  configStore.getSettings = () => ({ developerMode: true });

  assert.equal(logger.isEnabled(), true);
});

test("a settings read failure safely disables diagnostics", (t) => {
  const originalGetSettings = configStore.getSettings;
  t.after(() => { configStore.getSettings = originalGetSettings; });
  configStore.getSettings = () => { throw new Error("not initialized"); };

  assert.equal(logger.isEnabled(), false);
});
