const BASE = "http://127.0.0.1:8787";
const DEFAULT_PROFILES = ["auto", "auto-code", "auto-reasoning", "auto-fast", "free-pool"];
const STRATEGIES = [
  ["autoroute", "autoroute (automatico)"],
  ["order", "order (lista manuale)"],
  ["cheapest", "cheapest (prezzo)"],
  ["fastest", "fastest (TTFT medio)"],
  ["least-used", "least-used (carico oggi)"],
  ["random", "random"],
  ["cascade", "cascade (cheap→strong)"]
];
let STATE = null;
let selectedProfile = "auto";
let profileOrder = [];
const UI = Object.assign(
  { collapsed: {}, search: "", filter: "all", sort: "default", compact: false },
  (() => { try { return JSON.parse(localStorage.getItem("mh-ui") || "{}"); } catch { return {}; } })()
);
function saveUI() { try { localStorage.setItem("mh-ui", JSON.stringify(UI)); } catch {} }

async function api(path, method = "GET", body) {
  const opt = { method, headers: { "Content-Type": "application/json" } };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opt);
  try { return await r.json(); } catch { return {}; }
}

async function poll() {
  try {
    const [s, l] = await Promise.all([api("/hub/state"), api("/hub/logs")]);
    STATE = s;
    const up = s && s.port;
    document.getElementById("serverDot").className = "dot " + (up ? "on" : "off");
    document.getElementById("serverText").textContent = up ? `server attivo :${s.port}` : "server offline";
    if (s) {
      render(s);
      renderLogs(l.logs || []);
    }
  } catch {
    document.getElementById("serverDot").className = "dot off";
    document.getElementById("serverText").textContent = "server offline";
  }
}

function fmtCost(c) {
  if (!c || c === 0) return "$0";
  if (c < 0.01) return "$" + c.toFixed(4);
  return "$" + c.toFixed(2);
}

function render(s) {
  document.getElementById("modelCount").textContent = `${s.models.length} modelli · ${s.totals.healthy} ok`;
  const cb = document.getElementById("costBadge");
  cb.textContent = `oggi: ${fmtCost(s.totals.cost)} · ${s.totals.req} req · ${(s.totals.tok / 1000).toFixed(1)}k tok`;
  cb.title = `Totale storico: ${fmtCost(s.totals.lifetimeCost)} · cache hits: ${s.cache.hits}`;
  renderProviders(s);
  renderProfiles(s);
  renderPricing(s);
  renderGatewayKeys(s);
  renderEnhancer(s);
  renderFeatures(s);
  renderLeaderboard(s);
  const ci = document.getElementById("cacheInfo");
  ci.textContent = s.cache.enabled
    ? `${s.cache.size} voci in cache · ${s.cache.hits} hit · TTL ${Math.round(s.cache.ttlMs / 1000)}s`
    : "cache disabilitata (MODELHUB_CACHE=0)";
}

function renderProviders(s) {
  const wrap = document.getElementById("providers");
  wrap.classList.toggle("compact", !!UI.compact);
  wrap.innerHTML = "";
  const byProv = {};
  for (const m of s.models) (byProv[m.provider] ||= []).push(m);
  const q = UI.search.trim().toLowerCase();

  for (const p of s.providers) {
    let models = byProv[p.name] || [];
    if (q || UI.filter !== "all") {
      models = models.filter(m =>
        (!q || m.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) &&
        (UI.filter === "all" ||
          (UI.filter === "enabled" && m.enabled) ||
          (UI.filter === "disabled" && !m.enabled) ||
          (UI.filter === "free" && m.free)));
    }
    if (q && !p.name.toLowerCase().includes(q) && !models.length) continue;
    models = models.slice().sort((a, b) => {
      if (UI.sort === "name") return a.id.localeCompare(b.id);
      if (UI.sort === "health") return (b.healthy - a.healthy) || ((b.avgTTFTMs || 9e9) < (a.avgTTFTMs || 9e9) ? -1 : 1);
      if (UI.sort === "usage") return (b.requests || 0) - (a.requests || 0);
      return 0;
    });

    const collapsed = !!UI.collapsed[p.name];
    const hasKey = s.keysPresent[p.name];
    const card = document.createElement("div");
    card.className = "provider" + (collapsed ? " closed" : "");

    const head = document.createElement("div");
    head.className = "phead";
    head.innerHTML = `
      <span class="chev">${collapsed ? "▸" : "▾"}</span>
      <span class="pname">${esc(p.label)}</span>
      <span class="pmeta">${models.length}${models.length !== (byProv[p.name] || []).length ? "/" + (byProv[p.name] || []).length : ""} modelli</span>
      ${p.needsKey
        ? `<span class="badge ${hasKey ? "keyok" : "nokey"}">${hasKey ? "key OK" : "no key"}</span>`
        : `<span class="badge free">keyless</span>`}
      ${p.keyUrl ? `<button class="keyurl" data-url="${esc(p.keyUrl)}" title="Crea API key nel browser">🔑↗</button>` : ""}
      <button class="disc" data-prov="${esc(p.name)}" title="auto-discovery modelli">🔍</button>
      <button class="del" data-prov="${esc(p.name)}" title="rimuovi provider">✕</button>
    `;
    head.onclick = (e) => {
      if (e.target.closest("button")) return;
      UI.collapsed[p.name] = !UI.collapsed[p.name];
      saveUI();
      renderProviders(STATE);
    };
    card.appendChild(head);

    if (collapsed) { wrap.appendChild(card); continue; }

    if (p.needsKey) {
      const keyRow = document.createElement("div");
      keyRow.className = "pkey";
      keyRow.style.margin = "8px 0";
      const inp = document.createElement("input");
      inp.placeholder = "API key per " + p.name;
      inp.value = hasKey ? "••••••••" : "";
      const eye = document.createElement("button");
      eye.className = "btn mini"; eye.textContent = hasKey ? "👁" : ""; eye.title = "mostra/nascondi chiave";
      eye.disabled = !hasKey;
      eye.onclick = async () => {
        if (inp.dataset.revealed) { inp.value = "••••••••"; delete inp.dataset.revealed; return; }
        const r = await api("/hub/key/reveal", "POST", { provider: p.name });
        if (r.ok) { inp.value = r.key; inp.dataset.revealed = "1"; }
        else alert("Nessuna chiave salvata per " + p.name);
      };
      const save = document.createElement("button");
      save.className = "btn"; save.textContent = "Salva";
      save.onclick = async () => {
        await api("/hub/keys", "POST", { provider: p.name, key: inp.value && inp.value !== "••••••••" ? inp.value : "" });
        poll();
      };
      keyRow.appendChild(inp); keyRow.appendChild(eye); keyRow.appendChild(save);
      card.appendChild(keyRow);
    }

    const list = document.createElement("div");
    list.className = "models";
    for (const m of models) {
      const row = document.createElement("div");
      row.className = "model";
      const stat = m.lastError
        ? `<span class="down" title="${esc(m.lastError)}">down</span>`
        : `<span class="ok">ok</span>`;
      const speed = m.avgTTFTMs ? `${m.avgTTFTMs}ms ttft` : (m.lastLatencyMs ? `${m.lastLatencyMs}ms` : "");
      row.innerHTML = `
        <input type="checkbox" ${m.enabled ? "checked" : ""} data-id="${esc(m.id)}" />
        <div>
          <div class="mname">${esc(m.name)} ${m.free ? `<span class="badge free">free</span>` : `<span class="badge paid">$</span>`}</div>
          <div class="minfo">${m.requests} req · ${(m.dailyTok / 1000).toFixed(1)}k tok ogg · ${speed} · ${fmtCost(m.dailyCost)} ogg</div>
        </div>
        <div class="mstat">${stat}<br/>${m.lastError ? esc(m.lastError).slice(0, 40) : ""}</div>
      `;
      row.querySelector("input").onchange = async (e) => {
        await api("/hub/toggle", "POST", { id: m.id, enabled: e.target.checked });
        poll();
      };
      list.appendChild(row);
    }
    if (!models.length) list.innerHTML = `<div class="hint" style="padding:6px">nessun modello corrisponde ai filtri</div>`;
    card.appendChild(list);
    wrap.appendChild(card);
  }

  wrap.querySelectorAll(".del").forEach(b => {
    b.onclick = async () => {
      if (confirm("Rimuovere provider " + b.dataset.prov + "?")) {
        await api("/hub/provider/remove", "POST", { name: b.dataset.prov });
        poll();
      }
    };
  });
  wrap.querySelectorAll(".disc").forEach(b => {
    b.onclick = async () => {
      b.textContent = "…";
      const r = await api("/hub/discover", "POST", { provider: b.dataset.prov });
      alert(r.ok !== false ? `Aggiunti ${r.added || 0} nuovi modelli (${r.total || "?"})` : ("Errore: " + r.error));
      poll();
    };
  });
  wrap.querySelectorAll(".keyurl").forEach(b => {
    b.onclick = () => window.open(b.dataset.url, "_blank");
  });
}

function bindToolbar() {
  const search = document.getElementById("pSearch");
  const filter = document.getElementById("pFilter");
  const sort = document.getElementById("pSort");
  const compact = document.getElementById("pCompact");
  search.value = UI.search;
  filter.value = UI.filter;
  sort.value = UI.sort;
  compact.checked = !!UI.compact;
  let t = null;
  search.oninput = () => { clearTimeout(t); t = setTimeout(() => { UI.search = search.value; saveUI(); if (STATE) renderProviders(STATE); }, 250); };
  filter.onchange = () => { UI.filter = filter.value; saveUI(); if (STATE) renderProviders(STATE); };
  sort.onchange = () => { UI.sort = sort.value; saveUI(); if (STATE) renderProviders(STATE); };
  compact.onchange = () => { UI.compact = compact.checked; saveUI(); if (STATE) renderProviders(STATE); };
}
bindToolbar();

function renderProfiles(s) {
  const sel = document.getElementById("profileSelect");
  const cur = sel.value || selectedProfile;
  sel.innerHTML = "";
  for (const name of s.profiles) {
    const o = document.createElement("option");
    o.value = name; o.textContent = name;
    sel.appendChild(o);
  }
  if ([...s.profiles].includes(cur)) sel.value = cur;
  selectedProfile = sel.value;
  profileOrder = (s.profileOrder && s.profileOrder[selectedProfile]) ? s.profileOrder[selectedProfile].slice() : [];

  const stSel = document.getElementById("strategySelect");
  stSel.innerHTML = "";
  for (const [v, label] of STRATEGIES) {
    const o = document.createElement("option");
    o.value = v; o.textContent = "strategia: " + label;
    stSel.appendChild(o);
  }
  stSel.value = (s.strategies && s.strategies[selectedProfile]) || "order";

  const ol = document.getElementById("profileList");
  ol.innerHTML = "";
  for (const id of profileOrder) {
    const li = document.createElement("li");
    li.draggable = true; li.dataset.id = id;
    li.innerHTML = `<span class="handle">⠿</span><span class="pid">${esc(id)}</span>`;
    ol.appendChild(li);
  }
  enableDrag(ol);
}

function renderPricing(s) {
  const wrap = document.getElementById("pricingList");
  wrap.innerHTML = "";
  const cur = s.pricing && s.pricing.providers ? s.pricing.providers : {};
  for (const p of s.providers) {
    const v = cur[p.name] || {};
    const row = document.createElement("div");
    row.className = "prow";
    row.innerHTML = `
      <span class="pname-sm">${esc(p.name)}</span>
      <input type="number" step="0.01" min="0" class="pin" value="${v.input ?? 0}" title="input $/Mtok" />
      <input type="number" step="0.01" min="0" class="pout" value="${v.output ?? 0}" title="output $/Mtok" />
    `;
    const save = document.createElement("button");
    save.className = "btn mini"; save.textContent = "✓";
    save.title = "Salva prezzi " + p.name;
    save.onclick = async () => {
      await api("/hub/pricing", "POST", {
        provider: p.name,
        input: parseFloat(row.querySelector(".pin").value) || 0,
        output: parseFloat(row.querySelector(".pout").value) || 0
      });
      poll();
    };
    row.appendChild(save);
    wrap.appendChild(row);
  }
}

function renderGatewayKeys(s) {
  const ta = document.getElementById("gwKeys");
  if (document.activeElement !== ta) {
    ta.value = (s.gatewayKeys || []).join("\n");
  }
}

function renderEnhancer(s) {
  const sel = document.getElementById("enhModel");
  if (document.activeElement === sel) return;
  sel.innerHTML = "";
  const models = (s.models || []).filter(m => m.enabled)
    .slice().sort((a, b) => (b.free - a.free) || ((s.leaderboard || []).findIndex(x => x.id === a.id) - (s.leaderboard || []).findIndex(x => x.id === b.id)));
  for (const m of models) {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = (m.free ? "★ " : "") + m.id + (m.avgTTFTMs ? ` (${m.avgTTFTMs}ms)` : "");
    sel.appendChild(o);
  }
  if (s.enhancer && s.enhancer.model) sel.value = s.enhancer.model;
}

function renderFeatures(s) {
  const f = s.features || {};
  const enh = s.enhancer || {};
  document.getElementById("featEnhancer").checked = !!(enh && enh.enabled);
  document.getElementById("featCache").checked = !!f.cache;
  document.getElementById("featProbe").checked = !!f.autoProbe;
}

function renderLeaderboard(s) {
  const ol = document.getElementById("leaderboard");
  if (!ol) return;
  const lb = s.leaderboard || [];
  ol.innerHTML = lb.map((m, i) => {
    const cat = classifyLabel(m.id);
    return `<li>
      <span class="rank">${i + 1}</span>
      <span class="pid" title="${esc(m.id)}">${esc(m.id)}</span>
      ${m.free ? `<span class="badge free">free</span>` : ""}
      <span class="cat">${cat}</span>
      <span class="score">${m.score}</span>
      <span class="meta">${m.avgTTFTMs ? m.avgTTFTMs + "ms" : "–"} · ${m.requests}req/${m.fails}err${m.healthy ? "" : " · down"}</span>
    </li>`;
  }).join("") || `<li class="hint">nessun dato</li>`;
}

function classifyLabel(id) {
  if (/cod(e|ing|er)|devstral|starcoder|deepseek-v3|glm-4-5|kimi-k2|minimax-m2/i.test(id)) return "code";
  if (/reason|r1|reasoner|thinking|\bo[13]\b|-o1-|qwq|nemotron-3-ultra/i.test(id)) return "reasoning";
  if (/8b|flash-lite|mini|turbo|small|lightning|nano|instant|1\.5-flash|qwen-turbo|solar-mini|gemma2|ministral|llama3\.1-8b/i.test(id)) return "fast";
  return "general";
}

function renderLogs(logs) {
  const tbody = document.getElementById("logRows");
  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="hint">nessuna richiesta</td></tr>`;
    drawChart([]);
    return;
  }
  const rows = logs.slice(0, 30).map(l => {
    const t = new Date(l.ts).toLocaleTimeString();
    const status = l.ok
      ? `<span class="ok">ok${l.cached ? " ⚡" : ""}</span>`
      : `<span class="down" title="${esc(l.error || "")}">err</span>`;
    const cost = l.cost == null ? "—" : fmtCost(l.cost);
    return `<tr>
      <td>${t}</td><td>${esc(l.reqModel || "–")}</td><td>${esc(l.model || "(nessuno)")}</td>
      <td>${esc(l.proto || "")}</td><td>${l.latencyMs || 0}</td><td>${l.ttftMs == null ? "—" : l.ttftMs}</td>
      <td>${l.totalTok || 0}</td><td>${cost}</td><td>${status}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join("");
  drawChart(logs);
}

function drawChart(logs) {
  const el = document.getElementById("chart24");
  const now = Date.now();
  const buckets = Array.from({ length: 24 }, (_, i) => ({ h: 23 - i, req: 0, cost: 0, errs: 0 }));
  for (const l of logs) {
    const ageH = Math.floor((now - l.ts) / 3600000);
    if (ageH >= 0 && ageH < 24) {
      buckets[23 - ageH].req++;
      buckets[23 - ageH].cost += l.cost || 0;
      if (!l.ok) buckets[23 - ageH].errs++;
    }
  }
  const max = Math.max(1, ...buckets.map(b => b.req));
  el.innerHTML = buckets.map(b => {
    const pct = Math.round((b.req / max) * 100);
    const cls = b.errs ? "bar errbar" : "bar";
    const title = `${b.req} richieste · ${fmtCost(b.cost)}`;
    return `<div class="${cls}" style="height:${Math.max(pct, b.req ? 6 : 2)}%" title="${title}"></div>`;
  }).join("");
}

function enableDrag(ol) {
  let dragEl = null;
  ol.querySelectorAll("li").forEach(li => {
    li.ondragstart = () => { dragEl = li; li.classList.add("drag"); };
    li.ondragend = () => { li.classList.remove("drag"); dragEl = null; };
    li.ondragover = (e) => e.preventDefault();
    li.ondrop = (e) => {
      e.preventDefault();
      if (!dragEl || dragEl === li) return;
      const ids = [...ol.querySelectorAll("li")].map(x => x.dataset.id);
      const from = ids.indexOf(dragEl.dataset.id);
      const to = ids.indexOf(li.dataset.id);
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      profileOrder = ids;
      renderProfiles(STATE);
    };
  });
}

document.getElementById("profileSelect").onchange = (e) => { selectedProfile = e.target.value; renderProfiles(STATE); };
document.getElementById("strategySelect").onchange = async (e) => {
  await api("/hub/strategy", "POST", { profile: selectedProfile, strategy: e.target.value });
};
document.getElementById("saveOrder").onclick = async () => {
  await api("/hub/reorder", "POST", { profile: selectedProfile, order: profileOrder });
  poll();
};
document.getElementById("profileNew").onclick = async () => {
  const name = prompt("Nome nuovo profilo:");
  if (name) { await api("/hub/profile/create", "POST", { name }); poll(); }
};
document.getElementById("profileDel").onclick = async () => {
  if (DEFAULT_PROFILES.includes(selectedProfile)) { alert("Profili default non eliminabili."); return; }
  if (confirm("Eliminare profilo " + selectedProfile + "?")) { await api("/hub/profile/delete", "POST", { name: selectedProfile }); poll(); }
};
document.getElementById("gwSave").onclick = async () => {
  const keys = document.getElementById("gwKeys").value.split("\n").map(k => k.trim()).filter(Boolean);
  await api("/hub/gateway-keys", "POST", { keys });
  poll();
};
document.getElementById("cacheClear").onclick = async () => {
  await api("/hub/cache", "POST", { clear: true });
  poll();
};
document.getElementById("featEnhancer").onchange = async (e) => {
  await api("/hub/enhancer", "POST", { enabled: e.target.checked });
  poll();
};
document.getElementById("featCache").onchange = async (e) => {
  await api("/hub/features", "POST", { cache: e.target.checked });
  poll();
};
document.getElementById("featProbe").onchange = async (e) => {
  await api("/hub/features", "POST", { autoProbe: e.target.checked });
  poll();
};
document.getElementById("exportBtn").onclick = async () => {
  const r = await fetch(BASE + "/hub/export");
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (r.headers.get("Content-Disposition") || "").match(/filename="?([^"]+)"?/)?.[1] || "modelhub-export.json";
  a.click();
  URL.revokeObjectURL(a.href);
};
document.getElementById("enhModel").onchange = async (e) => {
  await api("/hub/enhancer", "POST", { model: e.target.value });
  poll();
};
document.getElementById("probeAll").onclick = async () => {
  document.getElementById("probeAll").textContent = " probing…";
  await api("/hub/probe", "POST", {});
  document.getElementById("probeAll").textContent = "Probe all";
  poll();
};
document.getElementById("refresh").onclick = poll;

document.getElementById("np_add").onclick = async () => {
  const name = document.getElementById("np_name").value.trim();
  const base = document.getElementById("np_base").value.trim();
  if (!name || !base) { alert("nome e baseURL obbligatori"); return; }
  const models = document.getElementById("np_models").value.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const [n, f] = l.split("|");
    return { name: n.trim(), free: f ? f.trim().toLowerCase() === "true" : false };
  });
  await api("/hub/provider/add", "POST", {
    name, label: document.getElementById("np_label").value.trim() || name,
    baseURL: base, authId: name, needsKey: document.getElementById("np_key").checked, models
  });
  if (models.length === 0) {
    const d = await api("/hub/discover", "POST", { provider: name });
    if (d.ok) alert(`Provider aggiunto. Auto-discovery: ${d.added} modelli trovati.`);
  }
  poll();
};

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// theme toggle (dark/light), persisted
(function () {
  const btn = document.getElementById("themeBtn");
  function apply(t) {
    document.body.classList.toggle("light", t === "light");
    try { localStorage.setItem("mh-theme", t); } catch {}
  }
  btn.onclick = () => apply(document.body.classList.contains("light") ? "dark" : "light");
  let saved = "dark";
  try { saved = localStorage.getItem("mh-theme") || "dark"; } catch {}
  apply(saved);
})();

poll();
setInterval(poll, 3000);
