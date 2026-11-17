# HOUNIGO — BASELINE STABILE

**Aggiornato:** 17 novembre 2026  
**Repository:** `CASABR/honeymoon-roadbook` • **App:** `ViaggiodiNozze/`  
**Produzione:** GitHub Pages + GitHub Actions su `main` • **Versione:** `1.6.20`  
**Firebase:** `app-viaggio-di-nozze` (produzione ufficiale, ruleset live verificato byte-for-byte con `firestore.rules`).

## Regola fondamentale

Distinguere SEMPRE **implementato**, **test automatici superati**, **pubblicato** e **verificato su iPhone reale**. Nessuna build o prova con Firebase Emulator conferma da sola l'affidabilità del comportamento in produzione. Aggiornare questo file a ogni conferma concreta, senza trasformare ipotesi in risultati.

## Funzioni da preservare — stato al 17/11/2026

| Funzione | Stato e prova | Non regredire |
| --- | --- | --- |
| Accesso Google / UI Owner | **Confermato su iPhone (17/11):** UID iPhone coincide ESATTAMENTE con `ownerUid` del viaggio `0000` in Firestore. Risolto in v1.6.20 l'hardcoding del badge in Account (`AccountSyncModal.tsx`) per riflettere il ruolo Owner. | Non modificare proprietà/ruoli per tentativi. |
| Viaggio reale `0000` | Protezioni su permessi e cancellazione, test automatici di sicurezza superati. | Vietate cancellazioni, reset, migrazioni o scritture diagnostiche. |
| HouniAI | **Pubblicato/testato** v1.6.13: testo, PDF, immagini, screenshot, `.eml`; batch fino a 6 file con anteprima, conferma, deduplica. | Non riscrivere flusso approvato. Gmail diretto resta condizionato alle verifiche OAuth Google; fallback manuale attivo. |
| Documenti / Polizze | **Pubblicato/testato** v1.6.14: recupero reattivo, allegati e link Drive. | Conservare documenti veri; test iPhone ancora dovuto. |
| Card | **Pubblicato/testato** v1.6.16: modifica tramite tocco card per Owner/Copilota, Viewer in lettura; matita ridondante rimossa. | Conservare click card e permessi. |
| Duplica | **Pubblicato/build OK** v1.6.17: nascosto sotto 768 px, visibile da 768 px. | Non nascondere altre azioni; conferma visiva iPhone da fare. |
| Console Admin | **Pubblicato/testato** v1.6.17: elenco viaggi, utenti, copiloti, stima storage, eliminazione protetta via CLI. | Non eseguire cancellazioni reali; storage visualizzato è una stima parziale. |
| Tombstone | **Confermato su iPhone** il 17/11: già allineato al Cloud; 0 conflitti e coda scesa da 2 a 1. | Non svuotare code senza prova dell'equivalenza Cloud. |
| Diagnostica sync | **Pubblicata e visibile su iPhone** v1.6.19; estesa in v1.6.20 con ispezione sicura di soli nomi e tipi dei campi in coda, public/private keys e versione schema. | Non esporre dati sensibili. Zero modifiche automatiche alla coda. |
| LIVE / GPS / Push | Funzioni già implementate con test precedenti, ma verifica end-to-end su telefoni ancora da completare. | Non dichiarare collaudo reale completato. |

## Blocco P0 aperto: Hobbiton Movie Set Tour

**Stato al rilascio 1.6.20:**
- **Identità verificata:** L'UID Firebase della sessione iPhone coincide esattamente con `ownerUid` del viaggio `0000` in Firestore (`cqs2...Fpp2`). Google Auth è attivo.
- **Risolto disallineamento badge (v1.6.20):** In `AccountSyncModal.tsx` il ruolo mostrato nel badge del profilo è ora sincronizzato dinamicamente con `ownerUid`, eliminando l'hardcoding a "Copilota".
- **Diagnostica sicura schema (v1.6.20):** Implementata in `syncService.ts` e `PreActivationDiagnosticModal.tsx` l'ispezione protetta dei campi in coda (solo nomi campi, tipi `string`/`number`/`array`, chiavi `publicDoc`, chiavi `private_credentials` e `publicSchemaVersion`), con divieto assoluto di esporre valori, prezzi o credenziali.
- **Problema aperto (ancora in coda):** 1 operazione in coda (`Attivita · Save`, Hobbiton); Firestore restituisce `Missing or insufficient permissions` sul batch atomico `attivita + private_credentials`. Il ruleset Cloud è identico al repository; sul Cloud `trips/0000/attivita/att_06` ha `publicSchemaVersion: 2`, per cui il batch esige la conformità totale a `viewer_attivita`. L'ispezione della 1.6.20 permetterà di leggere su iPhone la composizione esatta dei campi del payload reale.

**Protezione:** non disinstallare la PWA, non effettuare logout casuali, non svuotare IndexedDB/localStorage o la coda, non forzare ripetutamente «Riprova sincronizzazione», non spezzare il batch atomico, non ampliare le Firestore Rules senza causa dimostrata.

## Task essenziali (ordine di priorità)

1. **P0 — UID reale vs Firestore:** verificare in sola lettura UID della sessione iPhone e appartenenza/ruolo nel database e regole realmente distribuite. Se UID corretto, indagare dati reali/regola del batch invece di presumere un problema d'identità.
2. **P0 — Sblocco Hobbiton:** dopo diagnosi certa, eseguire una sola prova controllata, verificando coda a zero e dato remoto senza duplicati.
3. **P1 — Due telefoni:** aggiunta/rimozione Copilota, modifiche bidirezionali tappa/spesa, modalità aereo e riconciliazione, GPS Owner verso Copilota, push su iPhone.
4. **P1 — UX iPhone:** Dynamic Island/safe-area PWA e Safari, apertura card, Duplica mobile, allegati Documenti/Polizze.
5. **P2 — LIVE:** foto pre-partenza, foto cloud e messaggi ospiti protetti, senza accessi Firestore pubblici insicuri.
6. **P2 — Manutenzione:** valutare suite statica `test_unified_identity_cases.cjs` (11/16 secondo report dell'agente, non trattarla come PASS).

## Protocollo di lavoro per Argon / Codex

- Leggere questa baseline e `PROJECT_RULES.md` prima di modificare componenti critici.
- **Un solo problema per prompt**; audit limitato ai file interessati; nessuna riscrittura delle funzioni già approvate.
- Prima `git status` e `git diff`; poi test pertinenti; una build solo quando serve.
- **Non fare commit, push, deploy, deploy regole Firebase o scritture al viaggio `0000` senza autorizzazione esplicita.**
- Report massimo 5–6 righe. Dopo ogni release o collaudo reale, aggiornare qui soltanto lo stato provato, indicando **data, versione e prova**.
- Non copiare in questa baseline UID integrali, dati prenotazione, credenziali, PIN, token, link privati.

> I file storici `docs/HOUNIGO_PROJECT_STATE.md` e `docs/HOUNIGO_BACKLOG.md` risultano datati 26/10/2026 e possono descrivere branch, deploy o priorità precedenti. Usare questo documento per la **situazione corrente**, preservando i documenti storici come archivio.
