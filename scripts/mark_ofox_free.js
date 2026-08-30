// Marca i modelli Ofox free-tier come free:true in config.json (AppData)
const fs = require("fs");
const path = require("path");
const CONFIG = "C:/Users/Siviglino/AppData/Local/ModelHub/config.json";
const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const prov = cfg.providers.find(p => p.name === "ofox");
if (!prov) { console.log("ofox non trovato"); process.exit(1); }

// Pattern free-tier Ofox (modelli esposti gratuitamente):
// - Qwen / Qwen3.x / bailian/qwen*
// - GLM / z-ai/glm*
// - DeepSeek-V4-Flash / deepseek/deepseek-v4-flash*
// - Kimi / moonshotai/kimi*
// - MiniMax / minimax/minimax-m2.5-lightning, minimax-m3, m2.1-lightning
// - Gemini Flash Lite / google/gemini-*-flash-lite, gemini-3.5-flash
// - GPT mini/nano / openai/gpt-*-mini, gpt-*-nano, gpt-5.1-codex-mini
// - Doubao seed lite/mini / volcengine/doubao-seed-*-lite, *-mini
const FREE_RE = /(qwen|glm|deepseek-v4-flash|kimi|minimax-m2\.5-lightning|minimax-m3|minimax-m2\.1-lightning|gemini-.*flash-lite|gemini-3\.5-flash|gpt-.*-mini|gpt-.*-nano|doubao-seed-.*-lite|doubao-seed-.*-mini)/i;

let marked = 0;
for (const m of prov.models) {
  if (FREE_RE.test(m.name)) {
    if (m.free !== true) { m.free = true; marked++; }
    if (!m.isFree) m.isFree = true;
    if (!m.freeLimit) m.freeLimit = "Ofox free tier";
    if (!m.updatedAt) m.updatedAt = "2025-01-15";
    if (!m.pricing) m.pricing = { prompt: 0, completion: 0, currency: "USD" };
  }
}
fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
console.log(`Ofox: ${marked} modelli marcati free (totale free ora: ${prov.models.filter(m=>m.free).length}/${prov.models.length})`);
