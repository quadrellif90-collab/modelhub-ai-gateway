## [0.7.46] - 2026-09-03

### Fixed
- **Crash `postWithFailover`/`streamWithFailover`** in test/CLI contexts: `_activeReq` era `null` quando `postWithFailover` era richiamato direttamente (es. test, CLI `node server.js test`), causando `TypeError: Cannot read properties of null (reading '__fixedProfile')`. Ora null-safe.
- **`selectCandidates` non cadeva back al profilo `auto`** quando il sub-profile risolto dall'intent (es. `auto-fast`, `auto-code`, `auto-reasoning`) era vuoto: l'array vuoto `[]` è truthy e non faceva scattare il fallback `|| getProfiles().auto`, con conseguente nessun candidato e timeout dello streaming. Ora controlla esplicitamente la lunghezza.
- **`__setState` non sincronizzava `liveProfiles`**: la funzione di test non aggiornava `liveProfiles` (introdotto in 0.7.30 per non persistere i pool generati), così `getProfiles()` restituiva dati obsoleti. Ora chiama `rebuildProfiles()`.
- **Test `classify` per `deepseek-v3`**: il modello DeepSeek V3 è stato deliberatamente rimosso dalla classificazione reasoning in 0.7.44 (non è un modello dedicato al ragionamento; solo `deepseek-r1` lo è). Aggiornato il test con `deepseek-r1` (reasoning=true) e `deepseek-v3` (reasoning=false).

### Test results
- 40/40 test pass (prima 33/40, 7 fallimenti).
