## [0.7.17] - 2026-08-30

### Fixed
- **"Compatta" finalmente funziona**: il CSS usava `.providers.compact` ma l'elemento ha `id="providers"` senza classe `providers` → selettore mai matchato. Corretto in `#providers.compact`. Ora il toggle compatta davvero la vista provider/modelli.
- **Mail di fallimento build da GitHub**: i workflow `.github/workflows/ci.yml` e `release.yml` facevano `npm run lint` (1 errore) + `npm run dist` (fallisce su runner GitHub: `signtool.exe` assente, download Electron bloccato) ad ogni push → notifiche di fail. **Disattivati** (rinominati `.disabled`): buildiamo e rilasciamo localmente, il CI remoto non serve.
- **Lint pulito**: `launchedAtLogin` aggiunto ai globals di eslint (era segnalato come `no-undef`).

### Note
- Build e release avvengono localmente (standard del progetto), non su GitHub Actions.
- Tag di backup `backup-pre-redesign-20260830-171227` disponibile su disco.
