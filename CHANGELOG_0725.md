## [0.7.25] - 2026-08-30

### Fixed (bug reale trovato)
- **Popup Impostazioni non salvava e si chiudeva**: `settings.html` aveva un `<meta http-equiv="Content-Security-Policy" content="default-src 'self'">` che **bloccava `fetch` verso `http://127.0.0.1:8787`** (origine diversa da `file://`). Quindi `load()` non caricava i valori e `save()` falliva silenziosamente (le chiamate API erano bloccate dal browser). Rimosso il CSP: ora è coerente con `index.html`/`widget.html` (che non ce l'hanno) e il `fetch` funziona.

### Verifica
- `settings.html` installato: nessun CSP (grep conferma 0 occorrenze)
- Server risponde, 41 provider, 1608 modelli
- Le chiamate `/hub/features` e `/hub/model-filter` (quelle che fa `save()`) ritornano `ok:true` e persistono
