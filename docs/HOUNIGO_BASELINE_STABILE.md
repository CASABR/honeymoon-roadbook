# HOUNIGO — BASELINE STABILE

**Aggiornato:** 18 novembre 2026  
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
| Deploy & Preflight | **Verificato localmente (17/11):** Preflight obbligatorio in `deploy-actions.ps1` blocca i deploy con `sourceCommit` mancante/invalido o versionamento errato prima di GitHub Actions. Rollback e `-Confirm CONFERMA` preservati. | Non avviare workflow remoti senza versionamento valido. |
| LIVE / GPS / Push | Funzioni già implementate con test precedenti, ma verifica end-to-end su telefoni ancora da completare. | Non dichiarare collaudo reale completato. |

## Blocco P0 aperto: Hobbiton Movie Set Tour

**Stato al rilascio 1.6.20:**
- **Identità verificata:** L'UID Firebase della sessione iPhone coincide esattamente con `ownerUid` del viaggio `0000` in Firestore (`cqs2...Fpp2`). Google Auth è attivo.
- **Risolto disallineamento badge (v1.6.20):** In `AccountSyncModal.tsx` il ruolo mostrato nel badge del profilo è ora sincronizzato dinamicamente con `ownerUid`, eliminando l'hardcoding a "Copilota".
- **Diagnostica sicura schema (v1.6.20):** Implementata in `syncService.ts` e `PreActivationDiagnosticModal.tsx` l'ispezione protetta dei campi in coda (solo nomi campi, tipi `string`/`number`/`array`, chiavi `publicDoc`, chiavi `private_credentials` e `publicSchemaVersion`), con divieto assoluto di esporre valori, prezzi o credenziali.
- **Causa del problema Hobbiton (`att_06`):** Le Firestore Rules pre-ottimizzazione superavano il limite Firebase di 1.000 espressioni nei batch atomici `attivita + private_credentials` con `publicSchemaVersion == 2` (blocco riprodotto in Emulatore già a 17–18 chiavi; un payload reale da 23 campi veniva respinto come `permission-denied` pur con UID Owner e schema validi).
- **Ottimizzazioni dimostrate (IMPLEMENTATO LOCALMENTE il 18/11/2026, NON distribuito):** Modificate in modo byte-per-byte identico le sole copie attive `firestore.rules` e `ViaggiodiNozze/firestore.rules`:
  - `match /attivita/{docId}` dedicato (e `'attivita'` rimossa da `match /{subcol}/{docId}` per evitare doppie valutazioni);
  - rimozione di `hasNoSensitiveKeys` ridondante su `publicSchemaVersion == 2` e in `safeSharedViewerDocument` (tutte le 8 whitelist sono disgiunte dalle 56 chiavi sensibili); `validDocumentPublication` limitata a `tappe`; skip di `resource.data` sugli update `== 2`;
  - `isTripPrivilegedMember` riordinato (controllo `members/{uid}` prima del fallback `/trips/{tripId}`, senza `existsAfter` sulle letture) e `allow get` di `attivita` snellito per i Viewer mantenendo `isTripOwner` intatto;
  - `viewer_attivita` con De Morgan a 3 tier (`28 + 12 + 13` chiavi scalari) e `publicOpeningHours` ottimizzato (short-circuit `exceptions` a gruppi di 8, `let` su `weekly`/metadati e guard `hasAny` sui metadati opzionali).
- **Verifiche positive (TESTATO IN EMULATORE il 18/11/2026):**
  - Suite consolidamento pre-partenza: `48/48` test positivi superati (Owner con e senza `members/{uid}`, Copilota autorizzato, create/update/batch su 23, 30 `+ weekly 7g`, 40 `+ coordinate + openingHours min`, 45 scalari; lettura Viewer `v2`; update legacy `v0` puliti; `tappe` con doc pubblicato; `settings` `v0`; `spese`/`documenti`/`note` Editor; `live_feeds` `v2`).
  - Percorso completo Hobbiton (`att_06`, `publicSchemaVersion: 2`) con `securityDataSplitter.ts` reale: separati esattamente `23` campi pubblici + `12` privati; con errore batch simulato nessuna scrittura parziale su `private_credentials`/`attivita` e coda conservata (`1`); con Owner batch atomico riuscito, coda svuotata `1 -> 0`, retry idempotente con zero duplicati e Viewer bloccato su cassaforte.
  - Regressione `test_p0_security_emulator.cjs`: `13/13` controlli superati sulle Rules definitive; `test_security_data_splitter.cjs`: `6/6` superati.
- **Verifiche negative (TESTATO IN EMULATORE il 18/11/2026):**
  - `128/128` controlli negativi respinti (`permission-denied` / 403): Viewer, revocato, solo-array `members`, anonimo (`signInAnonymously` e REST senza token), estraneo, Owner di altro viaggio e GlobalAdmin su `0000`; chiavi sensibili/sconosciute su `v2` e legacy `v0`; `map`/`list` in tutti e 3 i tier scalari; `coordinate` e `openingHours` malformati (inclusi `weekly` null/`>200` e `exceptions` non-mappa, date invalide a indice 0/1/8 e `>32`); `doubleValue: 2`; downgrade `v2 -> v0/assente`; `settings` `v2`; escalation ruolo `members` e `ownerUid`; `delete` trip `0000` e `owner` member.
  - Suite legacy `test_release_160_rules.cjs` in ambiente isolato: superati i controlli Rules 1–8; interrotta al controllo 9 solo per script statico obsoleto (`import.meta.env.VITE_LIVE_PHOTOS_WORKER_URL` non sostituito in `vm.runInNewContext` su `liveStorageService.ts`) e dipendenza `@firebase/rules-unit-testing` assente dal `package.json` del progetto (nessuna regressione delle Rules).
- **Limiti residui misurati (sotto 1.000 espressioni in batch):** `45/55` chiavi scalari (`string` o `int`), `43` con `coordinate`, `42` con `coordinate + openingHours` minimo, `32` con `coordinate + weekly` 7 giorni, `27` con `openingHours` completo (`weekly` 7g + `exceptions` + 4 metadati), fino a `15` eccezioni con 5 campi e `7` eccezioni con 23 campi.
- **File modificati e stato rilascio:** Modificati localmente `firestore.rules`, `ViaggiodiNozze/firestore.rules`, `docs/HOUNIGO_BASELINE_STABILE.md` (più precedente modifica in `scripts/deploy-actions.ps1`). **PUBBLICATO IN PRODUZIONE: NO.** **VERIFICATO SU DISPOSITIVO REALE: NO.**
- **Verifiche ancora necessarie su iPhone (dopo deploy autorizzato delle Rules):** Confermare con una sola prova controllata su iPhone Owner che `att_06` Hobbiton si sincronizzi dal batch reale, che la coda locale passi da `1` a `0` senza duplicati e che il Copilota riceva l'aggiornamento bidirezionalmente.

**Protezione:** non disinstallare la PWA, non effettuare logout casuali, non svuotare IndexedDB/localStorage o la coda, non forzare ripetutamente «Riprova sincronizzazione», non spezzare il batch atomico, non ampliare le Firestore Rules senza causa dimostrata.

## Task essenziali (ordine di priorità)

1. **P0 — UID reale vs Firestore:** completato lato verifica identità e consolidamento Rules in Emulatore (causa = limite 1.000 espressioni Firestore Rules su `attivita` v2).
2. **P0 — Sblocco Hobbiton (aperto fino a prova su dispositivo reale):** eseguire la checklist di rilascio sotto riportata solo dopo esplicita autorizzazione al deploy delle sole Firestore Rules.
3. **P1 — Due telefoni:** aggiunta/rimozione Copilota, modifiche bidirezionali tappa/spesa, modalità aereo e riconciliazione, GPS Owner verso Copilota, push su iPhone.
4. **P1 — UX iPhone:** Dynamic Island/safe-area PWA e Safari, apertura card, Duplica mobile, allegati Documenti/Polizze.
5. **P2 — LIVE:** foto pre-partenza, foto cloud e messaggi ospiti protetti, senza accessi Firestore pubblici insicuri.
6. **P2 — Manutenzione:** valutare suite statiche datate (`test_unified_identity_cases.cjs`, `test_release_160_rules.cjs` check 9).

## Checklist di rilascio P0 (solo Firestore Rules — da eseguire previa autorizzazione)

- **A. Verifica diff definitivo:** Controllare `git status` e `git diff firestore.rules` confermando assenza di modifiche a codice app, ownership o dati di produzione.
- **B. Equivalenza copie Rules:** Verificare SHA-256 identico tra `firestore.rules` e `ViaggiodiNozze/firestore.rules`.
- **C. Conferma sicurezza ruoli:** Rieseguire la verifica locale Owner / Copilota / Viewer / revocato / estraneo e protezione trip `0000`.
- **D. Commit modifiche approvate:** Eseguire commit mirato dei soli file approvati (`firestore.rules`, `ViaggiodiNozze/firestore.rules`, `docs/HOUNIGO_BASELINE_STABILE.md` ed eventuale `scripts/deploy-actions.ps1` separato se richiesto).
- **E. Deploy delle sole Rules:** Pubblicare esclusivamente le Security Rules sul progetto Firebase corretto (`firebase deploy --only firestore:rules --project app-viaggio-di-nozze`), senza toccare i dati del viaggio `0000`.
- **F. Verifica Rules distribuite:** Controllare in Firebase Console / API di sola lettura che il ruleset attivo in produzione corrisponda esattamente al digest del file distribuito.
- **G. Test reale iPhone Owner:** Aprire l'app sull'iPhone Owner (nessun reset coda/storage) ed eseguire una sola sincronizzazione controllata dell'operazione pendente.
- **H. Conferma Hobbiton `1 -> 0`:** Verificare che `att_06` Hobbiton e la relativa voce `private_credentials` siano aggiornate senza duplicati e che la coda locale scenda stabilmente da `1` a `0`.
- **I. Verifica bidirezionale Copilota:** Verificare su secondo dispositivo (Copilota) ricezione dell'attività Hobbiton (con credenziali in cassaforte) e aggiornamento di una tappa/spesa di ritorno.
- **J. Piano di rollback Rules:** In caso di regressioni inattese, ripristinare immediatamente il ruleset precedente noto (`git show HEAD:firestore.rules`) via Firebase Console "Cronologia regole" o deploy diretto della revisione precedente verificata.

## Protocollo di lavoro per Argon / Codex

- Leggere questa baseline e `PROJECT_RULES.md` prima di modificare componenti critici.
- **Un solo problema per prompt**; audit limitato ai file interessati; nessuna riscrittura delle funzioni già approvate.
- Prima `git status` e `git diff`; poi test pertinenti; una build solo quando serve.
- **Non fare commit, push, deploy, deploy regole Firebase o scritture al viaggio `0000` senza autorizzazione esplicita.**
- Report massimo 5–6 righe. Dopo ogni release o collaudo reale, aggiornare qui soltanto lo stato provato, indicando **data, versione e prova**.
- Non copiare in questa baseline UID integrali, dati prenotazione, credenziali, PIN, token, link privati.

> I file storici `docs/HOUNIGO_PROJECT_STATE.md` e `docs/HOUNIGO_BACKLOG.md` risultano datati 26/10/2026 e possono descrivere branch, deploy o priorità precedenti. Usare questo documento per la **situazione corrente**, preservando i documenti storici come archivio.
