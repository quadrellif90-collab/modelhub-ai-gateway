## [0.7.15] - 2026-08-30

### Fixed
- **"Avvio ridotto" non persisteva/non funzionava**: `main.js` nascondeva la finestra all'avvio SOLO se `launchedAtLogin` era true. Ora `startMinimized` è rispettato SEMPRE (l'app parte solo in tray quando flaggato). La UI rilegge il flag ad ogni poll, così resta spuntato.
- **Bottone "Impostazioni"** instradato correttamente (fix 0.7.13).

### Changed (redesign UI completo)
- **Widget realtime** spostato in alto, tutto largo (non più a destra).
- **Sidebar laterale → Drawer slide-in**: pannello che scivola da destra con overlay, toggle "☰ Pannello" nell'header, stato persistito (localStorage).
- **Tabs attività**: Classifica autoroute / Richieste recenti / Statistiche (nuova griglia di statistiche).
- **Toast di conferma** per azioni (salva ordine, import chiavi, filtri, impostazioni) invece di testo inline.
- **Tema moderno dark** con variabili CSS, card con hover, ombre, bordi arrotondati; tema chiaro mantenuto.
- **Responsive**: colonne si impilano sotto 1100px.
- **Nessuna API key/token nel repo** (auth.json e prefs.json in .gitignore).

### Backup
- Tag `backup-pre-redesign-20260830-171227` + copie file su disco.
