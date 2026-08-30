const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { PassThrough } = require("node:stream");

const pricingLib = require("./server/pricing.js");
const cryptoLib = require("./server/crypto.js");
const protocolsLib = require("./server/protocols.js");
const modelsLib = require("./server/models.js");
const loggingLib = require("./server/logging.js");
const storageLib = require("./server/storage.js");
const routingLib = require("./server/routing.js");
const cacheLib = require("./server/cache.js");
const metricsLib = require("./server/metrics.js");
const keysLib = require("./server/keys.js");
const semCacheLib = require("./server/semcache.js");

const PORT = parseInt(process.env.MODELHUB_PORT || "8787", 10);
const DIR = process.env.MODELHUB_DIR || __dirname;
const CONFIG_FILE = path.join(DIR, "config.json");
const AUTH_FILE = path.join(DIR, "auth.json");
const PREFS_FILE = path.join(DIR, "prefs.json");
const LOG_FILE = path.join(os.tmpdir(), "modelhub.log");
const DEFAULT_PROFILES = ["auto", "auto-code", "auto-reasoning", "auto-fast", "free-pool"];
const AUTO_PROBE = process.env.MODELHUB_AUTO_PROBE !== "0";
const ENV_PLAIN = process.env.MODELHUB_AUTH_PLAIN === "1" || process.env.MODELHUB_AUTH_PLAIN === "true";
const AUTH_KEY_ENV = process.env.MODELHUB_AUTH_KEY;
const REQUEST_LOG_FILE = path.join(DIR, "requests.log.jsonl");
const PRICING_FILE = path.join(DIR, "pricing.json");
const CACHE_ENABLED = process.env.MODELHUB_CACHE !== "0";
const CACHE_TTL_MS = parseInt(process.env.MODELHUB_CACHE_TTL || "600000", 10);
const CACHE_MAX = parseInt(process.env.MODELHUB_CACHE_MAX || "200", 10);
const UPSTREAM_TIMEOUT_MS = parseInt(process.env.MODELHUB_UPSTREAM_TIMEOUT || "15000", 10);
const UPSTREAM_TIMEOUT_NONSTREAM_MS = parseInt(process.env.MODELHUB_UPSTREAM_TIMEOUT_NONSTREAM || "30000", 10);
const STRATEGIES = ["order", "autoroute", "cheapest", "fastest", "least-used", "random", "cascade"];
const SIGNUP_URLS = {
  upstage: "https://console.upstage.ai/keys",
  nvidia: "https://build.nvidia.com/settings/api-keys",
  minimax: "https://platform.minimax.io/user-center/basic-information/interface-key",
  alibaba: "https://modelstudio.console.alibabacloud.com/?apiKey=1",
  kilocode: "https://app.kilocode.ai/settings/keys",
  fireworks: "https://fireworks.ai/account/api-keys",
  cerebras: "https://cloud.cerebras.ai",
  mistral: "https://console.mistral.ai/api-keys",
  openai: "https://platform.openai.com/api-keys",
  deepseek: "https://platform.deepseek.com/api_keys",
  groq: "https://console.groq.com/keys",
  google: "https://aistudio.google.com/app/apikey",
  openrouter: "https://openrouter.ai/settings/keys",
  chutes: "https://chutes.ai/app",
  cohere: "https://dashboard.cohere.com/api-keys",
  huggingface: "https://huggingface.co/settings/tokens",
  github: "https://github.com/settings/personal-access-tokens/new",
  together: "https://api.together.xyz/settings/api-keys",
  nebius: "https://studio.nebius.ai/settings/api-keys",
  siliconflow: "https://cloud.siliconflow.cn/account/ak",
  ai21: "https://studio.ai21.com/account/security-api-keys",
  cloudflare: "https://dash.cloudflare.com/profile/api-tokens",
  ovhcloud: "https://www.ovh.com/auth/api-create-token/",
  modelscope: "https://modelscope.cn/my/myaccesstoken",
  sambanova: "https://cloud.sambanova.ai/apis",
  novita: "https://novita.ai/dashboard/key",
  perplexity: "https://www.perplexity.ai/settings/api",
  xai: "https://console.x.ai",
  zai: "https://z.ai/manage-apikey/apikey-list"
};
const VERSION = "0.7.5";
let cacheOn = process.env.MODELHUB_CACHE !== "0";
let autoProbeOn = AUTO_PROBE;
const UA_HTTP = new http.Agent({ keepAlive: true, maxSockets: 64 });
const UA_HTTPS = new https.Agent({ keepAlive: true, maxSockets: 64 });
function upstreamAgent(u) { return u.protocol === "https:" ? UA_HTTPS : UA_HTTP; }
const PROV_CONCURRENCY = Math.max(1, parseInt(process.env.MODELHUB_PROVIDER_CONCURRENCY || "4", 10));
const provSlots = new Map();
async function acquireSlot(provider) {
  let s = provSlots.get(provider);
  if (!s) { s = { active: 0, queue: [] }; provSlots.set(provider, s); }
  if (s.active < PROV_CONCURRENCY) { s.active++; return; }
  await new Promise(r => s.queue.push(r));
}
function releaseSlot(provider) {
  const s = provSlots.get(provider);
  if (!s) return;
  const next = s.queue.shift();
  if (next) next();
  else s.active = Math.max(0, s.active - 1);
}

const STREAM_CAP_PER_PROVIDER = Math.max(4, PROV_CONCURRENCY * 2);
const streamSlots = new Map();
function streamSlotFree(provider) { return (streamSlots.get(provider) || 0) < STREAM_CAP_PER_PROVIDER; }
function streamSlotTake(provider) { streamSlots.set(provider, (streamSlots.get(provider) || 0) + 1); }
function streamSlotGive(provider) {
  const n = (streamSlots.get(provider) || 1) - 1;
  if (n <= 0) streamSlots.delete(provider); else streamSlots.set(provider, n);
}

// ---------------------------------------------------------------------------
// crittografia chiavi (AES-256-GCM, key derivata dalla macchina)
// ---------------------------------------------------------------------------
const { deriveAuthKey, encryptAuth, decryptAuth, looksLikeAuth } = cryptoLib;

// ---------------------------------------------------------------------------
// logging
// ---------------------------------------------------------------------------
function log(m) {
  const line = `[${new Date().toISOString()}] ${m}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

// ---------------------------------------------------------------------------
// storage
// ---------------------------------------------------------------------------
const { readJSON, writeJSON } = storageLib;
let authWasPlain = false;
function readAuth() {
  try {
    const raw = fs.readFileSync(AUTH_FILE, "utf8");
    let obj = null;
    try { obj = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw); } catch { obj = null; }
    if (obj && typeof obj === "object" && obj.v === 1 && obj.iv && obj.cipher) {
      try { return decryptAuth(obj); } catch { return {}; }
    }
    if (looksLikeAuth(obj)) { authWasPlain = true; return obj; }
    return {};
  } catch { return {}; }
}
function writeAuth(obj) {
  if (ENV_PLAIN) { writeJSON(AUTH_FILE, obj, log); return; }
  writeJSON(AUTH_FILE, encryptAuth(obj), log);
}

// ---------------------------------------------------------------------------
// config/auth/prefs caricati
// ---------------------------------------------------------------------------
let config = readJSON(CONFIG_FILE, null);
if (!config || !Array.isArray(config.providers)) {
  config = { port: PORT, providers: [] };
  log("WARN: config.json missing/invalid, starting with empty providers");
}
if (!config.port) config.port = PORT;

let auth = readAuth();
let prefs = readJSON(PREFS_FILE, {});
if (!prefs.enabled) prefs.enabled = {};
if (!prefs.profiles) prefs.profiles = {};
if (!prefs.strategy || typeof prefs.strategy !== "object") prefs.strategy = {};
if (!Array.isArray(prefs.gatewayKeys)) prefs.gatewayKeys = [];

// ---------------------------------------------------------------------------
// gateway keys: secrets live ONLY in prefs.gatewayKeys (memory + prefs.json),
// never persisted in plaintext. gateway-keys.json stores kid (sha256) + meta.
// ---------------------------------------------------------------------------
const { genKey, mintKey, kidOf, rateLimited } = keysLib;
let gatewayKeysMeta = {};                 // kid -> { label, createdAt, lastUsedAt }
let gatewayKids = new Map();              // kid -> secret (mirror of prefs.gatewayKeys)
try {
  const raw = readJSON(path.join(DIR, "gateway-keys.json"), null);
  if (raw && typeof raw === "object") {
    gatewayKeysMeta = raw.meta || {};
    // Support both new format (kids = hashes, secret NOT persisted) and legacy
    // format (keys = plaintext secrets). Legacy secrets are migrated to kids.
    const legacy = Array.isArray(raw.keys) ? raw.keys.filter(k => typeof k === "string") : [];
    const kids = Array.isArray(raw.kids) ? raw.kids.filter(k => typeof k === "string") : [];
    for (const sec of legacy) {
      const k = kidOf(sec);
      gatewayKids.set(k, sec); // legacy: we still have the secret, keep it working
    }
    for (const k of kids) {
      if (!gatewayKids.has(k)) gatewayKids.set(k, null); // secret not persisted, only kid+meta
    }
  }
} catch { /* no prior keys file */ }
// rebuild kid map from in-memory secrets (prefs.gatewayKeys)
for (const secret of (prefs.gatewayKeys || [])) gatewayKids.set(kidOf(secret), secret);
function writeGatewayKeys() {
  try {
    writeJSON(path.join(DIR, "gateway-keys.json"), { kids: [...gatewayKids.keys()], meta: gatewayKeysMeta }, log);
  } catch { /* best effort */ }
}
const keyRpm = new Map();                 // kid -> number[] (60s sliding timestamps)
// resolve a raw bearer to its kid if it is a known gateway key
function resolveGatewayKid(secret) {
  if (!secret) return null;
  const kid = kidOf(secret);
  return gatewayKids.has(kid) ? kid : null;
}

// Semantic cache (optional layer above exact-match). Enabled via prefs.features.semCache
// and prefs.semCache.embedder (a model id from the registry). When no embedder is set
// it stays a no-op so behavior is identical to before.
const SEM_THRESHOLD = Number.isFinite(parseInt(process.env.MODELHUB_SEM_THRESHOLD, 10))
  ? Math.min(1, Math.max(0, parseInt(process.env.MODELHUB_SEM_THRESHOLD, 10) / 100))
  : 0.95;
let semCache = semCacheLib.createSemCache({
  max: parseInt(process.env.MODELHUB_SEM_MAX || "200", 10),
  ttlMs: parseInt(process.env.MODELHUB_SEM_TTL || "600000", 10)
});
let semOn = false;
function semCfg() {
  const f = prefs.features || {};
  const sc = prefs.semCache || {};
  return {
    enabled: typeof f.semCache === "boolean" ? f.semCache : false,
    embedder: typeof sc.embedder === "string" && sc.embedder ? sc.embedder : null,
    threshold: Number.isFinite(sc.threshold) ? sc.threshold : SEM_THRESHOLD
  };
}

// ---------------------------------------------------------------------------
// pricing (USD per milione di token)
// ---------------------------------------------------------------------------
const DEFAULT_PRICING = {
  openai: { input: 2.5, output: 10 },
  anthropic: { input: 3, output: 15 },
  google: { input: 1.25, output: 5 },
  groq: { input: 0.59, output: 0.79 },
  deepseek: { input: 0.27, output: 1.1 },
  mistral: { input: 2, output: 6 },
  xai: { input: 3, output: 15 },
  cerebras: { input: 0.6, output: 0.6 },
  together: { input: 0.6, output: 0.6 },
  nvidia: { input: 0, output: 0 },
  ollama: { input: 0, output: 0 }
};
let pricing = readJSON(PRICING_FILE, null);
if (!pricing || typeof pricing !== "object" || !pricing.providers) {
  pricing = { currency: "USD", providers: { ...DEFAULT_PRICING }, models: {} };
  writeJSON(PRICING_FILE, pricing);
}

function priceFor(provider, modelName) {
  return pricingLib.priceFor(pricing, provider, modelName);
}
function effectivePrice(m) {
  if (m.free) return 0;
  const p = priceFor(m.provider, m.name);
  return (p.input + p.output) / 2;
}
function computeCost(m, promptTok, completionTok) {
  const p = priceFor(m.provider, m.name);
  return pricingLib.computeCost(p, promptTok, completionTok);
}

// ---------------------------------------------------------------------------
// cache risposte (exact-match, solo non-streaming)
// ---------------------------------------------------------------------------
let cacheHits = 0;
const responseCache = new Map();
const { cacheKey } = cacheLib;
function cacheGet(key) {
  if (!cacheOn) return null;
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > settingsCfg().cacheTtlMs) { responseCache.delete(key); return null; }
  return hit.data;
}
function cachePut(key, data) {
  if (!cacheOn) return;
  if (responseCache.size >= CACHE_MAX) {
    const oldest = responseCache.keys().next().value;
    responseCache.delete(oldest);
  }
  responseCache.set(key, { ts: Date.now(), data });
}

// ---------------------------------------------------------------------------
// request log (ring buffer + JSONL)
// ---------------------------------------------------------------------------
const REQ_LOG_MAX = 400;
const reqLog = [];
function recordRequest(entry) {
  entry.ts = Date.now();
  reqLog.push(entry);
  if (reqLog.length > REQ_LOG_MAX) reqLog.shift();
  try {
    const path = rotatedRequestLogPath();
    fs.appendFileSync(path, JSON.stringify(entry) + "\n");
  } catch (e) { log("recordRequest append: " + ((e && e.message) || e)); }
}

// ---------------------------------------------------------------------------
// model registry
// ---------------------------------------------------------------------------
let models = [];
let modelMap = new Map();

function resolveKey(authId) {
  if (authId == null) return "";
  if (authId.startsWith("env:")) return process.env[authId.slice(4)] || "";
  const entry = auth[authId];
  if (!entry) return "";
  return typeof entry === "string" ? entry : (entry.key || "");
}

function today() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function rebuildModels() {
  const list = [];
  for (const p of config.providers) {
    const key = resolveKey(p.authId);
    const keyOk = !p.needsKey || !!key;
    for (const m of (p.models || [])) {
      const id = `${p.name}/${m.name}`;
      const knownFree = m.free === true || p.needsKey === false;
      const prev = modelMap.get(id);
      list.push({
        id, provider: p.name, label: p.label || p.name, name: m.name,
        baseURL: p.baseURL, authId: p.authId, needsKey: !!p.needsKey,
        free: prev ? prev.free : knownFree,
        key, keyOk, enabled: prev ? prev.enabled : (prefs.enabled[id] !== false),
        healthy: true, fails: prev ? prev.fails : 0, failUntil: prev ? prev.failUntil : 0,
        halfOpen: false, lastError: prev ? prev.lastError : "",
        lastLatencyMs: prev ? prev.lastLatencyMs : 0,
        requests: prev ? prev.requests : 0, tokens: prev ? prev.tokens : 0,
        day: prev ? prev.day : today(), dailyReq: prev ? prev.dailyReq : 0, dailyTok: prev ? prev.dailyTok : 0,
        cost: prev ? prev.cost || 0 : 0, dailyCost: prev ? prev.dailyCost || 0 : 0,
        lifetimeFails: prev ? prev.lifetimeFails || 0 : 0,
        lastTTFTMs: prev ? prev.lastTTFTMs || 0 : 0, avgTTFTMs: prev ? prev.avgTTFTMs || 0 : 0
      });
    }
  }
  models = list;
  modelMap = new Map(list.map(m => [m.id, m]));
  rebuildProfiles();
  log(`rebuilt: ${models.length} models across ${config.providers.length} providers`);
}

// Rimuove i modelli a pagamento lasciando solo i free.
// Deve essere chiamata DOPO i test di verifica (verifyHeads) così i modelli
// paid vengono comunque probe-ati (per scoprire nuovi free tra gli aggiornamenti)
// e poi scartati, in modo che il routing usi solo modelli free.
function prunePaidModels() {
  const before = models.length;
  models = models.filter(m => m.free);
  modelMap = new Map(models.map(m => [m.id, m]));
  rebuildProfiles();
  if (before !== models.length) log(`pruned ${before - models.length} paid models, ${models.length} free remaining`);
}

const { classify, classifyPrompt, catFirst, CHAT_BLOCK } = modelsLib;

function isChatModel(id) {
  if (!id) return false;
  if (CHAT_BLOCK.test(id)) return false;
  const m = modelMap.get(id);
  if (!m) return true;
  return !CHAT_BLOCK.test(m.label || "") && !CHAT_BLOCK.test(m.name || "");
}

function mergedOrder(manualArr, generated, enabledSet) {
  const kept = (manualArr || []).filter(id => enabledSet.has(id) && modelMap.has(id));
  const seen = new Set(kept);
  const appended = generated.filter(id => !seen.has(id));
  return kept.concat(appended);
}
function rebuildProfiles() {
  const enabledIds = models.filter(m => m.enabled && isChatModel(m.id)).map(m => m.id);
  const enabledSet = new Set(enabledIds);
  const scored = enabledIds.slice().sort((a, b) => autorouteScore(b) - autorouteScore(a));
  const defaultMerge = (prof, generated) => {
    const arr = prefs.profiles[prof];
    const base = (Array.isArray(arr) && arr.length) ? arr : generated;
    prefs.profiles[prof] = mergedOrder(base, generated, enabledSet);
  };
  defaultMerge("auto", scored);
  defaultMerge("auto-code", catFirst(scored, c => c.code));
  defaultMerge("auto-reasoning", catFirst(scored, c => c.reasoning));
  defaultMerge("auto-fast", catFirst(scored, c => c.fast));
  defaultMerge("free-pool", buildFreePool());
  for (const prof of Object.keys(prefs.profiles)) {
    if (["auto", "auto-code", "auto-reasoning", "auto-fast", "free-pool"].includes(prof)) continue;
    const arr = prefs.profiles[prof];
    if (!Array.isArray(arr)) { prefs.profiles[prof] = enabledIds.slice(); continue; }
    const set = new Set(arr);
    prefs.profiles[prof] = [
      ...arr.filter(id => modelMap.has(id) && modelMap.get(id).enabled),
      ...enabledIds.filter(id => !set.has(id))
    ];
  }
  writeJSON(PREFS_FILE, prefs, log);
}

// ---------------------------------------------------------------------------
// v0.7: per-key quota, intent routing, experiments, plugins, webhook, audit
// ---------------------------------------------------------------------------
const keyUsage = new Map();
function keyIdFor(req) {
  const a = typeof req.headers["authorization"] === "string" ? req.headers["authorization"].replace(/^Bearer\s+/i, "") : "";
  const b = req.headers["x-api-key"] || "";
  return a || b || null;
}
function keyLimit(key) {
  if (!key) return null;
  const lim = (prefs.keylimits && prefs.keylimits[key]) || {};
  return { tokens: lim.tokens || 0, spend: lim.spend || 0, rpm: lim.rpm || 0 };
}
function keyUsed(key) { return keyUsage.get(key) || { tokens: 0, spent: 0 }; }
function recordKeyUsage(key, tokens, cost) {
  if (!key) return;
  const u = keyUsed(key);
  u.tokens += tokens || 0;
  u.spent += cost || 0;
  keyUsage.set(key, u);
}
function keyOverLimit(key) {
  const lim = keyLimit(key);
  if (!lim) return false;
  const u = keyUsed(key);
  if (lim.tokens && u.tokens >= lim.tokens) return true;
  if (lim.spend && u.spent >= lim.spend) return true;
  return false;
}
function resolveProfile(requested, messages) {
  if (requested && requested !== "auto" && !String(requested).startsWith("auto-intent")) return requested;
  const last = (messages || []).filter(m => m.role === "user").pop();
  const txt = last ? (typeof last.content === "string" ? last.content : JSON.stringify(last.content)) : "";
  const it = classifyPrompt(txt);
  if (it.code) return "auto-code";
  if (it.reasoning) return "auto-reasoning";
  if (it.fast) return "auto-fast";
  return "auto";
}
const ENHANCE_PLUGINS = {
  concise: { label: "Conciso", transform: (sys, user) => ({ system: (sys ? sys + "\n" : "") + "Rispondi in modo conciso e diretto.", user }) },
  english: { label: "Inglese", transform: (sys, user) => ({ system: (sys ? sys + "\n" : "") + "Respond in English.", user }) },
  codepro: { label: "Code pro", transform: (sys, user) => ({ system: (sys ? sys + "\n" : "") + "You are an expert software engineer. Prefer correct, minimal code.", user }) }
};
function applyPlugins(system, user) {
  const ids = (prefs.enhancer && Array.isArray(prefs.enhancer.plugins)) ? prefs.enhancer.plugins : [];
  for (const id of ids) {
    const p = ENHANCE_PLUGINS[id];
    if (p) { const r = p.transform(system, user); system = r.system; user = r.user; }
  }
  return { system, user };
}
function experimentFor(profile) {
  const e = prefs.experiments;
  if (!e || !e.enabled || e.profile !== profile || !e.candidate) return null;
  return e;
}
function maybeExperiment(profile, order) {
  const e = experimentFor(profile);
  if (!e) return order;
  if (order[0] === e.candidate) return order;
  const pct = Math.max(0, Math.min(100, e.splitPct || 0));
  if (Math.floor(Math.random() * 100) < pct) return [e.candidate, ...order.filter(id => id !== e.candidate)];
  return order;
}
function alertWebhook(url, event, payload) {
  if (!url) return;
  try {
    const u = new URL(url);
    const body = JSON.stringify({ event, ts: Date.now(), ...payload });
    const transport = u.protocol === "https:" ? https : http;
    const req = transport.request({
      agent: upstreamAgent(u), method: "POST", hostname: u.hostname, port: u.port || undefined,
      path: u.pathname + (u.search || ""), headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, () => {});
    req.on("error", () => {});
    req.write(body); req.end();
  } catch (e) { log("alertWebhook req error: " + ((e && e.message) || e)); }
}
const alertState = {};
function alertOnce(key, event, payload) {
  const now = Date.now();
  if (alertState[key] && now - alertState[key] < 600000) return;
  alertState[key] = now;
  const url = prefs.alerts && prefs.alerts.webhook;
  if (url) alertWebhook(url, event, payload);
}

function buildFreePool() {
  return models.filter(m => m.enabled && m.free && isChatModel(m.id))
    .map(m => m.id)
    .sort((a, b) => autorouteScore(b) - autorouteScore(a));
}

function markFail(m, err, retryAfterMs) {
  const wasHealthy = !m.failUntil || m.failUntil <= Date.now();
  m.lifetimeFails = (m.lifetimeFails || 0) + 1;
  m.lastFailAt = Date.now();
  const base = retryAfterMs || Math.min(60000 * Math.pow(2, Math.min(m.fails, 6)), 3600000);
  m.fails++;
  m.failUntil = Date.now() + base;
  m.halfOpen = false;
  m.lastError = String(err).slice(0, 200);
  if (wasHealthy) alertOnce("provider:" + m.id, "provider_down", { model: m.id, error: m.lastError });
}
function markOk(m) {
  m.lastOkAt = Date.now();
  m.fails = 0;
  m.failUntil = 0;
  m.halfOpen = false;
  m.lastError = "";
}
function bumpRequest(m) {
  if (m.day !== today()) { m.day = today(); m.dailyReq = 0; m.dailyTok = 0; }
  m.requests++;
  m.dailyReq++;
}
function addTokens(m, n, promptTok, completionTok, key) {
  if (!n && !promptTok && !completionTok) return;
  if (m.day !== today()) { m.day = today(); m.dailyReq = 0; m.dailyTok = 0; m.dailyCost = 0; }
  const beforeCost = m.dailyCost || 0;
  if (n) m.tokens += n;
  if (promptTok || completionTok) {
    const cost = computeCost(m, promptTok || 0, completionTok || 0);
    m.cost = (m.cost || 0) + cost;
    m.dailyCost = (m.dailyCost || 0) + cost;
    m.lastPromptTok = promptTok || 0;
    m.lastCompletionTok = completionTok || 0;
  }
  m.dailyTok += (n || (promptTok || 0) + (completionTok || 0));
  if (key) {
    const delta = (m.dailyCost || 0) - beforeCost;
    recordKeyUsage(key, (n || (promptTok || 0) + (completionTok || 0)), delta);
  }
}
function captureUsage(chunk, m, key) {
  try {
    const s = chunk.toString();
    let i = s.indexOf('"usage"');
    while (i >= 0) {
      const end = s.indexOf("}", i);
      if (end < 0) break;
      const frag = s.slice(i, end + 1);
      const mt = frag.match(/total_tokens"?:\s*(\d+)/);
      const mp = frag.match(/prompt_tokens"?:\s*(\d+)/);
      const mc = frag.match(/completion_tokens"?:\s*(\d+)/);
      if (mt || mp || mc) {
        addTokens(m, mt ? parseInt(mt[1], 10) : 0,
          mp ? parseInt(mp[1], 10) : 0,
          mc ? parseInt(mc[1], 10) : 0, key);
      }
      i = s.indexOf('"usage"', i + 1);
    }
  } catch (e) { log("captureUsage parse: " + ((e && e.message) || e)); }
}

function strategyFor(profile) {
  const s = prefs.strategy && prefs.strategy[profile];
  return STRATEGIES.includes(s) ? s : "order";
}
function applyStrategy(ids, strategy) {
  const arr = ids.slice();
  switch (strategy) {
    case "cheapest":
    case "cascade":
      return arr.sort((a, b) => effectivePrice(modelMap.get(a)) - effectivePrice(modelMap.get(b)));
    case "fastest":
      return arr.sort((a, b) => {
        const ma = modelMap.get(a), mb = modelMap.get(b);
        const ta = ma.avgTTFTMs || ma.lastLatencyMs || Infinity;
        const tb = mb.avgTTFTMs || mb.lastLatencyMs || Infinity;
        return ta - tb;
      });
    case "least-used":
      return arr.sort((a, b) => (modelMap.get(a).dailyReq || 0) - (modelMap.get(b).dailyReq || 0));
    case "random":
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    case "autoroute":
      return arr.sort((a, b) => autorouteScore(b) - autorouteScore(a));
    default:
      return arr;
  }
}
function autorouteScore(id) {
  const m = modelMap.get(id);
  if (!m) return -Infinity;
  const now = Date.now();
  let s = 0;
  if (m.failUntil && m.failUntil > now) s -= 100000;
  const total = (m.requests || 0) + (m.lifetimeFails || 0);
  s += (total ? 1 - (m.lifetimeFails || 0) / total : 0.5) * 500;
  const lat = m.avgTTFTMs || m.lastLatencyMs;
  s += lat ? Math.max(0, 300 - lat / 100) : 150;
  if (m.free) s += 200;
  if (m.lastFailAt && (!m.lastOkAt || m.lastFailAt > m.lastOkAt)) s -= 300;
  return s;
}
const enhanceCache = new Map();
function featuresCfg() {
  const f = prefs.features || (prefs.features = {});
  return {
    cache: typeof f.cache === "boolean" ? f.cache : cacheOn,
    autoProbe: typeof f.autoProbe === "boolean" ? f.autoProbe : autoProbeOn
  };
}
function enhancerCfg() {
  const e = prefs.enhancer || {};
  return {
    enabled: typeof e.enabled === "boolean" ? e.enabled : process.env.MODELHUB_ENHANCE !== "0",
    model: modelMap.has(e.model) ? e.model : null,
    maxChars: e.maxChars || 4000,
    timeoutMs: e.timeoutMs || 12000,
    plugins: Array.isArray(e.plugins) ? e.plugins : []
  };
}
async function maybeEnhance(body, req) {
  const cfg = enhancerCfg();
  let em = null;
  try {
    if (!cfg.enabled || !cfg.model) return;
    if (req && req.headers["x-modelhub-no-enhance"]) return;
    if (!body || !Array.isArray(body.messages)) return;
    if (body.tools || body.tool_choice || body.functions || body.function_call) return;
    const msgs = body.messages;
    const last = [...msgs].reverse().find(x => x && x.role === "user");
    if (!last || typeof last.content !== "string") return;
    const original = last.content.trim();
    if (original.length < 16 || original.length > cfg.maxChars) return;
    em = modelMap.get(cfg.model);
    if (!em || !em.enabled) {
      const altId = (prefs.profiles["free-pool"] || []).find(id => {
        const x = modelMap.get(id);
        return x && x.enabled && x.free && (!x.failUntil || x.failUntil <= Date.now());
      });
      em = altId ? modelMap.get(altId) : null;
    }
    if (!em) return;
    const hash = crypto.createHash("sha1").update(original).digest("hex");
    const hit = enhanceCache.get(hash);
    let enhanced = hit && Date.now() - hit.ts < 3600000 ? hit.enhanced : null;
    if (!enhanced) {
      const sys = "You are a prompt enhancer inside ModelHub. Rewrite the user prompt so it is clearer, unambiguous and complete, preserving intent, language and every technical detail. Never answer the prompt. Output ONLY the rewritten prompt.";
      const r = await Promise.race([
        postNonStreaming(em, {
          messages: [
            { role: "system", content: sys },
            { role: "user", content: original }
          ],
          temperature: 0.3,
          max_tokens: Math.min(900, Math.max(220, Math.ceil(original.length / 2)))
        }),
        new Promise(resolve => setTimeout(() => resolve({ ok: false, error: "enhance timeout" }), cfg.timeoutMs))
      ]);
      let out = "";
      if (r.ok && r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message) {
        out = String(r.data.choices[0].message.content || "");
      } else {
        throw new Error(r.error || "bad enhancer response");
      }
       out = out.replace(/^```[^\n]*\n?/, "").replace(/```\s*$/, "").trim();
       out = applyPlugins(sys, out).user;
       if (!out || out.length < 8) throw new Error("empty enhancement");
      enhanced = out;
      recordRequest({ proto: "enhance", reqModel: body.model, model: em.id, ok: true, error: "", latencyMs: r.latencyMs || 0, ttftMs: null, promptTok: r.promptTok || 0, completionTok: r.completionTok || 0, totalTok: r.totalTok || 0, cost: computeCost(em, r.promptTok || 0, r.completionTok || 0), cached: false });
      if (enhanceCache.size > 500) enhanceCache.clear();
      enhanceCache.set(hash, { ts: Date.now(), enhanced });
    }
    last.originalContent = last.content;
    last.content = enhanced;
  } catch (e) {
    recordRequest({ proto: "enhance", reqModel: body && body.model, model: (em && em.id) || cfg.model || "", ok: false, error: String((e && e.message) || e).slice(0, 120), latencyMs: 0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
  }
}
const { cascadeValid, deriveEndpoint } = routingLib;

function selectCandidates(modelId, profile) {
  if (modelId && modelMap.has(modelId) && modelMap.get(modelId).enabled) return [modelId];
  const stripped = modelId && modelId.includes("/") ? modelId.slice(modelId.indexOf("/") + 1) : modelId;
  if (stripped && modelMap.has(stripped) && modelMap.get(stripped).enabled) return [stripped];
  const order = maybeExperiment(profile, prefs.profiles[profile] || prefs.profiles.auto || []);
  const now = Date.now();
  const healthy = order.filter(id => {
    const m = modelMap.get(id);
    return m && m.enabled && isChatModel(id) && (!m.failUntil || m.failUntil <= now);
  });
  const pool = applyStrategy(healthy.length ? healthy : order.filter(id => { const m = modelMap.get(id); return m && m.enabled && isChatModel(id); }), strategyFor(profile));
  return pool;
}

function parseRetryAfter(upRes, body) {
  const header = (upRes.headers["retry-after"] || upRes.headers["Retry-After"] || "");
  if (header) {
    const n = parseInt(header, 10);
    if (!isNaN(n)) return n * 1000;
    const d = new Date(header);
    if (!isNaN(d.getTime())) return Math.max(0, d.getTime() - Date.now());
  }
  try {
    const o = JSON.parse(body || "{}");
    if (typeof o.retry_after === "number") return o.retry_after * 1000;
    if (typeof o.retryAfter === "number") return o.retryAfter * 1000;
  } catch (e) { log("parseRetryAfter parse: " + ((e && e.message) || e)); }
  return null;
}

// ---------------------------------------------------------------------------
// upstream call (non-streaming: Promise<object>)
// ---------------------------------------------------------------------------
async function postNonStreaming(m, openaiBody, key) {
  let u;
  try { u = new URL(m.baseURL); } catch { markFail(m, "bad url"); return { ok: false, error: "bad url" }; }
  await acquireSlot(m.provider);
  try {
    return await new Promise((resolve) => {
    const payload = JSON.stringify({ ...openaiBody, model: m.name, stream: false });
    const t0 = Date.now();
    const transport = u.protocol === "https:" ? https : http;
    const req = transport.request({
      agent: upstreamAgent(u),
      method: "POST",
      hostname: u.hostname, port: u.port || undefined,
      path: u.pathname + (u.search || ""),
      headers: {
        "Content-Type": "application/json",
        "Authorization": m.key ? `Bearer ${m.key}` : "",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (upRes) => {
      if (!upRes.statusCode || upRes.statusCode < 200 || upRes.statusCode >= 300) {
        let b = "";
        upRes.on("data", d => b += d);
        upRes.on("end", () => {
          const ra = parseRetryAfter(upRes, b);
          const code = upRes.statusCode;
          if (code === 429) markFail(m, `HTTP 429`, ra || null);
          else if (/402|403/.test(String(code))) { m.free = false; m.enabled = false; markFail(m, `HTTP ${code} (paid)`, null); }
          else if (code === 401) markFail(m, `HTTP 401 (key?)`, null);
          else markFail(m, `HTTP ${code} ${b.slice(0, 120)}`, null);
          resolve({ ok: false, error: `HTTP ${code}`, httpCode: code });
        });
        return;
      }
      const latencyMs = Date.now() - t0;
      markOk(m);
      bumpRequest(m);
      m.lastLatencyMs = latencyMs;
      let buf = "";
      upRes.on("data", d => buf += d);
      upRes.on("end", () => {
        try {
          const data = JSON.parse(buf);
          const u2 = data.usage || {};
          const pt = u2.prompt_tokens || 0;
          const ct = u2.completion_tokens || 0;
          addTokens(m, u2.total_tokens || (pt + ct), pt, ct, key);
          resolve({ ok: true, data, promptTok: pt, completionTok: ct, totalTok: pt + ct, latencyMs });
        } catch {
          resolve({ ok: false, error: "bad json from upstream" });
        }
      });
    });
    req.on("error", e => { markFail(m, e.message, null); resolve({ ok: false, error: e.message }); });
    req.setTimeout(UPSTREAM_TIMEOUT_NONSTREAM_MS, () => { req.destroy(new Error("timeout")); markFail(m, "timeout", null); resolve({ ok: false, error: "timeout" }); });
    req.write(payload);
    req.end();
    });
  } finally { releaseSlot(m.provider); }
}

// ---------------------------------------------------------------------------
// non-streaming con failover sui candidati del profilo
// ---------------------------------------------------------------------------
// semantic cache embedder helper (no-op until an embedder model is configured)
// ---------------------------------------------------------------------------
async function semEmbed(text) {
  const cfg = semCfg();
  if (!semOn || !cfg.enabled || !cfg.embedder) return null;
  const m = modelMap.get(cfg.embedder);
  if (!m || !m.enabled) return null;
  try {
    const out = await embeddingsForward(m, { input: [text], encoding_format: "float" });
    if (!out.ok || !out.data || !Array.isArray(out.data.data) || !out.data.data[0]) return null;
    const e = out.data.data[0].embedding;
    return Array.isArray(e) ? e : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
async function postWithFailover(openaiBody, key) {
  const profile = resolveProfile(openaiBody.model, openaiBody.messages);
  const strategy = strategyFor(profile);
  const tried = [];
  const ck = cacheKey(openaiBody);

  // 1) exact-match cache (existing behaviour)
  const cached = cacheGet(ck);
  if (cached) {
    cacheHits++;
    recordRequest({ proto: "cache", reqModel: openaiBody.model, model: null, ok: true, error: "", latencyMs: 0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: true });
    return { ok: true, data: { ...cached, modelhub_cached: true }, modelId: null, cached: true };
  }

  // 2) semantic cache (optional): embed the latest user prompt and look up similar
  let semPrompt = null;
  if (semOn && semCfg().enabled && semCfg().embedder) {
    const lastUser = (openaiBody.messages || []).filter(m => m.role === "user").pop();
    semPrompt = typeof lastUser?.content === "string" ? lastUser.content : null;
    if (semPrompt) {
      const vec = await semEmbed(semPrompt);
      if (vec) {
        const hit = semCache.match(vec, semCfg().threshold);
        if (hit) {
          recordRequest({ proto: "cache-sem", reqModel: openaiBody.model, model: null, ok: true, error: "", latencyMs: 0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: true });
          return { ok: true, data: { ...hit, modelhub_sem_cached: true }, modelId: null, cached: true, semantic: true };
        }
      }
    }
  }

  const candidates = selectCandidates(openaiBody.model, profile);
  const chainStart = Date.now();
  const CHAIN_BUDGET = settingsCfg().failoverMs;
  let lastError = "all upstreams failed";
  while (candidates.length) {
    const id = candidates.shift();
    const m = modelMap.get(id);
    if (!m || !m.enabled) continue;
    if (Date.now() - chainStart > CHAIN_BUDGET) { lastError = "failover budget exhausted"; break; }
    tried.push(id);
    const r = await postNonStreaming(m, { ...openaiBody, model: m.name }, key);
    if (!r.ok) { lastError = `${id}: ${r.error}`; continue; }
    if (!cascadeValid(r.data)) {
      lastError = `${id}: skipped (empty/invalid content)`;
      continue;
    }
    cachePut(ck, r.data);
    // store in semantic cache if we have a prompt vector
    if (semPrompt) {
      const vec = await semEmbed(semPrompt);
      if (vec) semCache.add(vec, r.data);
    }
    recordRequest({
      proto: "chat", reqModel: openaiBody.model, model: id, ok: true, error: "",
      latencyMs: r.latencyMs || 0, ttftMs: null,
      promptTok: r.promptTok || 0, completionTok: r.completionTok || 0, totalTok: r.totalTok || 0,
      cost: computeCost(m, r.promptTok || 0, r.completionTok || 0), cached: false
    });
    return { ok: true, data: r.data, modelId: id, tried };
  }
  recordRequest({ proto: "chat", reqModel: openaiBody.model, model: null, ok: false, error: lastError, latencyMs: 0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
  return { ok: false, error: lastError };
}

// ---------------------------------------------------------------------------
// streaming helper: failover + traduzione protocollo
// ---------------------------------------------------------------------------
const { escCh } = loggingLib;

function writeSSE(res, s) { res.write("data: " + s + "\n\n"); }

function makeGeminiTranslator() {
  let model = "";
  return {
    onStart(res, m) { model = m; },
    onDelta(res, text) {
      writeSSE(res, `{"candidates":[{"content":{"parts":[{"text":"${escCh(text)}"}],"role":"model"}}]}`);
    },
    onDone(res, finishReason) {
      if (finishReason) {
        const map = { stop: "STOP", length: "MAX_TOKENS", content_filter: "SAFETY" };
        writeSSE(res, JSON.stringify({ candidates: [{ content: { parts: [], role: "model" }, finishReason: map[finishReason] || "OTHER" }] }));
      }
      res.end();
    }
  };
}

function makeOllamaTranslator() {
  let model = "";
  let full = "";
  return {
    onStart(res, m) { model = m; full = ""; },
    onDelta(res, text) {
      full += text;
      writeSSE(res, JSON.stringify({ model, message: { role: "assistant", content: text }, done: false }));
    },
    onDone(res) {
      writeSSE(res, JSON.stringify({ model, message: { role: "assistant", content: full }, done: true }));
      res.end();
    }
  };
}

const translators = {
  anthropic: {
    onStart(res) {
      writeSSE(res, '{"type":"message_start","message":{"role":"assistant","content":[]}}');
      writeSSE(res, '{"type":"content_block_start","index":0,"content_block":{"type":"text"}}');
    },
    onDelta(res, text) {
      writeSSE(res, `{"type":"content_block_delta","index":0,"content_block":{"index":0,"type":"text"},"delta":{"text":"${escCh(text)}"}}`);
    },
    onDone(res, finishReason) {
      writeSSE(res, '{"type":"content_block_stop","index":0}');
      writeSSE(res, '{"type":"message_stop"}');
      res.end();
    }
  },
  gemini: () => makeGeminiTranslator(),
  ollama: () => makeOllamaTranslator()
};

function streamWithFailover(openaiBody, res, protocol) {
  return new Promise((resolve) => {
    const profile = resolveProfile(openaiBody.model, openaiBody.messages);
    const candidates = selectCandidates(openaiBody.model, profile);
    const translator = translators[protocol];
    const makeXlat = typeof translator === "function" ? translator : () => translator;
    const xlat = makeXlat(res);
    let idx = 0;
    let committed = false;

    const attempt = () => {
      if (committed) return;
      while (idx < candidates.length) {
        const id = candidates[idx++];
        const m = modelMap.get(id);
        if (!m || !m.enabled) continue;
        const reqBody = JSON.stringify({ ...openaiBody, model: m.name, stream: true });
        const t0 = Date.now();
        let u;
        try { u = new URL(m.baseURL); } catch { markFail(m, "bad url"); continue; }
        const transport = u.protocol === "https:" ? https : http;
        if (!streamSlotFree(m.provider)) continue;
        streamSlotTake(m.provider);
        let srel = false;
        const giveOnce = () => { if (!srel) { srel = true; streamSlotGive(m.provider); } };
        const req = transport.request({
          agent: upstreamAgent(u),
          method: "POST",
          hostname: u.hostname, port: u.port || undefined,
          path: u.pathname + (u.search || ""),
          headers: {
            "Content-Type": "application/json",
            "Authorization": m.key ? `Bearer ${m.key}` : "",
            "Content-Length": Buffer.byteLength(reqBody)
          }
        }, (upRes) => {
          if (!upRes.statusCode || upRes.statusCode < 200 || upRes.statusCode >= 300) {
            let b = "";
            upRes.on("data", d => b += d);
            upRes.on("end", () => {
              giveOnce();
              const ra = parseRetryAfter(upRes, b);
              const code = upRes.statusCode;
              if (code === 429) markFail(m, `HTTP 429`, ra || null);
              else if (/402|403/.test(String(code))) { m.free = false; markFail(m, `HTTP ${code} (paid)`, null); }
              else if (code === 401) markFail(m, `HTTP 401 (key?)`, null);
              else markFail(m, `HTTP ${code} ${b.slice(0, 120)}`, null);
              recordRequest({ proto: "stream:" + protocol, reqModel: openaiBody.model, model: id, ok: false, error: `HTTP ${code}`, latencyMs: Date.now() - t0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
            });
            attempt();
            return;
          }
          markOk(m);
          bumpRequest(m);
          m.lastLatencyMs = Date.now() - t0;
          committed = true;
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
          xlat.onStart(res, m.name);
          const pt = new PassThrough();
          upRes.pipe(pt);
          let buf = "";
          let full = "";
          let finished = false;
          let firstAt = null;

          function done() {
            if (finished) return;
            finished = true;
            giveOnce();
            xlat.onDone(res);
            recordRequest({
              proto: "stream:" + protocol, reqModel: openaiBody.model, model: id, ok: true, error: "",
              latencyMs: Date.now() - t0, ttftMs: firstAt ? firstAt - t0 : null,
              promptTok: 0, completionTok: 0, totalTok: 0, cost: null, cached: false
            });
            resolve();
          }

          pt.on("data", (chunk) => {
            if (firstAt == null) {
              firstAt = Date.now();
              const ttft = firstAt - t0;
              m.lastTTFTMs = ttft;
              m.avgTTFTMs = m.avgTTFTMs ? Math.round((m.avgTTFTMs * 3 + ttft) / 4) : ttft;
            }
            buf += chunk.toString();
            const lines = buf.split("\n\n");
            buf = lines.pop();
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6);
              if (raw === "[DONE]") { done(); return; }
              try {
                const ev = JSON.parse(raw);
                const ch = ev.choices && ev.choices[0];
                if (ch && ch.delta) {
                  if (ch.delta.content) {
                    full += ch.delta.content;
                    xlat.onDelta && xlat.onDelta(res, ch.delta.content);
                  }
                }
                if (ch && ch.finish_reason) {
                  xlat.onDone && xlat.onDone(res, ch.finish_reason);
                  return;
                }
              } catch {}
            }
          });
          pt.on("end", () => { if (!finished) done(); });
          pt.on("error", () => { if (!finished) done(); });
          pt.on("close", () => giveOnce());
          return;
        });
        req.on("error", (e) => {
          giveOnce();
          markFail(m, e.message || "error", null);
          recordRequest({ proto: "stream:" + protocol, reqModel: openaiBody.model, model: id, ok: false, error: String(e.message || e).slice(0, 120), latencyMs: Date.now() - t0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
          attempt();
        });
        req.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
          giveOnce();
          req.destroy(new Error("timeout"));
          markFail(m, "timeout", null);
          recordRequest({ proto: "stream:" + protocol, reqModel: openaiBody.model, model: id, ok: false, error: "timeout", latencyMs: Date.now() - t0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
          attempt();
        });
        req.write(reqBody);
        req.end();
        return;
      }
      recordRequest({ proto: "stream:" + protocol, reqModel: openaiBody.model, model: null, ok: false, error: "all upstreams failed", latencyMs: 0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "all upstreams failed", model: openaiBody.model }));
      resolve();
    };
    attempt();
  });
}

// ---------------------------------------------------------------------------
// protocol adapters (entrante -> OpenAI; uscente OpenAI -> protocollo)
// ---------------------------------------------------------------------------
const { anthropicToOpenAI, openAIToAnthropic, geminiGenerateToOpenAI, openAIToGemini, ollamaChatToOpenAI, openAIToOllama } = protocolsLib;

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------
function controlAuthorized(req) {
  const token = process.env.MODELHUB_TOKEN || prefs.controlToken || "";
  if (!token) return true;
  const h = req.headers["x-modelhub-token"] || "";
  const auth = typeof req.headers["authorization"] === "string"
    ? req.headers["authorization"].replace(/^Bearer\s+/i, "")
    : "";
  let q = "";
  try { q = new URL(req.url, "http://localhost").searchParams.get("token") || ""; } catch (e) { log("controlAuthorized url parse: " + ((e && e.message) || e)); }
  return h === token || auth === token || q === token;
}
function gatewayAuthorized(req) {
  const auth = typeof req.headers["authorization"] === "string"
    ? req.headers["authorization"].replace(/^Bearer\s+/i, "")
    : "";
  const alt = req.headers["x-api-key"] || "";
  const secret = auth || alt || null;
  if (!gatewayKids.size) return { ok: true, key: null };
  const kid = resolveGatewayKid(secret);
  if (!kid) return { ok: false, code: 401, error: "invalid or missing API key", key: null };
  const gwMeta = gatewayKeysMeta[kid];
  if (gwMeta && gwMeta.expiresAt && Date.now() > gwMeta.expiresAt) {
    return { ok: false, code: 401, error: "API key expired", key: kid };
  }
  const limitKey = secret; // keyLimit reads prefs.keylimits keyed by secret
  if (keyOverLimit(limitKey)) return { ok: false, code: 429, error: "key quota reached", key: kid };
  // per-key requests-per-minute (sliding 60s window)
  const lim = keyLimit(limitKey);
  if (lim && lim.rpm) {
    const now = Date.now();
    const bucket = keyRpm.get(kid) || [];
    if (rateLimited(bucket, now, lim.rpm)) return { ok: false, code: 429, error: "rate limit exceeded (rpm)", key: kid };
    bucket.push(now);
    keyRpm.set(kid, bucket);
  }
  // record usage timestamp
  const meta = gatewayKeysMeta[kid];
  if (meta) meta.lastUsedAt = Date.now();
  return { ok: true, key: kid };
}

// ---------------------------------------------------------------------------
// upstream helpers (discovery / embeddings)
// ---------------------------------------------------------------------------
function fetchJSON(targetURL, apiKey) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(targetURL); } catch { return reject(new Error("bad url")); }
    const transport = u.protocol === "https:" ? https : http;
    const req = transport.request({
      agent: upstreamAgent(u),
      method: "GET",
      hostname: u.hostname, port: u.port || undefined,
      path: u.pathname + (u.search || ""),
      headers: { "Authorization": apiKey ? `Bearer ${apiKey}` : "", "Accept": "application/json" }
    }, (res) => {
      let b = "";
      res.on("data", d => b += d);
      res.on("end", () => {
        try { resolve(JSON.parse(b)); } catch { reject(new Error("bad json")); }
      });
    });
    req.on("error", e => reject(e));
    req.setTimeout(15000, () => { req.destroy(new Error("timeout")); reject(new Error("timeout")); });
    req.end();
  });
}
function embeddingsForward(m, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ model: m.name, input: body.input, encoding_format: body.encoding_format });
    const t0 = Date.now();
    let u;
    try { u = new URL(deriveEndpoint(m.baseURL, "embeddings")); } catch { return resolve({ ok: false, error: "bad url" }); }
    const transport = u.protocol === "https:" ? https : http;
    const req = transport.request({
      agent: upstreamAgent(u),
      method: "POST",
      hostname: u.hostname, port: u.port || undefined,
      path: u.pathname + (u.search || ""),
      headers: { "Content-Type": "application/json", "Authorization": m.key ? `Bearer ${m.key}` : "", "Content-Length": Buffer.byteLength(payload) }
    }, (upRes) => {
      let b = "";
      upRes.on("data", d => b += d);
      upRes.on("end", () => {
        const latencyMs = Date.now() - t0;
        if (!upRes.statusCode || upRes.statusCode < 200 || upRes.statusCode >= 300) {
          markFail(m, `HTTP ${upRes.statusCode} (embeddings)`, null);
          return resolve({ ok: false, error: `HTTP ${upRes.statusCode}` });
        }
        markOk(m);
        bumpRequest(m);
        m.lastLatencyMs = latencyMs;
        try {
          const data = JSON.parse(b);
          const pt = (data.usage && data.usage.prompt_tokens) || 0;
          addTokens(m, pt, pt, 0);
          resolve({ ok: true, data, promptTok: pt, totalTok: pt, latencyMs });
        } catch { resolve({ ok: false, error: "bad json from upstream" }); }
      });
    });
    req.on("error", e => { markFail(m, e.message, null); resolve({ ok: false, error: e.message }); });
    req.setTimeout(60000, () => { req.destroy(new Error("timeout")); markFail(m, "timeout", null); resolve({ ok: false, error: "timeout" }); });
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// control API
// ---------------------------------------------------------------------------
function settingsCfg() {
  const s = prefs.settings || {};
  const num = (envKey, k, d) => {
    const e = parseInt(process.env[envKey], 10);
    return Number.isFinite(e) ? e : (Number.isFinite(s[k]) ? s[k] : d);
  };
  return {
    port: config.port,
    provConcurrency: PROV_CONCURRENCY,
    streamCapPerProvider: STREAM_CAP_PER_PROVIDER,
    verifyMs: num("MODELHUB_VERIFY_MS", "verifyMs", 900000),
    verifyTopK: num("MODELHUB_VERIFY_TOPK", "verifyTopK", 6),
    failoverMs: num("MODELHUB_FAILOVER_MS", "failoverMs", 45000),
    cacheTtlMs: num("MODELHUB_CACHE_TTL", "cacheTtlMs", 600000),
    tokenSet: !!(process.env.MODELHUB_TOKEN || prefs.controlToken)
  };
}
function controlState() {
  const totals = models.reduce((a, m) => {
    a.req += m.dailyReq || 0;
    a.tok += m.dailyTok || 0;
    a.cost += m.dailyCost || 0;
    a.lifetimeCost += m.cost || 0;
    if (m.enabled && (!m.failUntil || m.failUntil <= Date.now())) a.healthy++;
    return a;
  }, { req: 0, tok: 0, cost: 0, lifetimeCost: 0, healthy: 0 });
  return {
    version: VERSION,
    port: config.port,
    uptimeSec: Math.round((Date.now() - startTime) / 1000),
    providers: config.providers.map(p => ({ name: p.name, label: p.label, needsKey: !!p.needsKey, modelCount: (p.models || []).length, keyUrl: p.keyUrl || SIGNUP_URLS[p.name] || "" })),
    keysPresent: config.providers.reduce((a, p) => { a[p.name] = !!(p.authId && resolveKey(p.authId)); return a; }, {}),
    profiles: Object.keys(prefs.profiles),
    profileOrder: prefs.profiles,
    strategies: prefs.strategy,
    enhancer: enhancerCfg(),
    leaderboard: models.filter(m => m.enabled && isChatModel(m.id)).map(m => ({
      id: m.id, free: m.free,
      healthy: !m.failUntil || m.failUntil <= Date.now(),
      verified: !!m.verified, lastVerifiedAt: m.lastVerifiedAt || 0,
      avgTTFTMs: m.avgTTFTMs || 0,
      requests: m.requests || 0, fails: m.lifetimeFails || 0,
      score: Math.round(autorouteScore(m.id))
    })).sort((a, b) => b.score - a.score).slice(0, 30),
    pricing: { currency: pricing.currency || "USD", providers: pricing.providers },
    gatewayKeys: [...gatewayKids.keys()].map(kid => ({
      kid,
      label: (gatewayKeysMeta[kid] && gatewayKeysMeta[kid].label) || "",
      createdAt: (gatewayKeysMeta[kid] && gatewayKeysMeta[kid].createdAt) || 0,
      lastUsedAt: (gatewayKeysMeta[kid] && gatewayKeysMeta[kid].lastUsedAt) || 0,
      expiresAt: (gatewayKeysMeta[kid] && gatewayKeysMeta[kid].expiresAt) || 0,
      // prefs.keylimits is keyed by secret; look up via the in-memory secret
      limit: keyLimit(gatewayKids.get(kid) || kid),
      used: keyUsed(gatewayKids.get(kid) || kid),
      rpm: (keyLimit(gatewayKids.get(kid) || kid) && keyLimit(gatewayKids.get(kid) || kid).rpm) || 0
    })),
    semCache: { enabled: semOn, size: semCache.size(), threshold: semCfg().threshold, embedder: semCfg().embedder },
    cache: { enabled: cacheOn, size: responseCache.size, hits: cacheHits, ttlMs: CACHE_TTL_MS },
    features: featuresCfg(),
    settings: settingsCfg(),
    experiments: prefs.experiments || null,
    alerts: prefs.alerts || null,
    keylimits: prefs.keylimits || null,
    plugins: Object.keys(ENHANCE_PLUGINS),
    totals: { req: totals.req, tok: totals.tok, cost: Math.round(totals.cost * 1e4) / 1e4, lifetimeCost: Math.round(totals.lifetimeCost * 1e4) / 1e4, healthy: totals.healthy },
    models: models.map(m => ({
      id: m.id, provider: m.provider, label: m.label, name: m.name,
      free: m.free, enabled: m.enabled, keyOk: m.keyOk,
      healthy: !m.failUntil || m.failUntil <= Date.now(),
      verified: !!m.verified, lastVerifiedAt: m.lastVerifiedAt || 0,
      fails: m.fails, lastError: m.lastError, lastLatencyMs: m.lastLatencyMs,
      lastTTFTMs: m.lastTTFTMs || 0, avgTTFTMs: m.avgTTFTMs || 0,
      requests: m.requests, tokens: m.tokens,
      dailyReq: m.dailyReq, dailyTok: m.dailyTok,
      dailyCost: Math.round((m.dailyCost || 0) * 1e4) / 1e4,
      cost: Math.round((m.cost || 0) * 1e4) / 1e4
    }))
  };
}
function sendJSON(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", d => b += d);
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
  });
}
async function handleControl(req, res, url) {
  if (req.method === "GET" && url === "/hub/state") return sendJSON(res, 200, controlState());
  if (req.method === "GET" && url === "/hub/config") return sendJSON(res, 200, config);
  if (req.method === "GET" && url === "/hub/providers") {
    const out = config.providers.map(p => {
      const ms = (p.models || []).map(m => {
        const entry = modelMap.get(`${p.name}/${m.name}`);
        return { name: m.name, free: m.free, enabled: !!(entry && entry.enabled), knownFree: !!m.free };
      });
      return { name: p.name, label: p.label, needsKey: !!p.needsKey, authId: p.authId, baseURL: p.baseURL, models: ms };
    });
    return sendJSON(res, 200, out);
  }

  if (req.method === "GET" && url === "/hub/export") {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: VERSION,
      config,
      pricing,
      prefs,
      keys: auth
    };
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="modelhub-export-${new Date().toISOString().slice(0, 10)}.json"`
    });
    return res.end(JSON.stringify(payload, null, 2));
  }

  if (url === "/hub/import" && req.method === "POST") {
    let parsedInc = null;
    try { parsedInc = await readBody(req); } catch (e) { log("import readBody: " + ((e && e.message) || e)); }
    const inc = parsedInc && typeof parsedInc === "object" ? parsedInc : null;
    if (!inc || (!inc.config && !inc.prefs && !inc.keys)) return sendJSON(res, 400, { error: "nothing to import" });
    const imported = { providers: 0, keys: 0, profiles: 0 };
    if (inc.config && Array.isArray(inc.config.providers)) {
      config = Object.assign({}, inc.config, { port: config.port });
      imported.providers = config.providers.length;
      writeJSON(CONFIG_FILE, config, log);
    }
    if (inc.keys && typeof inc.keys === "object") {
      for (const [k, v] of Object.entries(inc.keys)) {
        auth[k] = typeof v === "string" ? v : v.key;
        imported.keys++;
      }
      writeAuth(auth);
    }
    if (inc.prefs && typeof inc.prefs === "object") {
      for (const k of ["enabled", "profiles", "strategy", "gatewayKeys", "enhancer", "features"]) {
        if (inc.prefs[k] !== undefined) prefs[k] = inc.prefs[k];
      }
      imported.profiles = Object.keys(prefs.profiles || {}).length;
      writeJSON(PREFS_FILE, prefs, log);
    }
    if (inc.pricing && typeof inc.pricing === "object" && inc.pricing.providers) {
      pricing = inc.pricing;
      writeJSON(PRICING_FILE, pricing);
    }
    // Rebuild the gateway-key map from the (possibly imported) secrets in prefs.
    gatewayKids.clear();
    for (const secret of (prefs.gatewayKeys || [])) gatewayKids.set(kidOf(secret), secret);
    // Re-sync persisted kids file against the live map
    writeGatewayKeys();
    rebuildModels();
    return sendJSON(res, 200, { ok: true, imported });
  }

  const body = await readBody(req);
  if (url === "/hub/key/reveal" && body.provider) {
    const p = config.providers.find(x => x.name === body.provider);
    const aid = (p && p.authId && !p.authId.startsWith("env:")) ? p.authId : body.provider;
    const key = resolveKey(aid);
    if (!key) return sendJSON(res, 404, { error: "no key stored" });
    return sendJSON(res, 200, { ok: true, key });
  }
  if (url === "/hub/features") {
    const f = prefs.features || (prefs.features = {});
    if (typeof body.cache === "boolean") { f.cache = body.cache; cacheOn = body.cache; }
    if (typeof body.autoProbe === "boolean") { f.autoProbe = body.autoProbe; autoProbeOn = body.autoProbe; }
    if (typeof body.startMinimized === "boolean") f.startMinimized = body.startMinimized;
    writeJSON(PREFS_FILE, prefs, log);
    return sendJSON(res, 200, { ok: true, features: featuresCfg() });
  }
  if (url === "/hub/settings") {
    const s = prefs.settings || (prefs.settings = {});
    const bounds = { verifyMs: [30000, 86400000], verifyTopK: [3, 50], failoverMs: [5000, 600000], cacheTtlMs: [10000, 86400000] };
    for (const [k, [min, max]] of Object.entries(bounds)) {
      const v = Number(body[k]);
      if (Number.isFinite(v)) s[k] = Math.min(max, Math.max(min, Math.round(v)));
    }
    let newToken = null;
    if (body.regenerateToken === true) {
      newToken = crypto.randomBytes(24).toString("hex");
      prefs.controlToken = newToken;
    }
    writeJSON(PREFS_FILE, prefs, log);
    return sendJSON(res, 200, { ok: true, settings: settingsCfg(), regeneratedToken: newToken });
  }
  if (url === "/hub/toggle" && body.id) {
    prefs.enabled[body.id] = body.enabled !== false;
    writeJSON(PREFS_FILE, prefs, log);
    rebuildProfiles();
    return sendJSON(res, 200, { ok: true });
  }
  if (url === "/hub/reorder" && Array.isArray(body.order)) {
    const prof = body.profile || "auto";
    prefs.profiles[prof] = body.order.filter(id => modelMap.has(id));
    writeJSON(PREFS_FILE, prefs, log);
    return sendJSON(res, 200, { ok: true });
  }
  if (url === "/hub/profile/create" && body.name) {
    if (!prefs.profiles[body.name]) prefs.profiles[body.name] = models.filter(m => m.enabled).map(m => m.id);
    writeJSON(PREFS_FILE, prefs, log);
    return sendJSON(res, 200, { ok: true, profiles: Object.keys(prefs.profiles) });
  }
  if (url === "/hub/profile/delete" && body.name && !DEFAULT_PROFILES.includes(body.name)) {
    delete prefs.profiles[body.name];
    writeJSON(PREFS_FILE, prefs, log);
    return sendJSON(res, 200, { ok: true, profiles: Object.keys(prefs.profiles) });
  }
  if (url === "/hub/keys" && body.provider) {
    const key = body.key || "";
    const p = config.providers.find(x => x.name === body.provider);
    const aid = (p && p.authId && !p.authId.startsWith("env:")) ? p.authId : body.provider;
    if (key) auth[aid] = key; else delete auth[aid];
    writeAuth(auth);
    rebuildModels();
    return sendJSON(res, 200, { ok: true });
  }
  if (url === "/hub/provider/add" && body.name && body.baseURL) {
    if (config.providers.find(p => p.name === body.name)) return sendJSON(res, 409, { error: "provider exists" });
    const authId = body.authId || (body.key ? body.name : null);
    const prov = {
      name: body.name,
      label: body.label || body.name,
      baseURL: body.baseURL,
      authId,
      needsKey: !!body.needsKey,
      models: (body.models || []).map(m => ({ name: m.name || m, free: !!(m.free) }))
    };
    if (body.key && authId && !authId.startsWith("env:")) { auth[authId] = body.key; writeAuth(auth); }
    config.providers.push(prov);
    let discovered = null;
    if (body.discover !== false && /^https?:/i.test(prov.baseURL)) {
      try {
        const list = await fetchJSON(deriveEndpoint(prov.baseURL, "models"), resolveKey(authId));
        prov.models = prov.models || [];
        for (const it of (list.data || [])) {
          const name = typeof it === "string" ? it : it.id;
          if (name && !prov.models.some(x => x.name === name)) prov.models.push({ name, free: false });
        }
        discovered = prov.models.length;
      } catch (e) { discovered = 0; }
    }
    writeJSON(CONFIG_FILE, config, log);
    rebuildModels();
    return sendJSON(res, 200, { ok: true, discovered, models: prov.models.length });
  }
  if (url === "/hub/provider/remove" && body.name) {
    config.providers = config.providers.filter(p => p.name !== body.name);
    writeJSON(CONFIG_FILE, config, log);
    rebuildModels();
    return sendJSON(res, 200, { ok: true });
  }
  if (req.method === "GET" && url === "/hub/logs") {
    return sendJSON(res, 200, { logs: reqLog.slice().reverse() });
  }
  if (url === "/hub/strategy" && body.profile && STRATEGIES.includes(body.strategy)) {
    prefs.strategy[body.profile] = body.strategy;
    writeJSON(PREFS_FILE, prefs, log);
    return sendJSON(res, 200, { ok: true, strategies: prefs.strategy });
  }
  if (url === "/hub/enhancer") {
    const e = prefs.enhancer || (prefs.enhancer = {});
    if (typeof body.enabled === "boolean") e.enabled = body.enabled;
    if (Array.isArray(body.plugins)) e.plugins = body.plugins.map(String);
    if (body.model !== undefined) {
      if (body.model && !modelMap.has(body.model)) return sendJSON(res, 400, { error: "unknown model" });
      e.model = body.model || "";
    }
    if (Number.isFinite(body.maxChars)) e.maxChars = Math.max(200, body.maxChars);
    if (Number.isFinite(body.timeoutMs)) e.timeoutMs = Math.max(1000, body.timeoutMs);
    writeJSON(PREFS_FILE, prefs, log);
    return sendJSON(res, 200, { ok: true, enhancer: enhancerCfg() });
  }
  if (req.method === "GET" && url === "/hub/pricing") {
    return sendJSON(res, 200, pricing);
  }
  if (url === "/hub/pricing" && body.provider) {
    pricing.providers = pricing.providers || {};
    pricing.providers[body.provider] = { input: Number(body.input) || 0, output: Number(body.output) || 0 };
    writeJSON(PRICING_FILE, pricing);
    return sendJSON(res, 200, { ok: true });
  }
  // --- Gateway key management (POST): mint | revoke | limit -----------------
  if (url === "/hub/gateway-keys" && req.method === "POST") {
    prefs.keylimits = prefs.keylimits || {};
    // helper: resolve a kid (from UI) to the in-memory secret
    const secretFor = (kid) => (kid && gatewayKids.has(kid)) ? gatewayKids.get(kid) : null;
    // Revoke a key (by kid)
    if (body.action === "revoke" && body.kid) {
      const sec = secretFor(body.kid);
      if (sec) {
        gatewayKids.delete(body.kid);
        prefs.gatewayKeys = prefs.gatewayKeys.filter(k => k !== sec);
        delete gatewayKeysMeta[body.kid];
        delete prefs.keylimits[sec];
      }
      writeGatewayKeys();
      writeJSON(PREFS_FILE, prefs, log);
      return sendJSON(res, 200, { ok: true, count: gatewayKids.size });
    }
    // Set per-key limits (tokens / spend / rpm) — keyed by kid
    if (body.action === "limit" && body.kid) {
      const sec = secretFor(body.kid);
      if (!sec) return sendJSON(res, 404, { error: "unknown key id" });
      const lim = prefs.keylimits[sec] || (prefs.keylimits[sec] = {});
      if (Number.isFinite(body.tokens)) lim.tokens = body.tokens;
      if (Number.isFinite(body.spend)) lim.spend = body.spend;
      if (Number.isFinite(body.rpm)) lim.rpm = Math.max(0, Math.floor(body.rpm));
      writeJSON(PREFS_FILE, prefs, log);
      return sendJSON(res, 200, { ok: true, kid: body.kid, limit: keyLimit(sec) });
    }
    // Mint a new key (optionally labelled + initial limits + expiry)
    if (body.action === "mint" || body.mint || !body.action) {
      const expDays = Number(body.expiresInDays);
      const { key, kid, meta } = mintKey(body.label, Number.isFinite(expDays) && expDays > 0 ? expDays : undefined);
      prefs.gatewayKeys.push(key);
      gatewayKids.set(kid, key);
      gatewayKeysMeta[kid] = meta;
      if (Number.isFinite(body.rpm) || Number.isFinite(body.tokens) || Number.isFinite(body.spend)) {
        const lim = prefs.keylimits[key] || (prefs.keylimits[key] = {});
        if (Number.isFinite(body.tokens)) lim.tokens = body.tokens;
        if (Number.isFinite(body.spend)) lim.spend = body.spend;
        if (Number.isFinite(body.rpm)) lim.rpm = Math.max(0, Math.floor(body.rpm));
      }
      writeGatewayKeys();
      writeJSON(PREFS_FILE, prefs, log);
      // NOTE: the secret is returned ONLY here, once. gateway-keys.json stores kid+meta only.
      return sendJSON(res, 200, {
        ok: true, secret: key, kid, label: body.label || "",
        count: gatewayKids.size, limit: keyLimit(key)
      });
    }
    return sendJSON(res, 400, { error: "unknown gateway-keys action" });
  }
  if (req.method === "GET" && url === "/hub/gateway-keys") {
    return sendJSON(res, 200, {
      keys: [...gatewayKids.keys()].map(kid => ({
        kid, label: (gatewayKeysMeta[kid] && gatewayKeysMeta[kid].label) || "",
        createdAt: (gatewayKeysMeta[kid] && gatewayKeysMeta[kid].createdAt) || 0,
        lastUsedAt: (gatewayKeysMeta[kid] && gatewayKeysMeta[kid].lastUsedAt) || 0,
        expiresAt: (gatewayKeysMeta[kid] && gatewayKeysMeta[kid].expiresAt) || 0,
        rpm: (keyLimit(gatewayKids.get(kid) || kid) && keyLimit(gatewayKids.get(kid) || kid).rpm) || 0,
        limit: keyLimit(gatewayKids.get(kid) || kid), used: keyUsed(gatewayKids.get(kid) || kid)
      }))
    });
  }
  if (url === "/hub/cache") {
    responseCache.clear();
    cacheHits = 0;
    return sendJSON(res, 200, { ok: true });
  }
  if (url === "/hub/semcache") {
    if (req.method === "GET") {
      return sendJSON(res, 200, { ok: true, enabled: semOn, size: semCache.size(), ...semCfg() });
    }
    if (body.action === "clear") {
      semCache.clear();
      return sendJSON(res, 200, { ok: true, size: semCache.size() });
    }
    const f = prefs.features || (prefs.features = {});
    if (typeof body.enabled === "boolean") f.semCache = body.enabled;
    if (body.embedder !== undefined) {
      if (body.embedder && !modelMap.has(body.embedder)) return sendJSON(res, 400, { error: "unknown embedder model" });
      prefs.semCache = prefs.semCache || {};
      prefs.semCache.embedder = body.embedder || "";
    }
    if (Number.isFinite(body.threshold)) {
      prefs.semCache = prefs.semCache || {};
      prefs.semCache.threshold = Math.min(1, Math.max(0, body.threshold));
    }
    writeJSON(PREFS_FILE, prefs, log);
    return sendJSON(res, 200, { ok: true, enabled: semCfg().enabled, embedder: semCfg().embedder, threshold: semCfg().threshold });
  }
  if (url === "/hub/keys") {
    if (req.method === "GET") {
      const keys = [...gatewayKids.keys()].map(kid => {
        const sec = gatewayKids.get(kid);
        return { kid, key: sec, limit: keyLimit(sec), used: keyUsed(sec), rpm: (keyLimit(sec) && keyLimit(sec).rpm) || 0 };
      });
      return sendJSON(res, 200, { keys });
    }
    // Bulk import provider keys: { "openai": "sk-...", "anthropic": "sk-...", ... }
    if (body && typeof body === "object" && Object.keys(body).some(k => k !== "key" && k !== "tokens" && k !== "spend")) {
      let count = 0;
      for (const [provider, key] of Object.entries(body)) {
        if (provider === "key" || provider === "tokens" || provider === "spend") continue;
        if (typeof key !== "string" || !key.trim()) continue;
        auth[provider] = key.trim();
        count++;
      }
      if (count > 0) {
        writeAuth(auth);
        log("imported " + count + " provider keys via /hub/keys");
        return sendJSON(res, 200, { ok: true, count, imported: { keys: count } });
      }
    }
    const k = body.key || (prefs.gatewayKeys && prefs.gatewayKeys[0]) || null;
    if (!k) return sendJSON(res, 400, { error: "no gateway key" });
    prefs.keylimits = prefs.keylimits || {};
    const lim = prefs.keylimits[k] || (prefs.keylimits[k] = {});
    if (Number.isFinite(body.tokens)) lim.tokens = body.tokens;
    if (Number.isFinite(body.spend)) lim.spend = body.spend;
    writeJSON(PREFS_FILE, prefs, log);
    return sendJSON(res, 200, { ok: true, key: k, limit: keyLimit(k) });
  }
  if (url === "/hub/experiments" && req.method === "POST") {
    prefs.experiments = { enabled: !!body.enabled, profile: body.profile || "auto", candidate: body.candidate || "", splitPct: Number.isFinite(body.splitPct) ? body.splitPct : 0 };
    writeJSON(PREFS_FILE, prefs, log);
    return sendJSON(res, 200, { ok: true, experiments: prefs.experiments });
  }
  if (url === "/hub/alerts" && req.method === "POST") {
    prefs.alerts = { webhook: body.webhook || "" };
    writeJSON(PREFS_FILE, prefs, log);
    return sendJSON(res, 200, { ok: true, alerts: prefs.alerts });
  }
  if (url === "/hub/discover") {
    const runProvider = async (p) => {
      try {
        const list = await fetchJSON(deriveEndpoint(p.baseURL, "models"), resolveKey(p.authId));
        const known = new Set((p.models || []).map(m => m.name));
        p.models = p.models || [];
        let added = 0;
        for (const it of (list.data || [])) {
          const name = typeof it === "string" ? it : it.id;
          if (!name || known.has(name)) continue;
          p.models.push({ name, free: false });
          known.add(name);
          added++;
        }
        return { provider: p.name, added, total: p.models.length, error: "" };
      } catch (e) {
        return { provider: p.name, added: 0, total: (p.models || []).length, error: String((e && e.message) || e).slice(0, 120) };
      }
    };
    if (body.provider) {
      const p = config.providers.find(x => x.name === body.provider);
      if (!p) return sendJSON(res, 404, { error: "provider not found" });
      const results = [await runProvider(p)];
      writeJSON(CONFIG_FILE, config, log);
      rebuildModels();
      return sendJSON(res, 200, { ok: true, results });
    }
    const targets = config.providers.filter(p => /^https?:/i.test(p.baseURL || ""));
    const queue = targets.slice();
    const results = [];
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) { results.push(await runProvider(queue.shift())); }
    }));
    writeJSON(CONFIG_FILE, config, log);
    rebuildModels();
    return sendJSON(res, 200, { ok: true, scanned: targets.length, results });
  }
  if (url === "/hub/probe") {
    const targets = body.id ? [modelMap.get(body.id)] : models.filter(m => m.enabled);
    for (const m of targets) {
      if (!m) continue;
      await new Promise((res2) => {
        const body = JSON.stringify({ model: m.name, messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false });
        const t0 = Date.now();
        const u = new URL(m.baseURL);
        const transport = u.protocol === "https:" ? https : http;
        const req = transport.request({
          method: "POST",
          hostname: u.hostname, port: u.port || undefined,
          path: u.pathname + (u.search || ""),
          headers: { "Content-Type": "application/json", "Authorization": m.key ? `Bearer ${m.key}` : "", "Content-Length": Buffer.byteLength(body) }
        }, (upRes) => {
          if (!upRes.statusCode || upRes.statusCode < 200 || upRes.statusCode >= 300) {
            let b = "";
            upRes.on("data", d => b += d);
            upRes.on("end", () => {
              const ra = parseRetryAfter(upRes, b);
              const code = upRes.statusCode;
              if (code === 429) markFail(m, `HTTP 429`, ra || null);
              else if (/402|403/.test(String(code))) { m.free = false; m.enabled = false; markFail(m, `HTTP ${code} (paid)`, null); }
              else if (code === 401) markFail(m, `HTTP 401 (key?)`, null);
              else markFail(m, `HTTP ${code} ${b.slice(0, 120)}`, null);
            });
          } else {
            markOk(m);
            m.lastLatencyMs = Date.now() - t0;
            bumpRequest(m);
          }
          res2();
        });
        req.on("error", e => { markFail(m, e.message, null); res2(); });
        req.setTimeout(15000, () => { req.destroy(new Error("timeout")); markFail(m, "timeout", null); res2(); });
        req.write(body);
        req.end();
      });
    }
    rebuildProfiles();
    return sendJSON(res, 200, controlState());
  }
  return sendJSON(res, 404, { error: "unknown control" });
}

// ---------------------------------------------------------------------------
// Prometheus metrics
// ---------------------------------------------------------------------------
function promMetrics() {
  return metricsLib.promMetrics({ startTime, cacheHits, responseCache, models });
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const startTime = Date.now();
const OPEN_PATHS = new Set(["/v1/models", "/models", "/api/tags", "/api/show"]);

// --- rate limit per IP su API di controllo (/hub/*) ---
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const rateBuckets = new Map();
function controlRateLimited(req) {
  if (!prefs.controlToken && !process.env.MODELHUB_TOKEN) return false; // niente token = lock disabilitato
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const b = rateBuckets.get(key) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > b.resetAt) { b.count = 0; b.resetAt = now + RATE_WINDOW_MS; }
  b.count++;
  rateBuckets.set(key, b);
  return b.count > RATE_MAX;
}

// --- rotazione requests.log.jsonl per data ---
function rotatedRequestLogPath() {
  const d = new Date();
  const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return REQUEST_LOG_FILE.replace(/(\.jsonl)?$/, `.${day}.jsonl`);
}
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'";

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, x-modelhub-token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  try {
    if (url === "/metrics") {
      res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
      return res.end(promMetrics());
    }
    if (url.startsWith("/hub/")) {
      if (controlRateLimited(req)) return sendJSON(res, 429, { error: "rate limited" });
      if (!controlAuthorized(req)) return sendJSON(res, 401, { error: "unauthorized" });
      return await handleControl(req, res, url);
    }
    if (!OPEN_PATHS.has(url)) {
      const gw = gatewayAuthorized(req);
      if (!gw.ok) return sendJSON(res, gw.code || 401, { error: gw.error || "unauthorized" });
    }

    if (req.method === "GET" && (url === "/v1/models" || url === "/models")) {
      const profileData = Object.keys(prefs.profiles).map(name => ({
        id: name, object: "model", owned_by: "modelhub", root: name,
        provider: "modelhub", label: "Profilo: " + name, free: false, isProfile: true
      }));
      const modelData = models.filter(m => m.enabled).map(m => ({
        id: m.id, object: "model", owned_by: m.provider, root: m.name,
        provider: m.provider, label: m.label, free: m.free
      }));
      return sendJSON(res, 200, { object: "list", data: [...profileData, ...modelData] });
    }

    // OpenAI streaming
    let parsedChat = null;
    if (req.method === "POST" && url.includes("chat/completions")) {
      let body = "";
      for await (const c of req) body += c;
      try { parsedChat = JSON.parse(body); } catch { res.writeHead(400); return res.end("bad json"); }
      if (!parsedChat || !parsedChat.model) { res.writeHead(400); return res.end("missing model"); }
    }
    if (parsedChat) await maybeEnhance(parsedChat, req);
    if (parsedChat && parsedChat.stream === true) {
      const parsed = parsedChat;
      const profile = resolveProfile(parsed.model, parsed.messages);
      const candidates = selectCandidates(parsed.model, profile);
      const chainStart = Date.now();
      const CHAIN_BUDGET = settingsCfg().failoverMs;
      let clientStarted = false;
      let chainClosed = false;
      let gen = 0;
      const safeEnd = () => { if (!chainClosed) { chainClosed = true; try { res.end(); } catch {} } };
      const terminal = (code, obj) => {
        if (clientStarted || chainClosed) { safeEnd(); return; }
        chainClosed = true;
        try { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); } catch {}
      };
      const key = keyIdFor(req);
      if (key && keyOverLimit(key)) {
        recordRequest({ proto: "stream:openai", reqModel: parsed.model, model: null, ok: false, error: "key limit reached", latencyMs: 0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
        terminal(429, { error: "key limit reached" });
        return;
      }
      const attempt = () => {
        if (clientStarted || chainClosed) { safeEnd(); return; }
        if (!candidates.length) {
          recordRequest({ proto: "stream:openai", reqModel: parsed.model, model: null, ok: false, error: "all upstreams failed", latencyMs: 0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
          terminal(502, { error: "no candidates" });
          return;
        }
        if (Date.now() - chainStart > CHAIN_BUDGET) {
          recordRequest({ proto: "stream:openai", reqModel: parsed.model, model: null, ok: false, error: "failover budget exhausted", latencyMs: Date.now() - chainStart, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
          terminal(502, { error: "failover timeout" });
          return;
        }
        const peekId = candidates[0];
        const peekM = peekId ? modelMap.get(peekId) : null;
        if (peekM && !streamSlotFree(peekM.provider)) { setTimeout(attempt, 250); return; }
        const id = candidates.shift();
        const m = modelMap.get(id);
        if (!m || !m.enabled) { attempt(); return; }
        streamSlotTake(m.provider);
        let srel = false;
        const giveOnce = () => { if (!srel) { srel = true; streamSlotGive(m.provider); } };
        const reqBody = JSON.stringify({ ...parsed, model: m.name, stream: true });
        const t0 = Date.now();
        gen++;
        const myGen = gen;
        const stale = () => myGen !== gen;
        let ffailed = false;
        let u;
        try { u = new URL(m.baseURL); } catch { markFail(m, "bad url"); attempt(); return; }
        const transport = u.protocol === "https:" ? https : http;
        const req = transport.request({
          agent: upstreamAgent(u),
          method: "POST",
          hostname: u.hostname, port: u.port || undefined,
          path: u.pathname + (u.search || ""),
          headers: { "Content-Type": "application/json", "Authorization": m.key ? `Bearer ${m.key}` : "", "Content-Length": Buffer.byteLength(reqBody) }
        }, (upRes) => {
          if (!upRes.statusCode || upRes.statusCode < 200 || upRes.statusCode >= 300) {
            let b = "";
            upRes.on("data", d => b += d);
            upRes.on("end", () => {
              giveOnce();
              const ra = parseRetryAfter(upRes, b);
              const code = upRes.statusCode;
              if (code === 429) markFail(m, `HTTP 429`, ra || null);
              else if (/402|403/.test(String(code))) { m.free = false; markFail(m, `HTTP ${code} (paid)`, null); }
              else if (code === 401) markFail(m, `HTTP 401 (key?)`, null);
              else markFail(m, `HTTP ${code} ${b.slice(0, 120)}`, null);
              recordRequest({ proto: "stream:openai", reqModel: parsed.model, model: id, ok: false, error: `HTTP ${code}`, latencyMs: Date.now() - t0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
              if (clientStarted || chainClosed) safeEnd();
              else attempt();
            });
            return;
          }
          const latencyMs = Date.now() - t0;
          markOk(m);
          bumpRequest(m);
          m.lastLatencyMs = latencyMs;
          const pt = new PassThrough();
          upRes.pipe(pt);
          let held = [];
          let heldBytes = 0;
          let saw = false;
          let firstAt = null;
          const failEmpty = (why) => {
            giveOnce();
            if (ffailed || stale() || clientStarted || chainClosed) return;
            ffailed = true;
            markFail(m, why, null);
            recordRequest({ proto: "stream:openai", reqModel: parsed.model, model: id, ok: false, error: why, latencyMs: Date.now() - t0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
            attempt();
          };
          pt.on("data", c => {
            captureUsage(c, m, key);
            if (!saw) {
              const txt = c.toString("utf8");
              if (/"content"\s*:\s*"(?:\\.|[^"\\])+/.test(txt) || /"tool_calls"/.test(txt)) {
                saw = true;
              } else if (/"finish_reason"\s*:\s*"/.test(txt)) {
                try { upRes.destroy(); } catch {}
                return failEmpty("empty stream (no content)");
              } else {
                held.push(c);
                heldBytes += c.length;
                const holdMs = Math.min(UPSTREAM_TIMEOUT_MS, parseInt(process.env.MODELHUB_STREAM_HOLD_MS || "8000", 10));
                if (heldBytes > 65536 || Date.now() - t0 > holdMs) {
                  try { upRes.destroy(); } catch {}
                  return failEmpty("empty stream (hold limit)");
                }
                return;
              }
            }
            if (!clientStarted) {
              clientStarted = true;
              firstAt = Date.now();
              const ttft = firstAt - t0;
              m.lastTTFTMs = ttft;
              m.avgTTFTMs = m.avgTTFTMs ? Math.round((m.avgTTFTMs * 3 + ttft) / 4) : ttft;
              try { res.setHeader("x-modelhub-model", id); res.setHeader("x-modelhub-profile", String(parsed.model || "")); } catch {}
              try { res.writeHead(upRes.statusCode, upRes.headers); } catch {}
              for (const h of held) res.write(h);
              held = [];
            }
            res.write(c);
          });
          pt.on("end", () => {
            giveOnce();
            if (stale()) return;
            if (!clientStarted) { failEmpty("empty stream"); return; }
            recordRequest({
              proto: "stream:openai", reqModel: parsed.model, model: id, ok: true, error: "",
              latencyMs: Date.now() - t0, ttftMs: firstAt ? firstAt - t0 : null,
              promptTok: 0, completionTok: 0, totalTok: 0, cost: null, cached: false
            });
            safeEnd();
          });
          pt.on("close", () => { giveOnce(); if (!stale() && clientStarted && !chainClosed) safeEnd(); });
          return;
        });
        req.on("error", (e) => {
          giveOnce();
          if (stale()) return;
          if (clientStarted || chainClosed) { safeEnd(); return; }
          markFail(m, e.message, null);
          recordRequest({ proto: "stream:openai", reqModel: parsed.model, model: id, ok: false, error: String(e.message || e).slice(0, 120), latencyMs: Date.now() - t0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
          attempt();
        });
        req.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
          giveOnce();
          req.destroy(new Error("timeout"));
          if (stale()) return;
          if (clientStarted || chainClosed) { safeEnd(); return; }
          markFail(m, "timeout", null);
          recordRequest({ proto: "stream:openai", reqModel: parsed.model, model: id, ok: false, error: "timeout", latencyMs: Date.now() - t0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
          attempt();
        });
        req.write(reqBody);
        req.end();
        return;
      };
      attempt();
      return;
    }

    // OpenAI non-streaming
    if (req.method === "POST" && url.includes("chat/completions") && parsedChat) {
      const r = await postWithFailover(parsedChat, keyIdFor(req));
      if (r.ok) {
        res.setHeader("Content-Type", "application/json");
        if (r.data && r.data.model) { try { res.setHeader("x-modelhub-model", String(r.data.model)); } catch {} }
        try { res.setHeader("x-modelhub-profile", String(resolveProfile(parsedChat.model, parsedChat.messages) || parsedChat.model || "")); } catch {}
        res.end(JSON.stringify(r.data));
        return;
      }
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: r.error }));
      return;
    }

    // Embeddings (OpenAI-compatible con failover)
    if (req.method === "POST" && url.endsWith("/embeddings")) {
      const parsed = await readBody(req);
      if (!parsed || !parsed.model) { res.writeHead(400); return res.end("missing model"); }
      const profile = resolveProfile(parsed.model, parsed.messages);
      const candidates = selectCandidates(parsed.model, profile).slice(0, 3);
      for (const id of candidates) {
        const m = modelMap.get(id);
        if (!m || !m.enabled) continue;
        const out = await embeddingsForward(m, parsed);
        if (out.ok) {
          recordRequest({ proto: "embeddings", reqModel: parsed.model, model: id, ok: true, error: "", latencyMs: out.latencyMs, ttftMs: null, promptTok: out.promptTok || 0, completionTok: 0, totalTok: out.totalTok || 0, cost: computeCost(m, out.promptTok || 0, 0), cached: false });
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify(out.data));
        }
      }
      recordRequest({ proto: "embeddings", reqModel: parsed.model, model: null, ok: false, error: "all upstreams failed", latencyMs: 0, ttftMs: null, promptTok: 0, completionTok: 0, totalTok: 0, cost: 0, cached: false });
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "no embedding upstream succeeded" }));
    }

    // Anthropic
    if (req.method === "POST" && url === "/v1/messages") {
      const body = await readBody(req);
      if (body.stream === true) {
        const oai = anthropicToOpenAI(body);
        return streamWithFailover(oai, res, "anthropic");
      }
      const oai = anthropicToOpenAI(body);
      const r = await postWithFailover(oai);
      if (r.ok) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(openAIToAnthropic(r.data, body.model)));
        return;
      }
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: r.error }));
      return;
    }

    // Gemini OpenAI-compatible (includes /v1beta/openai/chat/completions)
    if (req.method === "POST" && url.includes("/v1beta/openai")) {
      let body = "";
      for await (const c of req) body += c;
      let parsed;
      try { parsed = JSON.parse(body || "{}"); } catch { parsed = {}; }
      const streaming = parsed.stream === true;
      if (streaming) {
        return streamWithFailover(parsed, res, "gemini");
      }
      const r = await postWithFailover(parsed);
      if (r.ok) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(r.data));
        return;
      }
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: r.error }));
      return;
    }

    // Gemini native
    const gm = url.match(/^\/v1beta\/models\/(.+):generateContent$/);
    if (req.method === "POST" && gm) {
      const body = await readBody(req);
      const oai = geminiGenerateToOpenAI(gm[1], body);
      const streaming = body.generationConfig && body.generationConfig.stream === true;
      if (streaming) {
        return streamWithFailover(oai, res, "gemini");
      }
      const r = await postWithFailover(oai);
      if (r.ok) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(openAIToGemini(r.data)));
        return;
      }
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: r.error }));
      return;
    }

    // Ollama
    if (req.method === "POST" && url === "/api/chat") {
      const body = await readBody(req);
      const oai = ollamaChatToOpenAI(body);
      if (body.stream === true) {
        return streamWithFailover(oai, res, "ollama");
      }
      const r = await postWithFailover(oai);
      if (r.ok) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(openAIToOllama(r.data, body.model)));
        return;
      }
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: r.error }));
      return;
    }
    if (req.method === "GET" && url === "/api/tags") {
      const names = models.filter(m => m.enabled).map(m => m.id);
      for (const p of Object.keys(prefs.profiles)) names.push(p);
      return sendJSON(res, 200, { models: names.map(n => ({ name: n, model: n })) });
    }
    if (req.method === "POST" && url === "/api/show") {
      const body = await readBody(req);
      const m = modelMap.get(body.name) || models.find(x => x.name === body.name);
      return sendJSON(res, 200, { name: body.name, details: { family: m ? m.provider : "?", parameter_size: "?" } });
    }

    res.writeHead(404);
    res.end("not found");
  } catch (e) {
    log("handler error: " + e.message);
    if (!res.headersSent) { res.writeHead(500); }
    res.end(JSON.stringify({ error: e.message }));
  }
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function cliProviders() {
  for (const p of config.providers) {
    console.log(`[${p.name}] ${p.label} ${p.needsKey ? "(chiave: " + (p.authId || "s????") + ")" : "(keyless)"} ${p.baseURL}`);
    for (const m of (p.models || [])) {
      const entry = modelMap.get(`${p.name}/${m.name}`);
      const enabled = !!(entry && entry.enabled);
      const knownFree = !!m.free;
      console.log(`  - ${m.name} free:${knownFree} enabled:${enabled}`);
    }
  }
}
async function cliCheck() {
  rebuildModels();
  const targets = models.filter(m => m.enabled);
  console.log(`provo ${targets.length} modelli enabled...`);
  await probeAll(targets);
  console.log("\nrisultato:");
  for (const m of models) {
    const ok = !m.failUntil || m.failUntil <= Date.now();
    const paid = !m.free;
    console.log(`  ${m.id} free:${m.free} enabled:${m.enabled} healthy:${ok} lastError:"${m.lastError}"`);
  }
}
async function cliTest(modelId, prompt) {
  rebuildModels();
  const openaiBody = {
    model: modelId,
    messages: [{ role: "user", content: prompt || "ping" }],
    max_tokens: 100,
    stream: false
  };
  const r = await postWithFailover(openaiBody);
  if (r.ok) {
    console.log(JSON.stringify(r.data, null, 2));
  } else {
    console.log("errore:", r.error);
  }
}
async function probeAll(targets) {
  if (!targets || !targets.length) {
    targets = models.filter(m => m.enabled);
  }
  const promises = targets.map(m => probeOne(m, true));
  await Promise.allSettled(promises);
  rebuildProfiles();
}
async function probeOne(m, gentle = false) {
  const body = JSON.stringify({ model: m.name, messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false });
  const t0 = Date.now();
  const u = new URL(m.baseURL);
  const transport = u.protocol === "https:" ? https : http;
  await acquireSlot(m.provider);
  const softFail = (msg) => {
    if (gentle) {
      m.lastFailAt = Date.now();
      m.failUntil = Date.now() + 120000;
      m.lastError = String(msg).slice(0, 200);
    } else {
      markFail(m, String(msg).slice(0, 200), null);
    }
  };
  try {
    return await new Promise((resolve) => {
    const req = transport.request({
      agent: upstreamAgent(u),
      method: "POST",
      hostname: u.hostname, port: u.port || undefined,
      path: u.pathname + (u.search || ""),
      headers: { "Content-Type": "application/json", "Authorization": m.key ? `Bearer ${m.key}` : "", "Content-Length": Buffer.byteLength(body) }
    }, (upRes) => {
      if (!upRes.statusCode || upRes.statusCode < 200 || upRes.statusCode >= 300) {
        let b = "";
        upRes.on("data", d => b += d);
        upRes.on("end", () => {
          const ra = parseRetryAfter(upRes, b);
          const code = upRes.statusCode;
          if (code === 429) softFail(`HTTP 429`);
          else if (/402|403/.test(String(code))) { m.free = false; m.enabled = false; softFail(`HTTP ${code} (paid)`); }
          else if (code === 401) softFail(`HTTP 401 (key?)`);
          else softFail(`HTTP ${code} ${b.slice(0, 120)}`);
          m.lastVerifiedAt = Date.now();
          m.verified = false;
        });
      } else {
        markOk(m);
        m.lastLatencyMs = Date.now() - t0;
        bumpRequest(m);
        m.lastVerifiedAt = Date.now();
        m.verified = true;
      }
      resolve();
    });
    req.on("error", e => { softFail(e.message); m.lastVerifiedAt = Date.now(); m.verified = false; resolve(); });
    req.setTimeout(UPSTREAM_TIMEOUT_NONSTREAM_MS, () => { req.destroy(new Error("timeout")); softFail("timeout"); m.lastVerifiedAt = Date.now(); m.verified = false; resolve(); });
    req.write(body);
    req.end();
    });
  } finally { releaseSlot(m.provider); }
}

let verifying = false;
async function verifyHeads() {
  if (verifying) return;
  verifying = true;
  try {
    const K = Math.max(3, settingsCfg().verifyTopK);
    const ids = [];
    for (const prof of ["auto", "auto-code", "auto-reasoning", "auto-fast", "free-pool"]) {
      const arr = prefs.profiles[prof] || [];
      for (const id of arr.slice(0, K)) {
        const m = modelMap.get(id);
        if (m && m.enabled && isChatModel(id) && !ids.includes(id)) ids.push(id);
      }
    }
    // Aggiunge TUTTI i modelli abilitati (free e paid) così i test di verifica
    // scoprono nuovi modelli free anche fuori dai profili. I paid verranno
    // scartati da prunePaidModels() dopo i test.
    for (const m of models) {
      if (m.enabled && isChatModel(m.id) && !ids.includes(m.id)) ids.push(m.id);
    }
    const pool = Math.max(2, PROV_CONCURRENCY);
    let i = 0;
    await Promise.all(Array.from({ length: pool }, async () => {
      while (i < ids.length) {
        const m = modelMap.get(ids[i++]);
        if (!m) continue;
        m.halfOpen = true;
        try { await probeOne(m, true); } finally { m.halfOpen = false; }
      }
    }));
    rebuildProfiles();
    log(`verify heads: ${ids.length} modelli verificati realmente`);
  } finally { verifying = false; }
}
function startProfileRefresher() {
  setTimeout(() => { if (process.env.MODELHUB_VERIFY !== "0") verifyHeads(); }, 90000);
  const tick = () => {
    rebuildProfiles();
    if (process.env.MODELHUB_VERIFY !== "0") verifyHeads().then(() => prunePaidModels());
    else prunePaidModels();
    setTimeout(tick, Math.max(30000, settingsCfg().verifyMs));
  };
  setTimeout(tick, Math.max(30000, settingsCfg().verifyMs));
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  rebuildModels();

  // CLI mode: don't start HTTP server
  if (process.argv[2] === "providers") {
    cliProviders();
    process.exit(0);
  }
  if (process.argv[2] === "check") {
    probeAll().then(() => {
      for (const m of models) {
        const ok = !m.failUntil || m.failUntil <= Date.now();
        console.log(`${m.id} free:${m.free} enabled:${m.enabled} healthy:${ok} lastError:"${m.lastError}"`);
      }
    }).catch(err => { console.error(err.message); process.exit(1); });
    return;
  }
  if (process.argv[2] === "test" && process.argv[3]) {
    cliTest(process.argv[3], process.argv[4]).then(() => process.exit(0)).catch(err => { console.error(err.message); process.exit(1); });
    return;
  }
  if (process.argv[2] === "probe" && process.argv[3]) {
    const id = process.argv[3];
    const m = modelMap.get(id) || models.find(x => x.id === id);
    if (!m) { console.error("modello non trovato"); process.exit(1); }
    await probeOne(m);
    console.log(`${m.id} free:${m.free} enabled:${m.enabled} healthy:${!m.failUntil || m.failUntil <= Date.now()} lastError:"${m.lastError}"`);
    process.exit(0);
    return;
  }

  startHub();
}

function startBackgroundProber() {
  let backgroundProbing = false;
  setInterval(() => {
    const now = Date.now();
    for (const m of models) {
      if (m.failUntil && m.failUntil <= now) { m.failUntil = 0; }
    }
    if (!autoProbeOn || backgroundProbing) return;
    const due = models.filter(m => m.enabled && !m.halfOpen && m.fails > 0 && m.failUntil <= now);
    if (!due.length) return;
    backgroundProbing = true;
    const batch = due.slice(0, 6);
    Promise.allSettled(batch.map(async m => {
      m.halfOpen = true;
      try { await probeOne(m); } finally { m.halfOpen = false; }
    })).then(() => { backgroundProbing = false; });
  }, 60000);
}

function startHub() {
  rebuildModels();
  if (authWasPlain && !ENV_PLAIN) {
    writeAuth(auth);
    authWasPlain = false;
    log("auth.json migrated to encrypted format");
  }
  // enable semantic cache only when explicitly configured (default off)
  semOn = !!(semCfg().enabled && semCfg().embedder);
  log(`semantic cache ${semOn ? "enabled" : "disabled"} (embedder: ${semCfg().embedder || "none"})`);
  const listen = () => {
    server.listen(PORT, "127.0.0.1", () => log(`ModelHub listening on ${PORT}`));
    startBackgroundProber();
    startProfileRefresher();
  };
  if (featuresCfg().autoProbe) {
    log("startup verify: testing profile heads...");
    verifyHeads().then(() => {
      log("startup verify done");
      prunePaidModels();
      listen();
    }).catch(err => {
      log("startup verify error: " + err.message);
      prunePaidModels();
      listen();
    });
  } else {
    prunePaidModels();
    listen();
  }
}

if (require.main === module) main();

module.exports = {
  escCh, classify, parseRetryAfter,
  anthropicToOpenAI, openAIToAnthropic, geminiGenerateToOpenAI, openAIToGemini,
  ollamaChatToOpenAI, openAIToOllama,
  encryptAuth, decryptAuth, looksLikeAuth,
  priceFor, computeCost, effectivePrice, cascadeValid, deriveEndpoint,
  strategyFor, applyStrategy, selectCandidates, postWithFailover, controlAuthorized, gatewayAuthorized, startHub,
  genKey, mintKey, rateLimited,
  __setState(state = {}) {
    if (Array.isArray(state.models)) { models = state.models; modelMap = new Map(state.models.map(m => [m.id, m])); }
    if (state.prefs) prefs = state.prefs;
    if (state.config) config = state.config;
    if (state.pricing) pricing = state.pricing;
  }
};
