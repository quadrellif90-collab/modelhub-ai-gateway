## [0.7.24] - 2026-08-30

### Fixed
- **Menu Impostazioni ora si apre**: il bottone "Impostazioni" usava `window.open("modelhub://settings")` (scheme custom non gestito bene da `window.open` → la popup non si apriva). Ora usa `window.open("settings.html")` intercettato da `setWindowOpenHandler` → `createSettingsWindow()`. Più affidabile.
- **Finestra principale sempre visibile**: `createWindow` ora mostra la finestra via `ready-to-show` (invece di `show:false` + `setTimeout` ridondante). Aggiunti log di errore renderer (`ui_errors.log`) per diagnostica.

### Verifica dati (NON spariti)
- `auth.json`: 2293 byte (intatto, cifrato)
- `config.json`: 172 KB (41 provider, ~1600 modelli)
- Server risponde: 41 provider, 1603 modelli
- I dati non sono mai stati cancellati: il problema era che l'app sembrava vuota perché il processo era morto (avviato da tool/terminale e poi chiuso). Avviare con **doppio clic sull'EXE** o dalla tray.
