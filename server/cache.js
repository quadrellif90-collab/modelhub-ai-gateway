// Response cache helpers

const crypto = require("node:crypto");

function cacheKey(oaiBody) {
  const { stream, messages, ...rest } = oaiBody;
  let prefix = "";
  if (Array.isArray(messages)) {
    const sys = (messages.find(m => m.role === "system") || {}).content;
    const lastUser = messages.filter(m => m.role === "user").pop();
    const lu = typeof lastUser?.content === "string" ? lastUser.content : "";
    const sample = `${typeof sys === "string" ? sys.slice(0, 200) : ""}|${lu.slice(0, 256)}`;
    prefix = crypto.createHash("sha1").update(sample).digest("hex").slice(0, 16);
  }
  return crypto.createHash("sha256").update(prefix + "|" + JSON.stringify(rest)).digest("hex");
}

module.exports = { cacheKey };
