## [0.7.11] - 2026-08-30

### Fixed
- **Profili specializzati erano copie identiche di `auto`**: `rebuildProfiles` usava `catFirst()` che solo riordinava (code primi, poi tutti gli altri), così `auto-code`/`auto-reasoning`/`auto-fast` contenevano TUTTI i modelli e apparivano "sempre gli stessi" nella UI. Ora i profili specializzati contengono SOLO i modelli della categoria (`auto-code` = modelli code, `auto-reasoning` = reasoning, `auto-fast` = fast) — sottoinsiemi reali e distinti.
- **Selezione profilo UI resettata dal poll** (fix 0.7.9): `renderProfiles` non sovrascrive più `selectedProfile` ad ogni `poll()`, e lo persiste in `localStorage`.

### Added
- **Test e2e automatico** (`test/e2e-profiles.js`): 20/20 verifiche (state, profili sottoinsiemi diversi, reorder persistito, model-filter, gateway mint/revoke, strategie).
