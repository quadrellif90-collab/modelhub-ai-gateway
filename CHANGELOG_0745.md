## [0.7.45] - 2026-08-31

### Rimozione
- **Puter GLM** rimosso dal preset server (era inutile). La porta 8797 è libera.

### Pulizia
- **Log reqlog odierno eliminato** (svuotato per ripartire pulito).
- Release consolidata dopo le modifiche precedenti (TTFT giveup, failover, enhancer off, ecc.).

### Cosa resta
- 7 preset server: trae (8791), opencode (8792), codex (8793), kodu (8794), talkcody (8795), claude (8796), ollama (11434).
- Enhancer disabilitato di default.
- Failover ottimizzato (TTFT giveup 20s, budget 90s, skip modelli già fallati).
- Status bar porte reali, log routing profile, porta principale persistita.
