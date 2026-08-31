## [0.7.30] - 2026-08-31

### Performance / persistenza
- **I 5 pool generati (`auto`, `auto-code`, `auto-reasoning`, `auto-fast`, `free-pool`) non sono più persistiti in `prefs.json`**: sono ricalcolati a ogni avvio da `rebuildProfiles()` e tenuti solo in memoria (`liveProfiles`). Prima venivano riscritti nel file a ogni poll → `prefs.json` arrivava a **272KB** e la scrittura era lenta + a rischio corruzione.
- Ora `prefs.json` pesa **~1KB** (solo impostazioni + profili personalizzati creati dall'utente). Scrittura molto più veloce e sicura.
- Aggiunto `getProfiles()` (helper unico) usato da tutte le API che leggono i profili, così stato/reorder/routing/esportazione vedono i pool generati anche se non persistiti.

### Verifica
- `prefs.json` AppData: 971 byte (era 102-272KB)
- State espone correttamente i 5 pool (liveProfiles)
- Test e2e 20/20, syntax OK
- EXE 0.7.30 installato, porta 200
