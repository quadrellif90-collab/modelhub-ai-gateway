## [0.7.29] - 2026-08-31

### Deep scan — bug corretti
- **[CRITICO] Corruzione prefs.json → perdita impostazioni**: `writeJSON` scriveva il file direttamente (non atomico). Se il processo moriva a metà scrittura, `prefs.json` diventava corrotto (0 byte / troncato) → al riavvio `JSON.parse` falliva → `prefs = {}` → **perdevi tutte le impostazioni**. Ora scrive su `.tmp` + `renameSync` (rinomina atomica).
- **autoStart non cablato nella popup Impostazioni**: la checkbox "Avvio automatico a login" esisteva ma `save()` non la leggeva e il backend non la applicava. Ora `save()` invia `autoStart`, il backend chiama `setAutoStart` (via `global.__setAutoStart`), e `load()` la ripristina.
- **Avvio automatico forzato**: `main.js` chiamava `setAutoStart(true)` a OGNI avvio, ignorando la scelta dell'utente. Rimosso: ora rispetta la preferenza (gestita dalla tray).

### Sicurezza / pulizia repo
- `decrypt-auth.js` (strumento di decifratura delle chiavi gateway) **rimosso dal tracking** + aggiunto a `.gitignore`
- Backup spuri (`*.backup.20260830.*`) e `test/tmp_chk/` **rimossi dal tracking**
- `config.json` (499KB, dati provider) resta tracked (necessario per build/test, non contiene segreti)

### Verifica
- Syntax OK, test e2e 20/20
- EXE 0.7.29 installato, porta 200
