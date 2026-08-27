// Storage helpers (JSON read/write with BOM handling)

const fs = require("node:fs");

function readJSON(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
  } catch {
    return fallback;
  }
}

function writeJSON(file, obj, logFn) {
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  } catch (e) {
    if (logFn) logFn("write err " + file + ": " + e.message);
  }
}

module.exports = { readJSON, writeJSON };
