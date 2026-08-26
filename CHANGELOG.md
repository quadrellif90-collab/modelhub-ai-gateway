# Changelog

Tutte le modifiche rilevanti a ModelHub sono documentate qui.
Il formato segue [Keep a Changelog](https://keepachangelog.com/) e il versioning segue [Semantic Versioning](https://semver.org/).

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
