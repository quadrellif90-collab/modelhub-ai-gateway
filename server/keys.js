// Gateway key helpers (pure, no module-level state — server.js owns the maps)
const crypto = require("node:crypto");

// Generate a new gateway bearer secret. Prefixed so it's easy to spot in logs.
function genKey() {
  return "mh_" + crypto.randomBytes(20).toString("hex");
}

// Mint a new key with metadata. Returns the secret (shown once) + meta record.
function mintKey(label) {
  return {
    key: genKey(),
    meta: { label: typeof label === "string" ? label : "", createdAt: Date.now(), lastUsedAt: 0 }
  };
}

// Sliding 60s-window rate check. `bucket` is an array of epoch-ms timestamps
// (mutated in place: stale entries are dropped). Returns true if the request
// should be rejected. Caller is responsible for pushing a timestamp on success.
function rateLimited(bucket, now, rpm) {
  if (!rpm || rpm <= 0) return false;
  while (bucket.length && now - bucket[0] > 60000) bucket.shift();
  return bucket.length >= rpm;
}

module.exports = { genKey, mintKey, rateLimited };
