## Fix critico
- **Installer ora include i moduli server/** (server/crypto.js, protocols.js, models.js, logging.js, pricing.js, routing.js, cache.js, metrics.js, storage.js). L'installer 0.7.1 crashava all'avvio con "Cannot find module './server/pricing.js" perché i moduli non erano pacchettati.
- **Import massivo chiavi API** funzionante (POST /hub/keys salva in auth.json crittografato in AppData).

## Miglioramenti (da 0.7.0)
- Installer NSIS (percorso selezionabile)
- Dati persistenti in AppData\Local\ModelHub
- Tray close reale
- Export/Import profili UI

## Installazione
Disinstalla la 0.7.1, installa la 0.7.2, avvia. Le chiavi importate finiscono in %LOCALAPPDATA%\ModelHub\auth.json.
