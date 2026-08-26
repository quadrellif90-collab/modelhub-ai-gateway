const { test, describe } = require("node:test");
const assert = require("node:assert");
const mh = require("../server.js");

describe("escCh", () => {
  test("escapes control characters producing valid JSON strings", () => {
    const raw = 'line1\nline2 "quoted" \\back\\ tab\there\x01';
    const json = `{"text":"${mh.escCh(raw)}"}`;
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.text, raw);
  });
  test("handles empty and plain strings", () => {
    assert.strictEqual(mh.escCh(""), "");
    assert.strictEqual(mh.escCh("hello"), "hello");
    assert.strictEqual(mh.escCh(null), "null");
  });
});

describe("classify", () => {
  test("detects reasoning models", () => {
    assert.strictEqual(mh.classify("x/deepseek-v3").reasoning, true);
    assert.strictEqual(mh.classify("x/qwen-reasoner").reasoning, true);
    assert.strictEqual(mh.classify("x/llama-8b-instruct").reasoning, false);
  });
  test("detects fast models", () => {
    assert.strictEqual(mh.classify("x/llama3.1-8b-instruct").fast, true);
    assert.strictEqual(mh.classify("x/gemini-1.5-flash").fast, true);
    assert.strictEqual(mh.classify("x/super-heavy-model").fast, false);
  });
});

describe("parseRetryAfter", () => {
  const mkRes = (headers) => ({ headers });
  test("numeric seconds header", () => {
    assert.strictEqual(mh.parseRetryAfter(mkRes({ "retry-after": "5" }), "{}"), 5000);
  });
  test("http-date header", () => {
    const future = new Date(Date.now() + 10000).toUTCString();
    const v = mh.parseRetryAfter(mkRes({ "retry-after": future }), "{}");
    assert.ok(v > 0 && v <= 10000);
  });
  test("json body retry_after", () => {
    assert.strictEqual(mh.parseRetryAfter(mkRes({}), '{"retry_after":2}'), 2000);
  });
  test("returns null when absent", () => {
    assert.strictEqual(mh.parseRetryAfter(mkRes({}), "{}"), null);
  });
});

describe("protocol adapters", () => {
  test("anthropic -> openai maps system and roles", () => {
    const oai = mh.anthropicToOpenAI({
      system: "be nice",
      messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }],
      max_tokens: 55
    });
    assert.deepStrictEqual(oai.messages[0], { role: "system", content: "be nice" });
    assert.strictEqual(oai.max_tokens, 55);
    assert.strictEqual(oai.messages[1].role, "user");
  });
  test("openai -> anthropic wraps content", () => {
    const a = mh.openAIToAnthropic({ id: "x", choices: [{ message: { content: "yo" } }], usage: { prompt_tokens: 3, completion_tokens: 4 } }, "m1");
    assert.strictEqual(a.type, "message");
    assert.strictEqual(a.content[0].text, "yo");
    assert.strictEqual(a.usage.input_tokens, 3);
    assert.strictEqual(a.usage.output_tokens, 4);
  });
  test("gemini generateContent -> openai joins parts", () => {
    const oai = mh.geminiGenerateToOpenAI("gm", {
      contents: [
        { role: "user", parts: [{ text: "a" }, { text: "b" }] },
        { role: "model", parts: [{ text: "c" }] }
      ],
      generationConfig: { maxOutputTokens: 77 }
    });
    assert.strictEqual(oai.messages[0].content, "ab");
    assert.strictEqual(oai.messages[1].role, "assistant");
    assert.strictEqual(oai.max_tokens, 77);
  });
  test("openai -> gemini maps finish reasons", () => {
    const g = mh.openAIToGemini({ choices: [{ message: { content: "t" } }], usage: {} }, "length");
    assert.strictEqual(g.candidates[0].finishReason, "MAX_TOKENS");
  });
  test("ollama chat -> openai keeps messages", () => {
    const body = mh.ollamaChatToOpenAI({ model: "l", messages: [{ role: "user", content: "q" }], options: { num_predict: 9 } });
    assert.strictEqual(body.max_tokens, 9);
    assert.strictEqual(body.stream, false);
  });
  test("openai -> ollama final chunk shape", () => {
    const o = mh.openAIToOllama({ choices: [{ message: { content: "ans" } }] }, "lm");
    assert.deepStrictEqual(o, { model: "lm", message: { role: "assistant", content: "ans" }, done: true });
  });
});

describe("auth crypto", () => {
  test("encrypt/decrypt roundtrip", () => {
    process.env.MODELHUB_AUTH_KEY = "test-key-123";
    const secret = { groq: "gsk_real", openrouter: "sk-or-v1-x" };
    const enc = mh.encryptAuth(secret);
    assert.ok(enc.v === 1 && enc.iv && enc.tag && enc.cipher);
    assert.deepStrictEqual(mh.decryptAuth(enc), secret);
    delete process.env.MODELHUB_AUTH_KEY;
  });
  test("tampered ciphertext fails auth tag", () => {
    process.env.MODELHUB_AUTH_KEY = "test-key-123";
    const enc = mh.encryptAuth({ a: "b" });
    const dec = Buffer.from(enc.cipher, "base64");
    dec[0] ^= 0xff;
    enc.cipher = dec.toString("base64");
    assert.throws(() => mh.decryptAuth(enc));
    delete process.env.MODELHUB_AUTH_KEY;
  });
  test("looksLikeAuth detection", () => {
    assert.strictEqual(mh.looksLikeAuth({ groq: "key" }), true);
    assert.strictEqual(mh.looksLikeAuth({ v: 1, iv: "i", cipher: "c" }), true);
    assert.strictEqual(mh.looksLikeAuth({ enabled: {}, profiles: {} }), false);
    assert.strictEqual(mh.looksLikeAuth(null), false);
  });
});

describe("pricing & cost", () => {
  test("priceFor falls back provider -> zero", () => {
    mh.__setState({ pricing: { currency: "USD", providers: { openai: { input: 2, output: 10 } }, models: { "groq/custom": { input: 1, output: 2 } } } });
    assert.deepStrictEqual(mh.priceFor("openai", "gpt-x"), { input: 2, output: 10 });
    assert.deepStrictEqual(mh.priceFor("unknown", "m"), { input: 0, output: 0 });
    assert.deepStrictEqual(mh.priceFor("groq", "custom"), { input: 1, output: 2 });
  });
  test("computeCost per million tokens", () => {
    mh.__setState({ pricing: { providers: { p: { input: 1, output: 3 } }, models: {} } });
    const cost = mh.computeCost({ provider: "p", name: "m" }, 1_000_000, 1_000_000);
    assert.strictEqual(cost, 4);
  });
});

describe("cascadeValid", () => {
  test("accepts non-empty string content", () => {
    assert.strictEqual(mh.cascadeValid({ choices: [{ message: { content: "ok" } }] }), true);
  });
  test("rejects empty content but accepts tool_calls", () => {
    assert.strictEqual(mh.cascadeValid({ choices: [{ message: { content: "" } }] }), false);
    assert.strictEqual(mh.cascadeValid({ choices: [{ message: { content: null, tool_calls: [{ id: "t" }] } }] }), true);
    assert.strictEqual(mh.cascadeValid(null), false);
    assert.strictEqual(mh.cascadeValid({ choices: [] }), false);
  });
});

describe("deriveEndpoint", () => {
  test("replaces chat/completions suffix", () => {
    assert.strictEqual(
      mh.deriveEndpoint("https://api.groq.com/openai/v1/chat/completions", "embeddings"),
      "https://api.groq.com/openai/v1/embeddings"
    );
    assert.strictEqual(
      mh.deriveEndpoint("https://api.groq.com/openai/v1/chat/completions", "models"),
      "https://api.groq.com/openai/v1/models"
    );
  });
  test("appends when suffix missing", () => {
    assert.strictEqual(mh.deriveEndpoint("https://host/v1", "models"), "https://host/v1/models");
  });
});

describe("routing strategies", () => {
  const mk = (id, extra = {}) => ({
    id, enabled: true, failUntil: 0, free: false,
    dailyReq: 0, avgTTFTMs: 0, lastLatencyMs: 0,
    provider: "p", name: id, ...extra
  });
  const state = (strategy) => ({
    models: [
      mk("p/a", { dailyReq: 5, avgTTFTMs: 300 }),
      mk("p/b", { dailyReq: 1, avgTTFTMs: 100 }),
      mk("p/c", { dailyReq: 3, avgTTFTMs: 200 })
    ],
    prefs: {
      enabled: {},
      strategy: strategy ? { auto: strategy } : {},
      profiles: { auto: ["p/a", "p/b", "p/c"] }
    },
    pricing: { providers: { p: { input: 1, output: 1 } }, models: {} }
  });
  test("order preserves profile order", () => {
    mh.__setState(state());
    assert.deepStrictEqual(mh.applyStrategy(["p/a", "p/b", "p/c"], "order"), ["p/a", "p/b", "p/c"]);
  });
  test("least-used puts b first", () => {
    assert.strictEqual(mh.applyStrategy(mh.applyStrategy(["p/a", "p/b", "p/c"], "least-used"), "order")[0], "p/b");
  });
  test("fastest puts b (lowest ttft) first", () => {
    mh.__setState(state());
    assert.strictEqual(mh.applyStrategy(["p/a", "p/b", "p/c"], "fastest")[0], "p/b");
  });
  test("random returns a permutation", () => {
    mh.__setState(state());
    const out = mh.applyStrategy(["p/a", "p/b", "p/c"], "random");
    assert.deepStrictEqual(out.slice().sort(), ["p/a", "p/b", "p/c"]);
  });
  test("selectCandidates honors profile strategy", () => {
    mh.__setState(state("least-used"));
    assert.strictEqual(mh.selectCandidates(null, "auto")[0], "p/b");
  });
  test("cascade strategy sorts by price ascending", () => {
    mh.__setState({
      models: [
        mk("p/exp", {}),
        mk("p/free", { free: true })
      ],
      prefs: { enabled: {}, strategy: { auto: "cascade" }, profiles: { auto: ["p/exp", "p/free"] } },
      pricing: { providers: { p: { input: 1, output: 1 } }, models: {} }
    });
    const cands = mh.selectCandidates(null, "auto");
    assert.strictEqual(cands[0], "p/free");
    assert.strictEqual(cands[1], "p/exp");
  });
});

describe("postWithFailover", () => {
  const http = require("node:http");
  const mkModel = (id, baseURL) => ({
    id, provider: "p", name: id, baseURL, key: "",
    enabled: true, fails: 0, failUntil: 0, halfOpen: false, lastError: "",
    lastLatencyMs: 0, requests: 0, tokens: 0, day: "", dailyReq: 0, dailyTok: 0,
    cost: 0, dailyCost: 0, lifetimeFails: 0, lastTTFTMs: 0, avgTTFTMs: 0, free: true
  });
  const startServer = () => new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.url === "/bad") { res.writeHead(500); return res.end("boom"); }
      if (req.url === "/empty") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ choices: [{ message: { content: "" } }] }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }));
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });

  test("fails over from HTTP 500 upstream to next candidate", async () => {
    const srv = await startServer();
    const port = srv.address().port;
    try {
      mh.__setState({
        models: [mkModel("p/bad", `http://127.0.0.1:${port}/bad`), mkModel("p/good", `http://127.0.0.1:${port}/good`)],
        prefs: { enabled: {}, strategy: {}, profiles: { auto: ["p/bad", "p/good"] }, enhancer: { enabled: false } },
        pricing: { providers: { p: { input: 1, output: 1 } }, models: {} }
      });
      const r = await mh.postWithFailover({ model: "auto", max_tokens: 8, messages: [{ role: "user", content: `failover probe ${Date.now()}` }] });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.modelId, "p/good");
      assert.deepStrictEqual(r.tried, ["p/bad", "p/good"]);
      assert.strictEqual(r.data.choices[0].message.content, "ok");
    } finally { srv.close(); }
  });

  test("skips empty-content responses during failover", async () => {
    const srv = await startServer();
    const port = srv.address().port;
    try {
      mh.__setState({
        models: [mkModel("p/empty", `http://127.0.0.1:${port}/empty`), mkModel("p/good", `http://127.0.0.1:${port}/good`)],
        prefs: { enabled: {}, strategy: {}, profiles: { auto: ["p/empty", "p/good"] }, enhancer: { enabled: false } },
        pricing: { providers: { p: { input: 1, output: 1 } }, models: {} }
      });
      const r = await mh.postWithFailover({ model: "auto", max_tokens: 8, messages: [{ role: "user", content: `empty-content probe ${Date.now()}` }] });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.modelId, "p/good");
      assert.deepStrictEqual(r.tried, ["p/empty", "p/good"]);
    } finally { srv.close(); }
  });

  test("reports failure when every candidate fails", async () => {
    const srv = await startServer();
    const port = srv.address().port;
    try {
      mh.__setState({
        models: [mkModel("p/bad", `http://127.0.0.1:${port}/bad`)],
        prefs: { enabled: {}, strategy: {}, profiles: { auto: ["p/bad"] }, enhancer: { enabled: false } },
        pricing: { providers: { p: { input: 1, output: 1 } }, models: {} }
      });
      const r = await mh.postWithFailover({ model: "auto", max_tokens: 8, messages: [{ role: "user", content: `exhaustion probe ${Date.now()}` }] });
      assert.strictEqual(r.ok, false);
      assert.match(String(r.error), /p\/bad/);
    } finally { srv.close(); }
  });
});

describe("openai streaming e2e", () => {
  test("streams SSE chunks and closes the connection", async () => {
    const { execFile } = require("node:child_process");
    const path = require("node:path");
    await new Promise((resolve, reject) => {
      execFile(process.execPath, [path.join(__dirname, "helpers", "stream-e2e.js")], { timeout: 30000 }, (err, stdout) => {
        if (err) return reject(new Error(String(stdout || err.message)));
        resolve();
      });
    });
  });
});
