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
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file); // rinomina atomica: evita prefs.json corrotto a metà scrittura
  } catch (e) {
    if (logFn) logFn("write err " + file + ": " + e.message);
  }
}

module.exports = { readJSON, writeJSON };
