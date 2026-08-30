// Arricchisce i modelli free di config.json con metadati (contextLength, architecture, modalities, updatedAt, freeLimit, pricing)
const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "..", "config.json");
const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));

// Metadati noti per modello (chiave: "provider/name" oppure solo "name" se univoco per provider)
// freeLimit è una descrizione testuale del piano gratuito del provider
const META = {
  // GROQ
  "groq": {
    "llama-3.3-70b-versatile": { contextLength: 128000, architecture: "llama", modalities: ["text"] },
    "llama-3.1-70b-versatile": { contextLength: 128000, architecture: "llama", modalities: ["text"] },
    "llama-3.1-8b-instant": { contextLength: 128000, architecture: "llama", modalities: ["text"] },
    "mixtral-8x7b-32768": { contextLength: 32768, architecture: "mixtral", modalities: ["text"] },
    "gemma2-9b-it": { contextLength: 8192, architecture: "gemma", modalities: ["text"] },
    "openai/gpt-oss-120b": { contextLength: 128000, architecture: "gpt-oss", modalities: ["text"] },
    "openai/gpt-oss-20b": { contextLength: 128000, architecture: "gpt-oss", modalities: ["text"] },
    "qwen/qwen3.6-27b": { contextLength: 32768, architecture: "qwen", modalities: ["text"] }
  },
  // TOGETHER AI
  "together": {
    "meta-llama/Llama-3.3-70B-Instruct-Turbo": { contextLength: 128000, architecture: "llama", modalities: ["text"] },
    "mistralai/Mixtral-8x7B-Instruct-v0.1": { contextLength: 32768, architecture: "mixtral", modalities: ["text"] },
    "codestral-22b": { contextLength: 32768, architecture: "codestral", modalities: ["text"] },
    "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo": { contextLength: 128000, architecture: "llama", modalities: ["text", "vision"] }
  },
  // FIREWORKS
  "fireworks": {
    "accounts/fireworks/models/llama-v3p1-70b-instruct": { contextLength: 128000, architecture: "llama", modalities: ["text"] },
    "accounts/fireworks/models/llama-v3p1-8b-instruct": { contextLength: 128000, architecture: "llama", modalities: ["text"] },
    "accounts/fireworks/models/mixtral-8x7b-instruct": { contextLength: 32768, architecture: "mixtral", modalities: ["text"] },
    "deepseek-coder-v2": { contextLength: 128000, architecture: "deepseek", modalities: ["text"] }
  },
  // LEPTON AI
  "lepton": {
    "llama-3.3-70b": { contextLength: 128000, architecture: "llama", modalities: ["text"] },
    "mixtral-8x7b": { contextLength: 32768, architecture: "mixtral", modalities: ["text"] }
  },
  // COHERE
  "cohere": {
    "command-r-plus": { contextLength: 128000, architecture: "command", modalities: ["text"] },
    "command-r": { contextLength: 128000, architecture: "command", modalities: ["text"] }
  },
  // PERPLEXITY
  "perplexity": {
    "llama-3.1-sonar-small-128k-online": { contextLength: 128000, architecture: "llama", modalities: ["text"] },
    "llama-3.1-sonar-large-128k-online": { contextLength: 128000, architecture: "llama", modalities: ["text"] },
    "mixtral-8x7b-instruct": { contextLength: 128000, architecture: "mixtral", modalities: ["text"] }
  },
  // OPENROUTER (free)
  "openrouter": {
    "meta-llama/llama-3.1-70b-instruct:free": { contextLength: 128000, architecture: "llama", modalities: ["text"] },
    "google/gemini-2.0-flash-exp:free": { contextLength: 1000000, architecture: "gemini", modalities: ["text", "vision"] },
    "microsoft/phi-3-mini-128k-instruct:free": { contextLength: 128000, architecture: "phi", modalities: ["text"] }
  },
  // GEMINI (free tier)
  "google": {
    "gemini-1.5-flash": { contextLength: 1000000, architecture: "gemini", modalities: ["text", "vision"] },
    "gemini-1.5-flash-8b": { contextLength: 1000000, architecture: "gemini", modalities: ["text", "vision"] },
    "gemini-2.0-flash": { contextLength: 1000000, architecture: "gemini", modalities: ["text", "vision"] },
    "gemini-2.0-flash-lite": { contextLength: 1000000, architecture: "gemini", modalities: ["text"] }
  },
  // ANTHROPIC (free tier limitato)
  "claude": {
    "claude-3-haiku-20240307": { contextLength: 200000, architecture: "claude", modalities: ["text", "vision"] },
    "claude-3-5-haiku-20241022": { contextLength: 200000, architecture: "claude", modalities: ["text", "vision"] }
  },
  // OPENAI (low-cost free tier)
  "openai": {
    "gpt-4o-mini": { contextLength: 128000, architecture: "gpt", modalities: ["text", "vision"] },
    "gpt-4o-mini-2024-07-18": { contextLength: 128000, architecture: "gpt", modalities: ["text", "vision"] }
  },
  // KILOCODE (free models)
  "kilocode": {
    "tencent/hy3:free": { contextLength: 128000, architecture: "hy3", modalities: ["text"] },
    "cohere/north-mini-code:free": { contextLength: 128000, architecture: "command", modalities: ["text"] },
    "nvidia/nemotron-3-ultra-550b-a55b:free": { contextLength: 128000, architecture: "nemotron", modalities: ["text"] }
  },
  // FREE LLM POOL (provider italiano)
  "free-llm-gateway": {
    "auto": { contextLength: 128000, architecture: "mixed", modalities: ["text"] }
  },
  // FREELLM POOL
  "freellmpool": {
    "auto": { contextLength: 128000, architecture: "mixed", modalities: ["text"] }
  }
};

const UPDATED_AT = "2025-01-15";
let enriched = 0, total = 0;

for (const p of cfg.providers) {
  const metaProv = META[p.name] || {};
  if (!p.models) continue;
  for (const m of p.models) {
    total++;
    const isFree = m.free === true || p.needsKey === false;
    const key = `${p.name}/${m.name}`;
    const meta = metaProv[m.name] || {};
    // Applica metadati se modello free
    if (isFree) {
      if (meta.contextLength) m.contextLength = meta.contextLength;
      if (meta.architecture) m.architecture = meta.architecture;
      if (meta.modalities) m.modalities = meta.modalities;
      m.isFree = true;
      m.updatedAt = UPDATED_AT;
      m.freeLimit = m.freeLimit || `${p.label || p.name} free tier`;
      m.pricing = { prompt: 0, completion: 0, currency: "USD" };
      enriched++;
    } else {
      m.isFree = false;
      m.pricing = m.pricing || { prompt: 1, completion: 2, currency: "USD" };
    }
  }
}

fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
console.log(`Arricchiti ${enriched}/${total} modelli free in config.json`);
