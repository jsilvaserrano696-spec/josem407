// Persists prompt history across app restarts as a simple JSON file in userData. Each entry
// includes a `favorite` flag from day one — a real (not stubbed) Favorites feature, and the
// pattern promptTemplates.js follows for its own future template manager.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { app } = require("electron");

const HISTORY_FILE_NAME = "history.json";
const MAX_ENTRIES = 200;

function getHistoryPath() {
  return path.join(app.getPath("userData"), HISTORY_FILE_NAME);
}

function readEntries() {
  const historyPath = getHistoryPath();
  if (!fs.existsSync(historyPath)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(historyPath, "utf-8"));
  } catch (error) {
    console.warn(`Failed to read history file, starting fresh: ${error.message}`);
    return [];
  }
}

function writeEntries(entries) {
  const historyPath = getHistoryPath();
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(entries, null, 2), "utf-8");
}

function listHistory() {
  return readEntries().sort((a, b) => b.timestamp - a.timestamp);
}

function addEntry({ prompt, styleId = null }) {
  const entries = readEntries();
  const entry = {
    id: crypto.randomUUID(),
    prompt,
    styleId,
    timestamp: Date.now(),
    favorite: false,
  };
  entries.push(entry);

  // Keep the file bounded; favorites are exempt from trimming.
  const trimmed =
    entries.length > MAX_ENTRIES
      ? [...entries.filter((e) => e.favorite), ...entries.filter((e) => !e.favorite).slice(-MAX_ENTRIES)]
      : entries;

  writeEntries(trimmed);
  return entry;
}

function deleteEntry(id) {
  const entries = readEntries().filter((entry) => entry.id !== id);
  writeEntries(entries);
}

function clearHistory() {
  writeEntries([]);
}

function toggleFavorite(id) {
  const entries = readEntries();
  const entry = entries.find((e) => e.id === id);
  if (!entry) {
    return null;
  }
  entry.favorite = !entry.favorite;
  writeEntries(entries);
  return entry;
}

module.exports = { listHistory, addEntry, deleteEntry, clearHistory, toggleFavorite };
