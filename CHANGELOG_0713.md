## [0.7.13] - 2026-08-30

### Fixed
- **Bottone "Impostazioni" non funzionava**: `setWindowOpenHandler` in `main.js` bloccava (`deny`) ogni `window.open` tranne `modelhub://widget`. Il `settingsBtn` apriva `settings.html` e veniva silenziosamente bloccato. Ora `modelhub://settings` è instradato a `createSettingsWindow()` e i file `.html` locali vengono aperti come finestre Electron dedicate.
- **Widget embed nella finestra principale non si autenticava**: l'iframe `widget.html` non riceveva il token di controllo, così le sue chiamate API fallivano (widget "off"). Ora `index.html` passa `?t=<token>` all'iframe.

### Changed
- `settingsBtn` usa `window.open("modelhub://settings")` (instradato dal main).
- `setWindowOpenHandler` apre finestre per `settings.html`/`widget.html` locali.

### Security
- Nessuna API key/token nel repo (auth.json e prefs.json in .gitignore).
