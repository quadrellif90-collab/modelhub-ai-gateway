// Aggiunge i provider free-tier mancanti a config.json (repo + AppData)
const fs = require("fs");

// Definizione provider con modelli free-tier documentati
const NEW_PROVIDERS = [
  {
    name: "deepinfra", label: "DeepInfra", baseURL: "https://api.deepinfra.com/v1",
    authId: "deepinfra", needsKey: true,
    models: [
      { name: "meta-llama/Llama-3.3-70B-Instruct", free: true, contextLength: 131072, architecture: "llama", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "meta-llama/Llama-3.1-8B-Instruct", free: true, contextLength: 131072, architecture: "llama", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "Qwen/Qwen2.5-72B-Instruct", free: true, contextLength: 131072, architecture: "qwen", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "Qwen/Qwen2.5-7B-Instruct", free: true, contextLength: 32768, architecture: "qwen", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "mistralai/Mistral-7B-Instruct-v0.3", free: true, contextLength: 32768, architecture: "mistral", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "deepseek-ai/DeepSeek-V3", free: true, contextLength: 131072, architecture: "deepseek", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "deepseek-ai/DeepSeek-R1", free: true, contextLength: 131072, architecture: "deepseek", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "google/gemma-2-9b-it", free: true, contextLength: 8192, architecture: "gemma", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
    ],
  },
  {
    name: "lepton", label: "Lepton AI", baseURL: "https://api.lepton.ai/v1",
    authId: "lepton", needsKey: true,
    models: [
      { name: "llama3-70b", free: true, contextLength: 8192, architecture: "llama", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "llama3-8b", free: true, contextLength: 8192, architecture: "llama", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "mixtral-8x7b", free: true, contextLength: 32768, architecture: "mixtral", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "mistral-7b", free: true, contextLength: 32768, architecture: "mistral", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "gemma-7b", free: true, contextLength: 8192, architecture: "gemma", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
    ],
  },
  {
    name: "scaleway", label: "Scaleway", baseURL: "https://api.scaleway.ai/v1",
    authId: "scaleway", needsKey: true,
    models: [
      { name: "deepseek-r1-distill-llama-70b", free: true, contextLength: 131072, architecture: "deepseek", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "llama-3.1-8b-instruct", free: true, contextLength: 131072, architecture: "llama", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
      { name: "mistral-nemo", free: true, contextLength: 128000, architecture: "mistral", modalities: ["text"], freeLimit: "free tier", updatedAt: "2025-01-15" },
    ],
  },
  {
    name: "lambdalabs", label: "Lambda Labs", baseURL: "https://api.lambdalabs.com/v1",
    authId: "lambdalabs", needsKey: true,
    models: [
      { name: "llama3.1-8b-instruct", free: false, contextLength: 131072, architecture: "llama", modalities: ["text"] },
      { name: "llama3.1-70b-instruct", free: false, contextLength: 131072, architecture: "llama", modalities: ["text"] },
      { name: "hermes-3-llama-3.1-8b", free: false, contextLength: 131072, architecture: "llama", modalities: ["text"] },
    ],
  },
  {
    name: "nanogpt", label: "NanoGPT", baseURL: "https://nano-gpt.com/api/v1",
    authId: "nanogpt", needsKey: true,
    models: [
      { name: "gpt-4o-mini", free: false, contextLength: 128000, architecture: "gpt", modalities: ["text"] },
      { name: "claude-3-5-haiku", free: false, contextLength: 200000, architecture: "claude", modalities: ["text"] },
      { name: "llama-3.1-70b", free: false, contextLength: 131072, architecture: "llama", modalities: ["text"] },
    ],
  },
  {
    name: "replicate", label: "Replicate", baseURL: "https://api.replicate.com/v1",
    authId: "replicate", needsKey: true,
    models: [
      { name: "meta/meta-llama-3-70b-instruct", free: false, contextLength: 8192, architecture: "llama", modalities: ["text"] },
      { name: "mistralai/mistral-7b-instruct-v0.3", free: false, contextLength: 32768, architecture: "mistral", modalities: ["text"] },
      { name: "google-deepmind/gemma-7b", free: false, contextLength: 8192, architecture: "gemma", modalities: ["text"] },
    ],
  },
];

function addTo(configPath) {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  let added = 0;
  for (const p of NEW_PROVIDERS) {
    if (!cfg.providers.find(x => x.name === p.name)) {
      // assicura pricing 0 per i free
      p.models.forEach(m => { if (m.free && !m.pricing) m.pricing = { prompt: 0, completion: 0, currency: "USD" }; });
      cfg.providers.push(p);
      added++;
    }
  }
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  console.log(`${configPath}: +${added} provider`);
}

const paths = [
  "config.json",
  "C:/Users/Siviglino/AppData/Local/ModelHub/config.json",
];
for (const p of paths) {
  try { addTo(p); } catch (e) { console.log(`SKIP ${p}: ${e.message}`); }
}
