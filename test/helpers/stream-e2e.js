const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const HUB_PORT = 18997;

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-e2e-"));

  const up = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write("data: " + JSON.stringify({ choices: [{ delta: { content: "HELLO" } }] }) + "\n\n");
    res.end("data: [DONE]\n\n");
  });
  await new Promise(r => up.listen(0, "127.0.0.1", r));
  const upPort = up.address().port;

  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({
    providers: [{
      name: "mockup", label: "Mock", baseURL: "http://127.0.0.1:" + upPort + "/v1",
      models: [{ name: "mock-1", free: true }], authId: null
    }]
  }));
  fs.writeFileSync(path.join(dir, "prefs.json"), JSON.stringify({
    strategy: { auto: "order" },
    profiles: { auto: ["mockup/mock-1"] },
    features: { autoProbe: false, cache: false },
    enhancer: { enabled: false }
  }));

  process.env.MODELHUB_DIR = dir;
  process.env.MODELHUB_PORT = String(HUB_PORT);
  const hubPath = path.join(__dirname, "..", "..", "server.js");
  require(hubPath).startHub();

  let body = "";
  let lastErr = "";
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch("http://127.0.0.1:" + HUB_PORT + "/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "auto", stream: true, messages: [{ role: "user", content: "hi" }] })
      });
      if (res.status !== 200) throw new Error("status " + res.status);
      body = await res.text();
      break;
    } catch (e) { lastErr = String(e.message || e); await new Promise(r => setTimeout(r, 250)); }
  }
  up.close();
  await new Promise(r => setTimeout(r, 200));

  if (!body.includes("[DONE]")) { console.error("stream-e2e FAIL no DONE marker; lastErr=" + lastErr); process.exit(1); }
  if (!body.includes("HELLO")) { console.error("stream-e2e FAIL no content"); process.exit(1); }
  console.log("stream-e2e OK");
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
