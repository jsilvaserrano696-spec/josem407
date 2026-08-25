// Persistent diagnostics for AXION's edit flow. Calls are intentionally cheap no-ops during
// normal use and only reach the console/file after the user enables hidden Developer Mode.
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const configStore = require("../services/configStore");

let logFilePath = null;

function isEnabled() {
  try {
    return configStore.getSettings().developerMode === true;
  } catch {
    // Diagnostics must never make normal execution fail during early startup or unit tests.
    return false;
  }
}

function getLogFilePath() {
  if (!logFilePath) {
    logFilePath = path.join(app.getPath("userData"), "debug-edit.log");
  }
  return logFilePath;
}

function safeStringify(data) {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function log(label, data) {
  if (!isEnabled()) return false;
  const line = `[${new Date().toISOString()}] [EDIT-DEBUG] ${label}${data !== undefined ? " " + safeStringify(data) : ""}`;
  console.log(line);
  try {
    fs.appendFileSync(getLogFilePath(), line + "\n", "utf-8");
  } catch (error) {
    console.error("[EDIT-DEBUG] failed to write log file:", error.message);
  }
  return true;
}

function logError(label, error) {
  log(label, {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
  });
}

/**
 * Installs process-level crash handlers so an uncaught exception or unhandled rejection in the
 * main process is fully logged (message + stack trace) instead of silently killing the app.
 * Deliberately does NOT call app.exit()/app.quit() after logging — the whole point is to keep
 * the app alive and visible so the failure can actually be inspected.
 */
function setupCrashHandlers() {
  process.on("uncaughtException", (error) => {
    logError("UNCAUGHT EXCEPTION (main process)", error);
  });
  process.on("unhandledRejection", (reason) => {
    logError("UNHANDLED REJECTION (main process)", reason instanceof Error ? reason : new Error(String(reason)));
  });
  process.on("exit", (code) => {
    log("Main process exiting", { code });
  });
  if (isEnabled()) log("Debug crash handlers installed", { logFile: getLogFilePath() });
}

module.exports = { isEnabled, log, logError, setupCrashHandlers, getLogFilePath };
