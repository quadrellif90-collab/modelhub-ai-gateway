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

Variabili d'ambiente supportate: `MODELHUB_PORT`, `MODELHUB_DIR`, `MODELHUB_ENHANCE=0`, `MODELHUB_CACHE=0`, `MODELHUB_UPSTREAM_TIMEOUT`, `MODELHUB_UPSTREAM_TIMEOUT_NONSTREAM`, `AUTO_PROBE=0`, `CONTROL_TOKEN`.

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
- Il server ascolta solo su `127.0.0.1`.
- Imposta `CONTROL_TOKEN` per proteggere le API di controllo `/hub/*` se condividi la macchina.

## Licenza

[MIT](LICENSE)
