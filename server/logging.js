// Streaming helper: escape control characters for safe JSON/SSE strings
function escCh(s) {
  return String(s).replace(/[\\"\u0000-\u001f]/g, c => {
    switch (c) {
      case "\\": return "\\\\";
      case '"': return '\\"';
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "\t": return "\\t";
      default: return "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
    }
  });
}

module.exports = { escCh };
