# Changelog

Tutte le modifiche rilevanti a ModelHub sono documentate qui.
Il formato segue [Keep a Changelog](https://keepachangelog.com/) e il versioning segue [Semantic Versioning](https://semver.org/).

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
