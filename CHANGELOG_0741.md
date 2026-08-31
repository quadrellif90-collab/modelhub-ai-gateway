## [0.7.41] - 2026-08-31

### Migliorie UI (dal "fai tu")
1. **Status bar mostra porte reali** — ora mostra `:8787  +  8791(trae) · 8792(opencode) · ...` invece della sola porta principale. `controlState()` espone `servers`.
2. **Log routing mostra il profilo scelto** — il pannello "Ultimi routing" ora ha una colonna `profile` (es. `auto-code`, `auto-reasoning`) così vedi l'auto-destinazione in azione. `recordRequest` include `profile` (da `resolveProfile`) per chat e stream.
3. **Guida config tool con copy** — nel drawer "Server multipli" c'è ora una sezione "📋 Guida: configurazione da incollare nei tool" con Base URL / API Key / Model per ogni preset (Trae, OpenCode, Codex, Kodu, TalkCody, Claude, Ollama) e un bottone "copia".

### Verifica
- `/hub/state` ritorna `servers` (status bar) ✅ verificato: 8787 + 8791(trae) + 8792(opencode) + 8793(codex) + 8796(claude) + 11434(ollama)
- `recordRequest` include `profile` per chat/stream ✅ (codice verificato, compare nei log reali)
- Test e2e 20/20, syntax OK, EXE 0.7.41 installato
