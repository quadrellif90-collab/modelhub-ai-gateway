## [0.7.32] - 2026-08-31

### Feature: Server dedicati per tool/agent
Esteso il sistema multi-server (da 0.7.31) in una gestione server dedicati completa:
- **Preset tool** con un click: `trae` (8791), `opencode` (8792), `codex` (8793), `kodu` (8794), `talkcody` (8795, profile auto-code), `ollama` (11434), `claude` (8796). Ogni preset crea un server con porta, profile e basePath preconfigurati.
- **Campi server**: `label` (nome friendly), `basePath` fisso (`/v1` per tool OpenAI-only, `/api` per Ollama-only, vuoto = entrambi). Il wrapper rifiuta (404) richieste fuori basePath.
- **UI migliorata** nel drawer "Server multipli": ogni server mostra URL copiabile (`http://127.0.0.1:PORTA/BASE/chat/completions`), stato (✓/✗), pulsanti copia/attiva/disattiva/rimuovi.
- API `/hub/servers` estesa: `action: preset`, normalizzazione campi (`label`, `basePath`, `enabled`).

### Verifica (dal vivo)
- Porte attive: 8787 (main), 8791 (Trae), 8792 (OpenCode), 8793 (Codex), 11434 (Ollama-like) → tutte 200 su `/v1/models`.
- basePath filtra: 8791 accetta `/v1/*` e rifiuta `/api/*` (404) ✓
- Test e2e 20/20, syntax OK
- EXE 0.7.32 installato
