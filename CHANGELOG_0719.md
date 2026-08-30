## [0.7.21] - 2026-08-30

### Fixed (verificati con test reali)
- **Impostazioni non salvavano (Smart fallback)**: il backend `/hub/features` NON salvava `smartFallback` → il toggle "Smart fallback su 429" nella popup non persisteva. Ora salvato (testato: POST → state mostra `true`).
- **Popup Impostazioni fragile**: `save()` non verificava i risultati delle API e diceva "✓ Salvato" anche se falliva; inoltre `localStorage.setItem` non protetto poteva crashare la funzione (finestra sembrava "morta"). Ora `save()` cattura errori, verifica i risultati e mostra "Errore salvataggio" in rosso se qualcosa fallisce. Rimosso il bottone "Apri pannello" (confusionario).
- **`startMinimized`** ora salvato in un unico POST (prima era un secondo POST separato che poteva fallire).
- **`prefs.json` corrotto** (0 byte) riparato a `{}`.
- **main.js**: finestra principale mostrata correttamente (`show:false` + `setTimeout(showWindow, 600)` ripristinato, che funzionava).

### Nota importante per l'utente
L'app va avviata con **doppio clic sull'EXE** (o dalla tray), non via terminale/tool: quando un processo "muore", la finestra sparisce ma il server resta attivo (porta 8787 ancora risponde) → l'app sembra "morta" ma gira. Se la finestra non appare, clicca l'icona nella tray (barra in basso a destra).
