// Semantic response cache (pure, dependency-free).
// Stores embedding vectors of prompts; on lookup returns the cached response
// whose prompt embedding is cosine-similar above a threshold. Degrades to a
// no-op (always miss) if no embedder is configured upstream-side.

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function createSemCache({ max = 200, ttlMs = 600000 } = {}) {
  // entries: { v: Float32Array, data, ts }
  const entries = [];

  function add(v, data) {
    entries.push({ v, data, ts: Date.now() });
    if (entries.length > max) entries.shift();
  }

  // Returns the cached data for the best match above `threshold`, or null.
  function match(query, threshold) {
    const now = Date.now();
    let best = null, bestSim = -1;
    for (const e of entries) {
      if (now - e.ts > ttlMs) continue;
      const s = cosine(query, e.v);
      if (s > bestSim) { bestSim = s; best = e; }
    }
    if (best && bestSim >= threshold) return best.data;
    return null;
  }

  function size() { return entries.length; }
  function clear() { entries.length = 0; }

  return { add, match, size, clear };
}

module.exports = { createSemCache, cosine };
