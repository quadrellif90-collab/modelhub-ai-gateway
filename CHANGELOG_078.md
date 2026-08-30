## [0.7.8] - 2026-08-30

### Added
- **41 provider totali** (da 34): aggiunti Ofox (140 modelli, 62 free-tier) + DeepInfra, Lepton, Scaleway, Lambda Labs, NanoGPT, Replicate (free-tier configurabili).
- **Model filter completo**: `excludePaid`, `freeProvidersOnly`, `autoExcludeNonFree`, `blacklist`, `whitelist` — applicati in `rebuildModels()` e persistiti via API `/hub/model-filter`.
- **Smart fallback su 429**: router passa automaticamente a un modello libero con stessa architettura/contesto.
- **Metadati modelli arricchiti**: `isFree`, `contextLength`, `architecture`, `modalities`, `updatedAt`, `freeLimit` (visibili in UI con badge FREE/PAID).
- **Pannello "Filtri modelli"** nella UI + badge e pulsante "Escludi" per riga.
- **Toggle tema** dark/light persistito.
- **Auto-correzione**: modelli marcati free che rispondono 402/403 vengono riclassificati paid e disabilitati automaticamente.

### Fixed
- **EXE non avviato**: `main.js` faceva `require(server.js)` da `MODELHUB_DIR` (cartella dati) invece che da `__dirname` (cartella app) — l'EXE crashava silenziosamente e non caricava le chiavi. Ora fisso.
- **Avvio lento/morto**: porta ora bind immediato, verifica modelli in background.
- **Finestra non visibile** (TDZ `launchedAtLogin`) risolto in 0.7.5.
- **Segreto in chiaro**: `gateway-keys.json` salva solo hash `kid` SHA-256.

### Security
- Nessuna API key/token nel repo (auth.json e prefs.json in .gitignore).
- Chiavi gateway: hash SHA-256, segreto mai in chiaro su disco.
