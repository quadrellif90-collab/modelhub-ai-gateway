# ModelHub — AI Gateway

**Un gateway AI locale che unifica 34 provider e oltre 1.300 modelli dietro un unico endpoint compatibile OpenAI, con autorouting intelligente, miglioramento automatico dei prompt e widget realtime.**

ModelHub è un'app desktop (Electron) che espone un server HTTP locale sulla porta `8787`. Configuri una sola volta i provider che vuoi usare (chiavi gratuite o a pagamento) e punti qualsiasi client OpenAI-compatible (opencode, Cursor, VS Code extensions, script, curl...) su:

```
http://127.0.0.1:8787/v1
```

## Caratteristiche

- **Autorouting**: ogni richiesta viene instradata al modello migliore disponibile in tempo reale, con punteggio dinamico basato su affidabilità storica, latenza (TTFT), costo e fallimenti recenti. Se un modello è giù o risponde male, la richiesta passa automaticamente al successivo.
- **Profili per scopo**: `auto` (generale), `auto-code`, `auto-reasoning`, `auto-fast`, `free-pool` — rigenerati automaticamente con in testa i modelli gratuiti testati ed efficienti per la categoria.
- **Prompt Enhancer integrato**: opzionalmente ogni prompt viene riscritto e chiarito da un modello scelto da te prima dell'esecuzione (skippabile via header `x-modelhub-no-enhance`, disattivabile dalla UI).
- **Failover robusto**: retry sequenziale sugli upstream sani, timeout per-attempt configurabili, scarto delle risposte vuote, rate-limit detection.
- **Widget realtime**: pannello sempre visibile agganciato alla tray icon con modello in uso, profilo attivo, richieste/token/costi del giorno e ultime richieste.
- **Pannello di controllo web**: gestione provider e modelli (ricerca, filtri, ordinamento, modalità compatta, box collassabili), creazione guidata API key nel browser esterno, reveal/mascheramento chiavi, export completa della configurazione, toggle feature live (enhancer / cache / probe).
- **Cache risposte** con TTL, **probe automatico** periodico dello stato di salute degli upstream.
- **Routing per intento** (v0.7.0): `model=auto` classifica il prompt (codice/ragionamento/visione/veloce) e instrada sul profilo giusto; header `x-modelhub-model` / `x-modelhub-profile` rivelano modello e profilo risolti.
- **Quota per chiave gateway** (v0.7.0): limite token/spesa per chiave, blocco oltre quota, uso visibile in `/hub/state`.
- **Plugin del Prompt Enhancer** (v0.7.0): trasformazioni componibili (`concise`, `english`, `codepro`).
- **Esperimenti A/B** (v0.7.0) e **alert webhook** su eventi (es. provider down).
- **PWA / responsive** (v0.7.0): manifest, viewport e layout mobile per usare il pannello da smartphone.

## Installazione

Requisiti: [Node.js](https://nodejs.org) 20+.

```bash
git clone https://github.com/quadrellif90-collab/modelhub-ai-gateway.git
cd modelhub-ai-gateway
npm install
npm start          # avvia l'app desktop (tray + pannello)
npm run server     # alternativa headless, solo il gateway
```

Build native per Windows / macOS / Linux: scarica gli artefatti dalla sezione [Releases](https://github.com/quadrellif90-collab/modelhub-ai-gateway/releases), oppure compila localmente con `npm run dist`.

## Configurazione rapida

1. Avvia l'app → si apre il pannello di controllo (`http://127.0.0.1:8787/hub`).
2. Scegli un provider, premi **🔑↗** per creare la API key nel browser, poi incollala nel campo key.
3. Attiva i modelli che vuoi nel pool; i profili `auto*` si popolano da soli.
4. Punta il tuo client su `http://127.0.0.1:8787/v1` (API key del gateway facoltativa).

### Esempio (curl)

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello!"}],"stream":true}'
```

## Endpoint principali

| Endpoint | Descrizione |
|---|---|
| `POST /v1/chat/completions` | Chat OpenAI-compatible (stream e non) |
| `GET /v1/models` | Modelli disponibili |
| `GET /hub/state` | Stato completo: provider, modelli, profili, leaderboard, enhancer, features |
| `GET /hub/export` | Export JSON completa (config + preferenze + chiavi) |
| `POST /hub/enhancer` | Configura il prompt enhancer (enabled/model/maxChars/timeoutMs) |
| `POST /hub/features` | Toggle cache e probe automatico |
| `POST /hub/key/reveal` | Rivela una API key salvata |
| `POST /hub/gateway-keys` | Gestione chiavi gateway: `action: mint \| revoke \| limit` (mint ritorna il secret una sola volta; limit accetta `kid`, `tokens`, `spend`, `rpm`) |
| `GET /hub/gateway-keys` | Elenco chiavi (kid, label, quota, uso) — mai il secret |
| `POST /hub/semcache` | Cache semantica: `{enabled, embedder, threshold}` o `{action:"clear"}` |

Variabili d'ambiente supportate: `MODELHUB_PORT`, `MODELHUB_DIR`, `MODELHUB_ENHANCE=0`, `MODELHUB_CACHE=0`, `MODELHUB_UPSTREAM_TIMEOUT`, `MODELHUB_UPSTREAM_TIMEOUT_NONSTREAM`, `AUTO_PROBE=0`, `CONTROL_TOKEN`, `MODELHUB_SEM_THRESHOLD` (soglia 0-100, default 95), `MODELHUB_SEM_MAX` (default 200), `MODELHUB_SEM_TTL` (ms, default 600000).

## Architettura

```
main.js            Electron: finestra pannello, tray icon, widget realtime
server.js          Gateway HTTP: routing, failover, enhance, cache, control API
renderer/          UI web (pannello + widget)
config.json        Catalogo provider/modelli (senza segreti)
auth.json          Chiavi cifrate AES-256-GCM (mai nella repo)
prefs.json         Preferenze runtime (profili, strategie, feature)
```

## Sicurezza

- Le API key sono cifrate su disco (AES-256-GCM) e non lasciano mai la tua macchina: tutto il traffico passa dal processo locale verso i provider.
- Le chiavi gateway sono identificate solo tramite hash pubblico (`kid`, SHA-256); il secret è mostrato una sola volta alla creazione e non viene mai persistito in chiaro su `gateway-keys.json` (che contiene solo `kid` + metadati).
- Il server ascolta solo su `127.0.0.1`.
- Dalla v0.5.0 le API di controllo `/hub/*` richiedono un token (`MODELHUB_TOKEN` env oppure `controlToken` in prefs) e le richieste chat richiedono una API key del gateway (configurabile nel pannello web). Il widget e il pannello web ricevono il token automaticamente.

## English summary

**ModelHub** is a local AI gateway and tray app: one OpenAI-compatible endpoint (`http://127.0.0.1:8787/v1`) that routes your requests across 30+ providers and 1000+ models with automatic failover, health probing, response caching, usage/cost tracking, and a built-in prompt enhancer. Profiles (`auto`, `auto-code`, `auto-reasoning`, `auto-fast`, `free-pool`) are auto-ranked by reliability and latency, preferring free models that actually work.

```bash
npm install
npm start        # tray icon + web panel at http://127.0.0.1:8787
```

Point any OpenAI client at `http://127.0.0.1:8787/v1` (model: `auto`). Control API under `/hub/*` is token-protected; set `MODELHUB_TOKEN` to lock it down. Downloads on the [releases page](../../releases).

## Licenza

[MIT](LICENSE)
