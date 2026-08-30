// Aggiunge modelli free comuni se non già presenti, con metadati completi
const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "..", "config.json");
const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));

// Nuovi modelli free da aggiungere per provider (solo se mancanti)
const ADD = {
  groq: [
    { name: "llama-3.3-70b-versatile", free: true, contextLength: 128000, architecture: "llama", modalities: ["text"], isFree: true, updatedAt: "2025-01-15", freeLimit: "Groq free tier: 60 req/min", pricing: { prompt: 0, completion: 0, currency: "USD" } },
    { name: "llama-3.1-70b-versatile", free: true, contextLength: 128000, architecture: "llama", modalities: ["text"], isFree: true, updatedAt: "2025-01-15", freeLimit: "Groq free tier: 60 req/min", pricing: { prompt: 0, completion: 0, currency: "USD" } },
    { name: "mixtral-8x7b-32768", free: true, contextLength: 32768, architecture: "mixtral", modalities: ["text"], isFree: true, updatedAt: "2025-01-15", freeLimit: "Groq free tier: 60 req/min", pricing: { prompt: 0, completion: 0, currency: "USD" } },
    { name: "gemma2-9b-it", free: true, contextLength: 8192, architecture: "gemma", modalities: ["text"], isFree: true, updatedAt: "2025-01-15", freeLimit: "Groq free tier: 60 req/min", pricing: { prompt: 0, completion: 0, currency: "USD" } }
  ],
  together: [
    { name: "meta-llama/Llama-3.3-70B-Instruct-Turbo", free: true, contextLength: 128000, architecture: "llama", modalities: ["text"], isFree: true, updatedAt: "2025-01-15", freeLimit: "Together free tier", pricing: { prompt: 0, completion: 0, currency: "USD" } },
    { name: "mistralai/Mixtral-8x7B-Instruct-v0.1", free: true, contextLength: 32768, architecture: "mixtral", modalities: ["text"], isFree: true, updatedAt: "2025-01-15", freeLimit: "Together free tier", pricing: { prompt: 0, completion: 0, currency: "USD" } }
  ],
  fireworks: [
    { name: "accounts/fireworks/models/llama-v3p1-70b-instruct", free: true, contextLength: 128000, architecture: "llama", modalities: ["text"], isFree: true, updatedAt: "2025-01-15", freeLimit: "Fireworks free tier", pricing: { prompt: 0, completion: 0, currency: "USD" } },
    { name: "accounts/fireworks/models/mixtral-8x7b-instruct", free: true, contextLength: 32768, architecture: "mixtral", modalities: ["text"], isFree: true, updatedAt: "2025-01-15", freeLimit: "Fireworks free tier", pricing: { prompt: 0, completion: 0, currency: "USD" } }
  ],
  cohere: [
    { name: "command-r-plus", free: true, contextLength: 128000, architecture: "command", modalities: ["text"], isFree: true, updatedAt: "2025-01-15", freeLimit: "Cohere free tier", pricing: { prompt: 0, completion: 0, currency: "USD" } },
    { name: "command-r", free: true, contextLength: 128000, architecture: "command", modalities: ["text"], isFree: true, updatedAt: "2025-01-15", freeLimit: "Cohere free tier", pricing: { prompt: 0, completion: 0, currency: "USD" } }
  ],
  perplexity: [
    { name: "llama-3.1-sonar-small-128k-online", free: true, contextLength: 128000, architecture: "llama", modalities: ["text"], isFree: true, updatedAt: "2025-01-15", freeLimit: "Perplexity free tier", pricing: { prompt: 0, completion: 0, currency: "USD" } },
    { name: "llama-3.1-sonar-large-128k-online", free: true, contextLength: 128000, architecture: "llama", modalities: ["text"], isFree: true, updatedAt: "2025-01-15", freeLimit: "Perplexity free tier", pricing: { prompt: 0, completion: 0, currency: "USD" } }
  ]
};

let added = 0;
for (const p of cfg.providers) {
  const toAdd = ADD[p.name];
  if (!toAdd || !p.models) continue;
  const existing = new Set(p.models.map(m => m.name));
  for (const m of toAdd) {
    if (!existing.has(m.name)) {
      p.models.push(m);
      added++;
      console.log(`+ ${p.name}/${m.name}`);
    }
  }
}

if (added > 0) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  console.log(`\nAggiunti ${added} modelli free`);
} else {
  console.log("Nessun modello da aggiungere");
}
