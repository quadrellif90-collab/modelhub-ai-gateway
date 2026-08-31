## [0.7.37] - 2026-08-31

### Feature: Endpoint Anthropic Messages API (`/v1/messages`)
- Aggiunto `POST /v1/messages` (Anthropic Messages API) per **claude-code** e tool Anthropic-native.
- Converte il body Anthropic (`system`, `messages`, `max_tokens`) → OpenAI e riusa `streamWithFailover` (con translator `anthropic` già presente) per lo streaming e `postWithFailover` per il non-stream.
- Risposta non-stream in formato Anthropic (`type:"message"`, `content:[{type:"text",text}]`, `usage` con `input_tokens`/`output_tokens`).
- Aggiunto `/v1/messages` a `OPEN_PATHS` (aperto su localhost, come `/v1/models`) → i tool non servono gateway key.
- Fix: `streamWithFailover`/`postWithFailover` referenziavano `req` fuori scope → introdotto `_activeReq` settato in `mainHandler`.
- Fix: rimosso doppio `res.writeHead` nel path stream (causava hang).

### Verifica (dal vivo)
- `/v1/messages` NON-stream su :8796 → `200`, formato Anthropic corretto (`text:"ciao"`)
- `/v1/messages` STREAM su :8796 → SSE Anthropic valido (`message_start` → `content_block_delta` → `content_block_stop`)
- Test e2e 20/20, syntax OK
- EXE 0.7.37 installato
