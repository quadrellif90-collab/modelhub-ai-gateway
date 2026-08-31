## [0.7.43] - 2026-08-31

### Fix: "failover timeout" (502) su Trae / modelli free instabili
Il sintomo: `{"error":"failover timeout"}` (HTTP 502) a intermittenza su Trae — alcune richieste andavano, altre no. Causa: il profilo `auto`/`auto-code` pesca modelli free spesso lenti/morti; il failover aspettava che il singolo upstream andasse in timeout (60s) prima di provare il successivo, esaurendo il budget (45s) → 502.

Tre fix nel path streaming chat/completions:
1. **Budget failover 45s → 90s** (`failoverMs` default) — più margine per provare più modelli.
2. **Skip modelli già failati** durante la catena di failover — se un candidato è marcato `failUntil > now`, viene saltato subito invece di rifare la richiesta.
3. **TTFT-giveup (20s)** — se un candidato non emette il primo token entro `TTFT_GIVEUP_MS`, il failover lo abbandona (`req.destroy()`) e passa al successivo, senza aspettare il timeout upstream completo. Se il primo token arriva, il watchdog viene cancellato (nessun troncamento dell'output buono).

Configurabile via env: `MODELHUB_FAILOVER_MS`, `MODELHUB_TTFT_GIVEUP`.

### Verifica
- Syntax OK, test e2e 20/20
- EXE 0.7.43 installato, tutti i server multipli (8787/8791/8792/8793/8796/11434) su 200
- Logica failover verificata a livello di codice (il test end-to-end richiede richieste reali con gateway key)
