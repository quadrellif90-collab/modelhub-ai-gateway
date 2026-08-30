## [0.7.16] - 2026-08-30

### Fixed (verificati con test reali)
- **"Compatta" non funzionava**: mancava il CSS `.providers.compact` → aggiunto (vista densa provider/modelli). Ora il toggle compatta davvero.
- **"Impostazioni non si salvavano"**: causa reale = `featuresCfg()` non esponeva `startMinimized` → la UI leggeva `undefined` e il checkbox non si spuntava. Ora `startMinimized` è persistito e riletto (testato: POST→state mostra `true`).
- **"Alcune doppie se hanno stesso fine"**: il drawer laterale duplicava i pannelli già presenti nella popup Impostazioni (Funzionalità, Filtri modelli, Impostazioni). Rimossi dal drawer → una sola fonte (popup Impostazioni).
- **Bug critico nascosto**: `app.js` referenziava ~20 id rimossi dal drawer (feat*, mf*, settingsSave, tokenRegen, set*) → `getElementById(...).onclick` su `null` → **crash di tutto lo script** → tutti i bottoni morti. Rimosso tutto il codice orfano; ora `app.js` non tocca id assenti.
- **Badge free/paid non si applicavano**: `renderProvidersWithMeta` cercava classi `.model-row`/`.model-name` inesistenti → corretto in `.model`/`.mname`. Ora i badge FREE/$ compaiono.

### Backup
- Tag `backup-pre-redesign-20260830-171227` + copie file su disco (invariate).
