## [0.7.9] - 2026-08-30

### Fixed
- **Profili non cambiavano nella UI**: `renderProfiles` sovrascriveva `selectedProfile` dal `sel.value` ad ogni `poll()` (ogni 3s), annullando la scelta dell'utente e mostrando sempre la stessa lista. Ora `selectedProfile` è mantenuto tra i poll e persistito in `localStorage`.
- **Profili specializzati identici ad `auto`**: `rebuildProfiles` riempiva `auto-code`/`auto-reasoning`/`auto-fast`/`free-pool` con TUTTI i modelli abilitati (solo riordinati), rendendoli visivamente identici. Ora i profili specializzati contengono SOLO i modelli pertinenti (strict mode): `auto-code` = solo modelli code, `free-pool` = solo free, ecc.

### Added
- **Test e2e automatico** (`test/e2e-profiles.js`): verifica state, profili diversi, reorder persistito, model-filter, gateway keys mint/revoke, strategie. 16/16 pass.

### Security
- Nessuna API key/token nel repo (auth.json e prefs.json in .gitignore).
