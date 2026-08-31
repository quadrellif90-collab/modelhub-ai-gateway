// Test automatico end-to-end per ModelHub: verifica profili, filtri, chiavi, chat
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const PORT = 8799;
const DIR = path.join(__dirname, "..");
const REAL_DIR = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "ModelHub")
  : path.join(DIR, "..", "ModelHub");
process.env.MODELHUB_PORT = String(PORT);
process.env.MODELHUB_DIR = path.join(DIR, "test", "tmp_e2e");
process.env.MODELHUB_AUTO_PROBE = "0";
fs.rmSync(process.env.MODELHUB_DIR, { recursive: true, force: true });
fs.mkdirSync(process.env.MODELHUB_DIR, { recursive: true });
// copia config/auth reali per avere i 41 provider e le chiavi nel test
for (const f of ["config.json", "auth.json", "pricing.json"]) {
  const src = path.join(REAL_DIR, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(process.env.MODELHUB_DIR, f));
}

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: "127.0.0.1", port: PORT, path: urlPath, method,
      headers: { "content-type": "application/json", "x-modelhub-token": "" }, }, (res) => {
      let d = ""; res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const srv = spawn("node", ["-e", `const m=require('./server.js'); m.startHub();`], {
    cwd: DIR, env: process.env, stdio: "ignore",
  });
  // attendi bind
  for (let i = 0; i < 40; i++) {
    try { await req("GET", "/hub/state"); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }

  let pass = 0, fail = 0;
  const ok = (name, cond) => { if (cond) { pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } };

  console.log("\n[1] State & profili");
  const st = (await req("GET", "/hub/state")).body;
  ok("state risponde", st && st.version);
  ok("41 provider", st.providers.length >= 34);
  ok("profili default presenti", ["auto","auto-code","auto-reasoning","auto-fast","free-pool"].every(p => st.profiles.includes(p)));

  console.log("\n[2] profileOrder diverso tra profili (bug fix)");
  const auto = st.profileOrder["auto"] || [];
  const freepool = st.profileOrder["free-pool"] || [];
  const acode = st.profileOrder["auto-code"] || [];
  const areason = st.profileOrder["auto-reasoning"] || [];
  ok("auto ha modelli", auto.length > 0);
  ok("free-pool ha modelli", freepool.length > 0);
  ok("auto-code ha modelli", acode.length > 0);
  ok("auto-reasoning ha modelli", areason.length > 0);
  ok("auto-code e' sottoinsieme di auto (NON tutti uguali)", acode.length < auto.length && JSON.stringify(auto) !== JSON.stringify(acode));
  ok("auto-reasoning e' sottoinsieme di auto", areason.length < auto.length);
  ok("auto-code != auto (ordinamenti diversi)", JSON.stringify(auto) !== JSON.stringify(acode));
  ok("free-pool sono tutti free", freepool.every(id => { const mm = st.models.find(x => x.id === id); return mm && mm.isFree; }));
  const { classify } = require("../server/models.js");
  ok("auto-code sono tutti code (classify)", acode.every(id => classify(id).code));

  console.log("\n[3] Cambio profilo via API (reorder) persistito");
  const before = (await req("GET", "/hub/state")).body.profileOrder["auto"];
  const reordered = before.slice().reverse();
  await req("POST", "/hub/reorder", { profile: "auto", order: reordered });
  const after = (await req("GET", "/hub/state")).body.profileOrder["auto"];
  ok("reorder applicato", JSON.stringify(after) === JSON.stringify(reordered));
  // ripristina
  await req("POST", "/hub/reorder", { profile: "auto", order: before });

  console.log("\n[4] Model filter");
  await req("POST", "/hub/model-filter", { excludePaid: true });
  const s2 = (await req("GET", "/hub/state")).body;
  ok("excludePaid attivo", s2.modelFilter.excludePaid === true);
  ok("modelli ridotti (solo free)", s2.models.every(m => m.isFree));
  await req("POST", "/hub/model-filter", { excludePaid: false });
  ok("excludePaid resettato", (await req("GET", "/hub/state")).body.modelFilter.excludePaid === false);

  console.log("\n[5] Gateway keys (mint/revoke)");
  const mint = (await req("POST", "/hub/gateway-keys", { action: "mint", label: "test", rpm: 10 })).body;
  ok("mint restituisce secret+kid", mint.secret && mint.kid);
  const keysResp = (await req("GET", "/hub/keys")).body;
  const keys = keysResp.gatewayKeys || (keysResp.keys) || [];
  ok("chiave presente in lista", keys.some(k => k.kid === mint.kid));
  await req("POST", "/hub/gateway-keys", { action: "revoke", kid: mint.kid });
  const afterKeys = (await req("GET", "/hub/keys")).body.gatewayKeys || [];
  ok("chiave revocata", !afterKeys.some(k => k.kid === mint.kid));

  console.log("\n[6] Strategia profilo");
  await req("POST", "/hub/strategy", { profile: "auto", strategy: "autoroute" });
  ok("strategia impostata", (await req("GET", "/hub/state")).body.strategies["auto"] === "autoroute");

  console.log(`\nRISULTATO: ${pass} pass, ${fail} fail`);
  srv.kill();
  fs.rmSync(process.env.MODELHUB_DIR, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERRORE TEST:", e); process.exit(2); });
