## [0.7.38] - 2026-08-31

### Feature: Intent detection evoluta (IT + EN)
Riscritta `classifyPrompt` in `server/models.js` per il routing automatico del profilo `auto`:
- **Code**: pattern multilingua IT/EN (codice, framework, linguaggi, "scrivi/crea/fixa/refactorizza una funzione/classe/script/query", code fence, sorgente), anche con contesto dei messaggi precedenti.
- **Reasoning**: analisi, spiegazione, confronto, "perché/quale differenza/trade-off/come funziona", in italiano completo.
- **Creative/Writing**: poesia, articolo, email, traduci, riassumi, copywriting.
- **Vision**: immagine + azione (descrivi/leggi/estrai).
- **Data**: csv/json/tabella/sql/group by/statistica.
- **Fast**: prompt brevi (<60 char) non classificabili altrove.
- Contesto multi-messaggio: analizza anche gli ultimi messaggi della cronologia.
- `resolveProfile` passa ora `messages` a `classifyPrompt` e gestisce `vision`/`creative`/`data`.

### Verifica
- `classifyPrompt` testato dal vivo (Node) su 10+ prompt IT/EN → profili corretti (auto-code / auto-reasoning / auto-fast / auto-creative / auto-vision / auto-data).
- Test e2e 20/20, syntax OK
- EXE 0.7.38 installato
