## [0.7.44] - 2026-08-31

### Nuovi preset server
- **Puter GLM** (porta 8797, profile `auto`, basePath `/v1`) — per API Puter GLM gratuite. Inserisci la tua API key in "Aggiungi provider".

### Nuovo endpoint claude-messages
- **Claude Messages** (porta 8796, profile `auto`, basePath `/v1/messages`) — per Claude Code nativo tramite Anthropic. Usa lo stesso server di Claude (8796) con path diverso.

### Bug fix + miglioramenti
- **Failover timeout 502 ridotto** — aumentato `failoverMs` default da 45s a 90s, skip modelli già failati, TTFT giveup 20s per passare ai successivi.
- **Status bar mostra porte reali** — mostra anche i server multipli attivi.
- **Log routing mostra profile** — colonna profile nell'Ultimi routing.
- **Porta principale persistita** — `prefs.port` si salva e l'app si apre sulla porta impostata.

### Enhancer
- **Disabilitato di default** — i modelli free spesso falliscono o variano a causa di limiti quota/rate. Riabilitalo in Impostazioni se serve.