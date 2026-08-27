// Routing helpers (pure functions, no global state)

function cascadeValid(data) {
  const c = data && data.choices && data.choices[0];
  if (!c || !c.message) return false;
  const msg = c.message;
  if (typeof msg.content === "string" && msg.content.trim()) return true;
  if (Array.isArray(msg.content) && msg.content.some(p => p.text)) return true;
  if (msg.tool_calls && msg.tool_calls.length) return true;
  return false;
}

function deriveEndpoint(baseURL, name) {
  if (/chat\/completions\/?$/.test(baseURL)) return baseURL.replace(/chat\/completions\/?$/, name);
  return baseURL.replace(/\/+$/, "") + "/" + name;
}

module.exports = { cascadeValid, deriveEndpoint };
