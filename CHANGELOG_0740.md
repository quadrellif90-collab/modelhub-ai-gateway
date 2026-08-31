## [0.7.40] - 2026-08-31

### Fix: porta principale dell'hub ora persistita e applicata
Risolti due bug segnalati:
1. **"Le impostazioni non si salvano se cambio porta"** — il campo `port` nelle Impostazioni veniva caricato ma MAI inviato al server. Aggiunto endpoint `POST /hub/port` e il `save()` delle Impostazioni ora lo invia (`prefs.port`).
2. **"L'hub mi dice ancora 8787"** — la porta principale era hardcoded (`const PORT = 8787`) e ignorava `prefs.port`. Ora `PORT` è `let` e viene aggiornata da `prefs.port` all'avvio (se valida 1024-65535), con precedenza su 8787 ma non su `MODELHUB_PORT` (env). `config.port`, `controlState().port` e `/hub/servers mainPort` riflettono la porta reale.

### Comportamento
- Cambi porta nelle Impostazioni → si salva in `prefs.port` → **riavvia l'app** → l'hub si apre sulla nuova porta.
- Se la nuova porta coincide con un server multi-porta esistente, quel server viene saltato (già coperto dalla principale).
- I server multipli (Trae/OpenCode/Codex/Claude/Ollama) restano sulle loro porte dedicate.

### Verifica (dal vivo)
- `prefs.port=8791` → hub si apre su 8791, 8787 LIBERA, `controlState.port=8791`, `/hub/servers mainPort=8791` ✅
- Ripristino `prefs.port` rimosso → hub torna su 8787 ✅
- Test e2e 20/20, syntax OK, EXE 0.7.40 installato
