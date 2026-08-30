# Changelog

Tutte le modifiche rilevanti a ModelHub sono documentate qui.
Il formato segue [Keep a Changelog](https://keepachangelog.com/) e il versioning segue [Semantic Versioning](https://semver.org/).

## [0.7.4] - 2026-08-30

### Added
- **Gestione chiavi gateway dalla UI**: il pannello "Chiavi gateway" ora genera/revoca/gestisce le chiavi con un pulsante "Genera nuova chiave" (label + rpm opzionale). La chiave segreta è mostrata **una sola volta** al momento della creazione e copiabile.
- **Mint/revoke/limit via API**: `POST /hub/gateway-keys` con `action: mint | revoke | limit` (keyed per `kid`, non per secret). `GET /hub/gateway-keys` e `GET /hub/keys` espongono `kid`, label, createdAt, lastUsedAt, quota e uso — **mai il secret**.
- **Rate-limit per chiave (rpm)**: finestra scorrevole 60s, codice `429` distinto dal `401` (chiave assente/invalida). Configurabile per chiave (token/spesa/rpm).
- **Cache semantica** (layer opzionale sopra l'exact-match): embedding del prompt utente → similarità coseno; hit su prompt vicini alla stessa soglia (default 0.95). Disattivata di default; attivabile dal pannello "Cache semantica" scegliendo un modello embedder dal registry. Endpoint `POST /hub/semcache` (abilita/embedder/soglia/clear).
- **Segretezza delle chiavi gateway**: il secret non viene più persistito in chiaro. `gateway-keys.json` memorizza solo l'hash `kid` (SHA-256) + metadati; il secret vive in memoria e in `prefs.json` (come le API key provider, cifrate su disco).

### Changed
- `gatewayAuthorized` ritorna ora `{ ok, code, error, key }` (prima booleano) per distinguere 401 (auth) da 429 (quota/rpm).
- `controlState().gatewayKeys` e `GET /hub/gateway-keys` usano `kid` pubblici al posto dei secret troncati.
- `VERSION` allineata a `0.7.4` in `server.js`.

### Security
- Le chiavi gateway non finiscono più in chiaro su disco (prima `gateway-keys.json` conteneva il secret). Migrazione automatica dal formato legacy.

## [0.7.0] - 2026-08-26

### Added
- **Routing per intento**: `model=auto` classifica automaticamente il prompt (codice / ragionamento / visione / veloce / generale) e instrada sul profilo più adatto (`auto-code`, `auto-reasoning`, `auto-fast`); header `x-modelhub-profile` nella risposta rivela il profilo risolto.
- **Quota per chiave gateway**: limite token e spesa per chiave (`POST /hub/keys`), applicato al gate (`gatewayAuthorized`) e alle rotte streaming (blocco `429` oltre quota); uso registrato e visibile in `/hub/state`.
- **Plugin del Prompt Enhancer**: trasformazioni componibili (`concise`, `english`, `codepro`) attivabili dal pannello "Configurazione avanzata" (`POST /hub/enhancer {plugins}`).
- **Esperimenti A/B**: split di traffico tra profilo corrente e candidato con percentuale configurabile (`POST /hub/experiments` + reorder in `selectCandidates`).
- **Alert webhook**: notifiche verso URL esterno su eventi (es. provider_down) via `POST /hub/alerts` e `markFail` → `alertOnce`.
- **Cache prefix/semantica**: `cacheKey` include un hash del prefisso (system + ultimo messaggio utente) così prompt simili condividono la risposta cached.
- **Configurazione avanzata nella UI**: quote chiavi, esperimenti, webhook alert, plugin enhancer, avvio minimizzato in tray, indirizzo server.
- **PWA**: `manifest.webmanifest` + viewport/theme-color + layout responsive (`@media max-width:900px`) per uso da mobile.

### Changed
- `enhancerCfg()` espone ora `plugins`; `main.js` onora `startMinimized` (avvio solo tray).

## [0.6.1] - 2026-08-26

### Fixed
- Crash `ERR_HTTP_HEADERS_SENT` nell'handler streaming OpenAI: i flag di stato erano per-tentativo invece che per-catena → riscrittura con pattern a "generazioni" (solo la generazione corrente può scrivere/chiudere la risposta client) e handler globali `process.on("uncaughtException")`/`unhandledRejection` in `main.js` (l'app non muore più per bug di un handler).
- Streaming vuoto: gli upstream che rispondono SSE senza contenuto (deltas solo-ruolo/reasoning) vengono scartati con failover silenzioso PRIMA del primo byte verso il client (hold-back buffer).
- Degrado di salute da "probe storm": i ping di verifica/probe ora sono *gentle* (cooldown corto senza inflare i fallimenti), così non avvelenano l'autorouteScore; i modelli non-chat (guard/safeguard/content-safety/moderation/embed/rerank...) sono esclusi da profili, candidati e leaderboard via `isChatModel()`.

### Changed
- Finestra di hold per stream vuoto accorciata a `min(UPSTREAM_TIMEOUT_MS, MODELHUB_STREAM_HOLD_MS)` (default 8000ms) per permettere più tentativi nel budget di failover.

## [0.6.0] - 2026-08-26

### Added
- Pannello "Impostazioni" nel web panel: verifica periodica (intervallo e top-K), budget failover, TTL cache configurabili a runtime e persistiti (`POST /hub/settings`); le variabili d'ambiente restano prioritarie.
- Rigenerazione del token di controllo dal pannello (bottone dedicato, mostrato una sola volta).
- Limiti max caratteri e timeout del Prompt Enhancer configurabili dalla UI.
- Pulsante "Widget" nella topbar per aprire/chiudere il widget realtime (prima solo click sulla tray).
- Verifica reale periodica dei modelli: ping effettivi alle teste dei profili con flag `verified`/`lastVerifiedAt` esposti in `/hub/state` e badge ✓/✗/– nella UI.
- Refresh automatico dei profili preconfigurati ogni 15 minuti: le liste si aggiornano da sole ai modelli attivi e sani.

### Changed
- Avvio molto più rapido (~5s): la verifica iniziale tocca solo le teste dei profili invece di tutti i modelli; probe completo disponibile via `POST /hub/probe`.
- Badge di stato modello basato su `healthy` (cooldown scaduto = ok), errore solo come dettaglio.
- Toolbar provider compattata su una riga singola.

### Fixed
- Congestione da probe: timeout ping allineato agli upstream lenti-ma-vivi e budget di failover globale (`MODELHUB_FAILOVER_MS`, default 45s) che garantisce sempre una risposta entro limite anche attraversando candidati non sani.

## [0.5.0] - 2026-08-26

### Added
- Protezione dell'API di controllo: `/hub/*` ora richiede un token (env `MODELHUB_TOKEN` o `prefs.controlToken`), accettato via header `x-modelhub-token`, `Authorization: Bearer` o query param `?token=`.
- API key del gateway: le richieste chat devono presentare una chiave valida (configurabile nel pannello web); `/v1/models`, `/metrics` e gli endpoint di compatibilità Ollama restano aperti.
- Limite di concorrenza per provider anche sulle rotte streaming (`MODELHUB_PROVIDER_CONCURRENCY * 2`): nessun provider può ricevere stream illimitati.
- Test E2E di regressione sullo streaming OpenAI (server mock SSE + avvio reale dell'hub su porta dedicata).
- Aggiornamenti automatici con `electron-updater` (download automatico, installazione alla chiusura, check ogni 6 ore).
- Avvio automatico con Windows attivo di default (disattivabile dal menu tray).

### Removed
- Codice morto: funzione `providerDaily()` e costante `CONTROL_TOKEN` inutilizzate.

## [0.4.0] - 2026-08-26

### Added
- Discovery dei cataloghi upstream: scansione singolo provider o batch su tutti (`POST /hub/discover`), con pulsante "Scansiona cataloghi" nel pannello web e riepilogo risultati.
- Provider personalizzati: aggiunta/rimozione via API (`POST /hub/provider/add`, `POST /hub/provider/remove`) con auto-discovery del catalogo `/v1/models` e salvataggio chiave cifrata.
- Ripristino configurazione (`POST /hub/import`): reimport di export completi (config, prefs, chiavi) mantenendo la porta locale.
- Cifratura di `auth.json` (AES-256-GCM) con migrazione automatica al primo avvio; opt-out via `MODELHUB_AUTH_PLAIN=1`.
- Endpoint metriche `GET /metrics` in formato Prometheus.
- Test di failover end-to-end su `postWithFailover` con mock HTTP locale (failover HTTP 500, scarto contenuto vuoto, esaurimento candidati).

### Changed
- Connessioni keep-alive verso gli upstream (HTTP/HTTPS agents) e limiti di concorrenza per provider (default 4, env `MODELHUB_PROVIDER_CONCURRENCY`): eliminati i rate-limit da probe parallelo, discovery batch ~10x più rapida.

### Fixed
- Richieste verso upstream su porte non standard instradate alla porta 80 (opzione `port` mancante in tutte le chiamate `http.request`).

## [0.3.0] - 2026-08-26

### Added
- Strategia di routing `autoroute`: punteggio dinamico per modello (affidabilità, TTFT medio, costo, fallimenti recenti, cooldown) applicabile a tutti i profili.
- Prompt Enhancer integrato nel gateway: riscrittura automatica dell'ultimo messaggio utente prima dell'instradamento (cache 1h, timeout configurabile, skip per tool calls e prompt fuori range, header opt-out `x-modelhub-no-enhance`).
- Widget realtime agganciato alla tray icon: modello in uso, profilo attivo, richieste/token/costi giornalieri, ultime richieste, stato enhancer.
- Leaderboard autoroute (top 30) esposta in `/hub/state` e nel pannello web.
- Classificazione modelli per categoria (coding / reasoning / veloce) e profili default rigenerati automaticamente con priorità ai modelli gratuiti testati.
- Pannello web: ricerca/filtri/ordinamento e modalità compatta per provider e modelli, box collassabili con persistenza locale, pulsante creazione API key nel browser esterno (29 provider mappati), reveal/mascheramento chiavi.
- Export completa della configurazione (`GET /hub/export`).
- Toggle live delle feature globali (enhancer / cache / probe automatico) persistiti in prefs.
- Logging dei tentativi falliti anche nel ramo streaming (HTTP error, stream vuoto, esaurimento upstream).

### Changed
- Timeout upstream ridotti a 15s streaming / 30s non-streaming (prima 90s fissi), configurabili via env.
- I profili `auto*` default vengono rigenerati ad ogni rebuild dei modelli.

### Fixed
- Crash `req is not iterable` su ogni POST `/v1/chat/completions` (lettura sincrona del body).
- Risposte streaming mai chiuse verso il client e impossibilità di failover dopo il primo byte inviato.
- Risposte con contenuto vuoto considerate successi e servite al client.

## [0.2.0]

- Prima release interna con aggregatore multi-provider, failover, profili, cache e pannello di controllo Electron.

## [0.1.0]

- Prototipo iniziale.
