# ModelHub 0.7.28

## Fix: profili specializzati reali (auto-code / auto-reasoning / auto-fast)
- `server/models.js`: `classify()` riscritta con pattern mirati. Prima le sottostringhe
  `minimax-m2`, `kimi-k2`, `deepseek-v3`, `glm-4-5`, `70b-instruct`, `gemma2` causavano
  falsi positivi -> auto-code/auto-reasoning/auto-fast erano alias del pool intero (1586 modelli).
- `server.js` `rebuildProfiles()`: i 4 pool specializzati sono ORA sempre rigenerati dalla
  categoria corrente (forceRegen), ignorando gli array persistiti in prefs.json. Altrimenti una
  vecchia classifica "incollata" in prefs.json rimaneva anche dopo la fix di classify().
- Risultato (0.7.28): auto-code=107, auto-reasoning=152, auto-fast=314, tutti sottoinsiemi reali di auto.
