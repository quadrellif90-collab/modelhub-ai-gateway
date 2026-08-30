const BASE = "http://127.0.0.1:8787";
const TOKEN = new URLSearchParams(location.search).get("t") || "";
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
  { collapsed: {}, search: "", filter: "all", sort: "default" },
  (() => { try { return JSON.parse(localStorage.getItem("mh-ui") || "{}"); } catch { return {}; } })()
);
function saveUI() { try { localStorage.setItem("mh-ui", JSON.stringify(UI)); } catch {} }

async function api(path, method = "GET", body) {
  const opt = { method, headers: { "Content-Type": "application/json", "x-modelhub-token": TOKEN } };
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
      updateLastModel(l.logs || []);
    }
  } catch {
    document.getElementById("serverDot").className = "dot off";
    document.getElementById("serverText").textContent = "server offline";
  }
}

function updateLastModel(logs) {
  const el = document.getElementById("lastModel");
  if (!el) return;
  const last = logs.find(e => e.ok && e.proto && e.proto.indexOf("enhance") === -1 && e.model);
  if (last) {
    const prof = last.reqModel ? ` · profilo ${last.reqModel}` : "";
    el.textContent = `↳ ${last.model}${prof}`;
    el.title = `Ultimo modello risolto: ${last.model}${prof}`;
  } else {
    el.textContent = "–";
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
  renderProvidersWithMeta(s);
  renderProfiles(s);
  renderPricing(s);
  renderGatewayKeys(s);
  renderEnhancer(s);
  renderSettings(s);
  renderLeaderboard(s);
  renderStats(s);
  renderLogs((STATE && STATE.logs) || (s.logs) || []);
}

function renderProviders(s) {
  const wrap = document.getElementById("providers");
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
    const healthyN = models.filter(m => m.healthy !== false).length;
    head.innerHTML = `
      <span class="chev">${collapsed ? "▸" : "▾"}</span>
      <span class="pname">${esc(p.label)}</span>
      <span class="pmeta">${models.length}${models.length !== (byProv[p.name] || []).length ? "/" + (byProv[p.name] || []).length : ""} modelli</span>
      <span class="badge ${healthyN === models.length ? "keyok" : "nokey"}" title="${healthyN}/${models.length} modelli sani">${healthyN}/${models.length} ok</span>
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
      renderProvidersWithMeta(STATE);
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
      const stat = m.healthy === false
        ? `<span class="down" title="${esc(m.lastError || "non raggiungibile")}">down</span>`
        : `<span class="ok">ok</span>`;
      const verif = m.lastVerifiedAt
        ? (m.verified
          ? `<span class="ok" title="verificato ${new Date(m.lastVerifiedAt).toLocaleString()}">✓</span>`
          : `<span class="down" title="verifica fallita">✗</span>`)
        : `<span title="non verificato">–</span>`;
      const speed = m.avgTTFTMs ? `${m.avgTTFTMs}ms ttft` : (m.lastLatencyMs ? `${m.lastLatencyMs}ms` : "");
      row.innerHTML = `
        <input type="checkbox" ${m.enabled ? "checked" : ""} data-id="${esc(m.id)}" />
        <div>
          <div class="mname">${esc(m.name)} ${m.free ? `<span class="badge free">free</span>` : `<span class="badge paid">$</span>`}</div>
          <div class="minfo">${m.requests} req · ${(m.dailyTok / 1000).toFixed(1)}k tok ogg · ${speed} · ${fmtCost(m.dailyCost)} ogg</div>
        </div>
        <div class="mstat">${stat} ${verif}<br/>${m.lastError ? esc(m.lastError).slice(0, 40) : ""}</div>
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
  search.value = UI.search;
  filter.value = UI.filter;
  sort.value = UI.sort;
  let t = null;
  search.oninput = () => { clearTimeout(t); t = setTimeout(() => { UI.search = search.value; saveUI(); if (STATE) renderProvidersWithMeta(STATE); }, 250); };
  filter.onchange = () => { UI.filter = filter.value; saveUI(); if (STATE) renderProvidersWithMeta(STATE); };
  sort.onchange = () => { UI.sort = sort.value; saveUI(); if (STATE) renderProvidersWithMeta(STATE); };
}
bindToolbar();

function renderProfiles(s) {
  const sel = document.getElementById("profileSelect");
  // Usa sempre la selezione corrente (variabile globale) per evitare race
  // con il poll() che sovrascriverebbe sel.value.
  const cur = selectedProfile;
  sel.innerHTML = "";
  for (const name of s.profiles) {
    const o = document.createElement("option");
    o.value = name; o.textContent = name;
    sel.appendChild(o);
  }
  if ([...s.profiles].includes(cur)) sel.value = cur;
  // Non sovrascrivere la scelta dell'utente durante il poll: mantieni selectedProfile
  // a meno che il profilo corrente non esista più nello state.
  if (![...s.profiles].includes(selectedProfile)) selectedProfile = sel.value;
  // Fallback: se il profilo non ha un ordine esplicito, usa i modelli abilitati
  let order = (s.profileOrder && s.profileOrder[selectedProfile]) ? s.profileOrder[selectedProfile].slice() : [];
  if (!order.length && Array.isArray(s.models)) {
    order = s.models.filter(m => m.enabled).map(m => m.id);
  }
  profileOrder = order;

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
  const list = document.getElementById("gwList");
  const keys = (s.gatewayKeys || []).map(k => ({
    kid: k.kid, label: k.label || "", createdAt: k.createdAt || 0, lastUsedAt: k.lastUsedAt || 0,
    expiresAt: k.expiresAt || 0, rpm: k.rpm || 0, used: k.used || { tokens: 0, spent: 0 }
  }));
  if (!keys.length) {
    list.innerHTML = `<div class="hint" style="padding:6px">nessuna chiave — genera la prima con il pulsante sopra.</div>`;
    return;
  }
  list.innerHTML = "";
  for (const k of keys) {
    const row = document.createElement("div");
    row.className = "gwkey";
    const used = (k.used && k.used.tokens) ? `${k.used.tokens} tok` : "–";
    row.innerHTML = `
      <div class="gwmeta">
        <span class="gwkid">${esc(k.kid)}</span>
        <span class="badge keyok">${esc(k.label || "senza nome")}</span>
        ${k.rpm ? `<span class="badge">${k.rpm} rpm</span>` : ""}
      </div>
      <div class="gwsub">creata ${k.createdAt ? new Date(k.createdAt).toLocaleDateString() : "?"} · ultimo uso ${k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "mai"} · ${used}${k.expiresAt ? " · scade " + new Date(k.expiresAt).toLocaleDateString() : ""}</div>
      <div class="gwactions">
        <button class="btn mini gw-limit" data-kid="${esc(k.kid)}" title="Imposta quota/rpm">quota</button>
        <button class="btn mini danger gw-revoke" data-kid="${esc(k.kid)}" title="Revoca chiave">revoca</button>
      </div>`;
    list.appendChild(row);
  }
  list.querySelectorAll(".gw-revoke").forEach(b => {
    b.onclick = async () => {
      if (!confirm("Revocare la chiave " + b.dataset.kid + "? Le app che la usano smetteranno di funzionare.")) return;
      await api("/hub/gateway-keys", "POST", { action: "revoke", kid: b.dataset.kid });
      poll();
    };
  });
  list.querySelectorAll(".gw-limit").forEach(b => {
    b.onclick = async () => {
      const t = prompt("Limite token/giorno (0 = illimitato):", "0");
      if (t === null) return;
      const r = prompt("Limite RPM (0 = illimitato):", "0");
      if (r === null) return;
      await api("/hub/gateway-keys", "POST", { action: "limit", kid: b.dataset.kid, tokens: Number(t) || 0, rpm: Number(r) || 0 });
      poll();
    };
  });
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
  const mc = document.getElementById("enhMaxChars");
  const et = document.getElementById("enhTimeout");
  if (document.activeElement !== mc && s.enhancer) mc.value = s.enhancer.maxChars || 4000;
  if (document.activeElement !== et && s.enhancer) et.value = Math.round((s.enhancer.timeoutMs || 12000) / 1000);
}

function renderSettings(s) {
  const st = s.settings || {};
  const exp = s.experiments || {};
  document.getElementById("expOn").checked = !!exp.enabled;
  document.getElementById("expProfile").value = exp.candidate || "";
  document.getElementById("expSplit").value = exp.splitPct || 0;
  document.getElementById("alertUrl").value = (s.alerts && s.alerts.webhook) || "";
  const enh = s.enhancer || {};
  const plugs = (enh.plugins || []).map(String);
  document.getElementById("plugConcise").checked = plugs.includes("concise");
  document.getElementById("plugEnglish").checked = plugs.includes("english");
  document.getElementById("plugCode").checked = plugs.includes("codepro");
  const f = s.features || {};
  document.getElementById("startMin").checked = !!(f.startMinimized);
  // semantic cache panel
  const sem = s.semCache || {};
  document.getElementById("semOn").checked = !!sem.enabled;
  const semSel = document.getElementById("semEmbedder");
  if (document.activeElement !== semSel) {
    semSel.innerHTML = `<option value="">— nessun embedder —</option>` +
      (s.models || []).filter(m => m.enabled).map(m => `<option value="${esc(m.id)}">${esc(m.id)}</option>`).join("");
    if (sem.embedder) semSel.value = sem.embedder;
  }
  document.getElementById("semThr").value = sem.threshold || 0.95;
  document.getElementById("semInfo").textContent = sem.enabled
    ? `stato: ${sem.enabled ? "ON" : "OFF"} · embedder: ${sem.embedder || "—"} · ${sem.size || 0} voci · soglia ${sem.threshold}`
    : "cache semantica disattivata (off di default)";
  fetch(BASE + "/hub/keys", { headers: { "x-modelhub-token": TOKEN } }).then(r => r.ok ? r.json() : null).then(j => {
    if (!j) return;
    const sel = document.getElementById("klKey");
    sel.innerHTML = (j.keys || []).map(k => `<option value="${esc(k.kid)}">${esc(k.kid)}${(k.limit && k.limit.tokens) ? " (" + k.limit.tokens + " tok)" : ""}</option>`).join("") || `<option value="">nessuna chiave</option>`;
  }).catch(() => {});
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

function toast(msg, isErr) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = "toast"; }, 2600);
}

function renderStats(s) {
  const grid = document.getElementById("statsGrid");
  if (!grid) return;
  const t = s.totals || {};
  const cards = [
    { v: (s.models || []).length, l: "Modelli totali" },
    { v: (s.providers || []).length, l: "Provider" },
    { v: t.healthy != null ? t.healthy : "–", l: "Modelli sani" },
    { v: t.req != null ? t.req : "–", l: "Richieste oggi" },
    { v: t.tok != null ? (t.tok / 1000).toFixed(1) + "k" : "–", l: "Token oggi" },
    { v: t.cost != null ? (t.cost < 0.01 ? "$" + t.cost.toFixed(4) : "$" + t.cost.toFixed(2)) : "–", l: "Costo oggi" },
    { v: (s.profiles || []).length, l: "Profili" },
    { v: (s.enhancer && s.enhancer.enabled) ? "ON" : "OFF", l: "Enhancer" },
  ];
  grid.innerHTML = cards.map(c => `<div class="stat-card"><div class="v">${c.v}</div><div class="l">${c.l}</div></div>`).join("");
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
      if (STATE && STATE.profileOrder) STATE.profileOrder[selectedProfile] = ids;
      renderProfiles(STATE);
    };
  });
}

document.getElementById("profileSelect").onchange = (e) => {
  selectedProfile = e.target.value;
  try { localStorage.setItem("mh-profile", selectedProfile); } catch {}
  renderProfiles(STATE);
};
// ripristina l'ultimo profilo selezionato
try { const sp = localStorage.getItem("mh-profile"); if (sp) selectedProfile = sp; } catch {}
document.getElementById("settingsBtn").onclick = () => {
  // instradato dal main.js (setWindowOpenHandler -> createSettingsWindow)
  window.open("modelhub://settings");
};
// Drawer laterale (slide-in) — sostituisce la vecchia sidebar
(function () {
  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawerOverlay");
  const btn = document.getElementById("drawerToggle");
  const close = document.getElementById("drawerClose");
  const KEY = "mh-drawer";
  function apply(on) {
    drawer.classList.toggle("open", on);
    overlay.classList.toggle("open", on);
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch {}
  }
  let on = false;
  try { on = localStorage.getItem(KEY) === "1"; } catch {}
  apply(on);
  btn.onclick = () => apply(!drawer.classList.contains("open"));
  close.onclick = () => apply(false);
  overlay.onclick = () => apply(false);
})();
// Tabs attività (leader / recent / stats)
(function () {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(t => t.onclick = () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.querySelectorAll(".tab-body").forEach(b => b.classList.add("hidden"));
    document.getElementById("tab-" + t.dataset.tab).classList.remove("hidden");
  });
})();
document.getElementById("strategySelect").onchange = async (e) => {
  await api("/hub/strategy", "POST", { profile: selectedProfile, strategy: e.target.value });
};
document.getElementById("saveOrder").onclick = async () => {
  await api("/hub/reorder", "POST", { profile: selectedProfile, order: profileOrder });
  toast("Ordine profilo salvato ✓");
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
document.getElementById("copyCurlProfile").onclick = async () => {
  const prof = selectedProfile;
  const curl = `curl http://127.0.0.1:8787/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${prof}","stream":true,"messages":[{"role":"user","content":"Ciao!"}]}'`;
  try { await navigator.clipboard.writeText(curl); } catch {}
  flash("Copiato curl per profilo " + prof);
};
document.getElementById("exportConfig").onclick = async () => {
  try {
    const blob = await api("/hub/export", "GET");
    const url = URL.createObjectURL(new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `modelhub-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash("Config esportata");
  } catch (e) { flash("Export fallito: " + e.message); }
};
document.getElementById("importConfig").onclick = () => {
  document.getElementById("importFile").click();
};
document.getElementById("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    // Export completo (config/prefs/keys) -> /hub/import
    // Bulk chiavi {provider: key} -> /hub/keys
    const isFullExport = obj && (obj.config || obj.prefs || obj.keys) && typeof obj === "object";
    const endpoint = isFullExport ? "/hub/import" : "/hub/keys";
    const r = await api(endpoint, "POST", obj);
    flash("Import: " + JSON.stringify(r.imported || r));
    poll();
  } catch (err) { flash("Import fallito: " + err.message); }
  e.target.value = "";
};

document.getElementById("bulkImport").onclick = async () => {
  const msg = document.getElementById("bulkMsg");
  const raw = document.getElementById("bulkKeys").value.trim();
  if (!raw) { msg.textContent = "Incolla prima un JSON."; msg.className = "msg err"; return; }
  let obj;
  try { obj = JSON.parse(raw); } catch (e) { msg.textContent = "JSON non valido: " + e.message; msg.className = "msg err"; return; }
  try {
    const r = await api("/hub/keys", "POST", obj);
    msg.textContent = "Importate " + (r.count || Object.keys(obj).length) + " chiavi."; msg.className = "msg ok";
    toast("Importate " + (r.count || Object.keys(obj).length) + " chiavi ✓");
    poll();
  } catch (e) { msg.textContent = "Errore: " + e.message; msg.className = "msg err"; toast("Errore import: " + e.message, true); }
};
document.getElementById("gwMint").onclick = async () => {
  const label = document.getElementById("gwLabel").value.trim();
  const rpm = Number(document.getElementById("gwRpm").value) || 0;
  const exp = Number(document.getElementById("gwExp").value) || 0;
  const r = await api("/hub/gateway-keys", "POST", { action: "mint", label, rpm, expiresInDays: exp });
  if (r && r.secret) {
    const box = document.getElementById("gwNew");
    box.style.display = "block";
    box.innerHTML = `<div class="hint">Chiave generata (salvala ora, non verrà più mostrata):</div>
      <div class="gwsecret" id="gwSecret">${esc(r.secret)}</div>
      <button class="btn mini" id="gwCopy">📋 copia</button>`;
    document.getElementById("gwCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(r.secret); flash("Chiave copiata"); } catch {}
    };
  }
  poll();
};
document.getElementById("semOn").onchange = async (e) => {
  await api("/hub/semcache", "POST", { enabled: e.target.checked });
  poll();
};
document.getElementById("semEmbedder").onchange = async (e) => {
  await api("/hub/semcache", "POST", { embedder: e.target.value });
  poll();
};
document.getElementById("semThr").onchange = async (e) => {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v >= 0.5 && v <= 1) { await api("/hub/semcache", "POST", { threshold: v }); poll(); }
};
document.getElementById("semClear").onclick = async () => {
  await api("/hub/semcache", "POST", { action: "clear" });
  poll();
};
document.getElementById("exportBtn").onclick = async () => {
  const r = await fetch(BASE + "/hub/export", { headers: { "x-modelhub-token": TOKEN } });
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
  if (!confirm("Probe all verifica TUTTI i modelli attivi e può impiegarci minuti e saturare i rate-limit dei provider gratuiti. Continuare?")) return;
  document.getElementById("probeAll").textContent = " probing…";
  await api("/hub/probe", "POST", {});
  document.getElementById("probeAll").textContent = "Probe all";
  poll();
};
document.getElementById("widgetBtn").onclick = () => window.open("modelhub://widget");
document.getElementById("enhMaxChars").onchange = async (e) => {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v >= 200) { await api("/hub/enhancer", "POST", { maxChars: v }); poll(); }
};
document.getElementById("enhTimeout").onchange = async (e) => {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v >= 3) { await api("/hub/enhancer", "POST", { timeoutMs: v * 1000 }); poll(); }
};
document.getElementById("klSave").onclick = async () => {
  const kid = document.getElementById("klKey").value;
  if (!kid) { document.getElementById("klInfo").textContent = "nessuna chiave selezionata"; return; }
  const tokens = Number(document.getElementById("klTokens").value) || 0;
  const spend = Number(document.getElementById("klSpend").value) || 0;
  const r = await api("/hub/gateway-keys", "POST", { action: "limit", kid, tokens, spend });
  document.getElementById("klInfo").textContent = r && r.ok ? "quota salvata" : "errore";
  poll();
};
document.getElementById("expSave").onclick = async () => {
  await api("/hub/experiments", "POST", {
    enabled: document.getElementById("expOn").checked,
    profile: document.getElementById("expProfile").value.trim() || "auto-code",
    splitPct: Number(document.getElementById("expSplit").value) || 0
  });
  poll();
};
document.getElementById("alertSave").onclick = async () => {
  await api("/hub/alerts", "POST", { webhook: document.getElementById("alertUrl").value.trim() });
  poll();
};
document.getElementById("plugSave").onclick = async () => {
  const plugs = [];
  if (document.getElementById("plugConcise").checked) plugs.push("concise");
  if (document.getElementById("plugEnglish").checked) plugs.push("english");
  if (document.getElementById("plugCode").checked) plugs.push("codepro");
  await api("/hub/enhancer", "POST", { plugins: plugs });
  poll();
};
document.getElementById("startMin").onchange = async (e) => {
  await api("/hub/features", "POST", { startMinimized: e.target.checked });
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

document.getElementById("scanBtn").onclick = async () => {
  const out = document.getElementById("scanOut");
  const btn = document.getElementById("scanBtn");
  btn.disabled = true;
  out.textContent = "scansione in corso (può richiedere qualche minuto)...";
  try {
    const r = await api("/hub/discover", "POST", {});
    if (!r.ok) throw new Error(r.error || "errore");
    const lines = (r.results || []).map(x => `${x.provider}: +${x.added}${x.error ? ` (${x.error})` : ""}`);
    out.textContent = lines.length ? lines.join("\n") : "nessun provider scansionabile";
    poll();
  } catch (e) {
    out.textContent = "errore: " + e.message;
  } finally {
    btn.disabled = false;
  }
};

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

let flashTimer = null;
function flash(msg) {
  let el = document.getElementById("flash");
  if (!el) {
    el = document.createElement("div");
    el.id = "flash";
    el.style.cssText = "position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#1b2330;color:#cfe;border:1px solid #2a3a4a;padding:8px 14px;border-radius:8px;z-index:99;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.4);transition:opacity .3s";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.style.opacity = "0"; }, 1800);
}

// estende il rendering dei modelli con badge free / metadati / pulsante escludi
const _origRenderProviders = renderProviders;
function renderProvidersWithMeta(state) {
  if (typeof _origRenderProviders === "function") _origRenderProviders(state);
  const blacklist = (state && state.modelFilter && state.modelFilter.blacklist) || [];
  document.querySelectorAll(".model").forEach(row => {
    const id = row.dataset.id;
    if (!id) return;
    const m = (state.models || []).find(x => x.id === id);
    if (!m) return;
    const nameEl = row.querySelector(".mname");
    if (!nameEl) return;
    let badge = row.querySelector(".mf-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "mf-badge";
      nameEl.after(badge);
    }
    badge.textContent = m.isFree ? "FREE" : "PAID";
    badge.classList.toggle("free", !!m.isFree);
    badge.classList.toggle("paid", !m.isFree);
    let meta = row.querySelector(".mf-meta");
    if (!meta) {
      meta = document.createElement("span");
      meta.className = "mf-meta";
      nameEl.after(meta);
    }
    const mods = (m.modalities || []).join("/");
    meta.textContent = ` · ${m.contextLength ? (m.contextLength / 1000) + "k ctx" : ""} · ${m.architecture || "?"} · ${mods}`;
    if (!blacklist.includes(id)) {
      let btn = row.querySelector(".mf-exclude");
      if (!btn) {
        btn = document.createElement("button");
        btn.className = "btn danger mf-exclude";
        btn.textContent = "Escludi";
        btn.style.marginLeft = "6px";
        row.appendChild(btn);
      }
      btn.onclick = async () => {
        await api("/hub/model-filter/blacklist", "POST", { action: "add", id });
        poll();
      };
    }
  });
}
if (typeof window.renderProviders === "function") window.renderProviders = renderProvidersWithMeta;

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

setInterval(poll, 3000);
