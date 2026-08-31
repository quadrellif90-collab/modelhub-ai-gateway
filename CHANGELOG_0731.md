## [0.7.31] - 2026-08-31

### Feature: Server multipli su porte diverse
- Aggiunto `prefs.servers` (array di `{ name, port, profile, enabled }`) → l'hub espone N server HTTP sulle porte configurate, ciascuno che replica l'API principale (OpenAI-compatible `/v1/*` + Ollama-compatible `/api/*`).
- Se un server ha `profile` impostato, FORZA quel profile su quella porta (es. porta 8791 = solo `auto-code`).
- API: `GET/POST /hub/servers` (add/remove/toggle/set). UI nel drawer "Server multipli (porte)".
- **Riavvio richiesto** dopo aver aggiunto/rimosso porte (i `listen` partono all'avvio).

### Verifica
- Aggiunto server su :11434 → dopo riavvio risponde `200` sia su `/api/tags` (Ollama) che `/v1/models` (OpenAI), 1613 modelli esposti.
- Test e2e 20/20, syntax OK
- EXE 0.7.31 installato
