# HOUNIGO — BASELINE STABILE

**Aggiornato:** 18 novembre 2026  
**Repository:** `CASABR/honeymoon-roadbook` • **App:** `ViaggiodiNozze/`  
**Produzione:** GitHub Pages + GitHub Actions su `main` • **Versione:** `1.6.20`  
**Firebase:** `app-viaggio-di-nozze` (produzione ufficiale, ruleset live verificato byte-for-byte con `firestore.rules`).

## Regola fondamentale

Distinguere SEMPRE **implementato**, **test automatici superati**, **pubblicato** e **verificato su iPhone reale**. Nessuna build o prova con Firebase Emulator conferma da sola l'affidabilità del comportamento in produzione. Aggiornare questo file a ogni conferma concreta, senza trasformare ipotesi in risultati.

## Funzioni da preservare — stato al 18/11/2026

| Funzione | Stato e prova | Non regredire |
| --- | --- | --- |
| Accesso Google / UI Owner | **Confermato su iPhone (17/11 e 18/11):** UID iPhone coincide ESATTAMENTE con `ownerUid` del viaggio `0000` in Firestore. Badge Account allineato in v1.6.20; iPhone Owner autorizzato. | Non modificare proprietà/ruoli per tentativi. |
| P0 Hobbiton / Rules v2 | **Risolto su iPhone Owner (18/11/2026, 11:35:37):** Dopo deploy Rules (`751660ea...`), iPhone Owner autorizzato, sincronizzazione attiva, coda `0`, conflitti `0`, nessun errore visibile. **Test bidirezionale con Copilota ancora da eseguire.** | Non spezzare batch atomico né allargare permessi. |
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

## P0 Hobbiton Movie Set Tour — Risolto su dispositivo Owner (18/11/2026)

**Stato al rilascio 1.6.20:**
- **Identità verificata:** L'UID Firebase della sessione iPhone coincide esattamente con `ownerUid` del viaggio `0000` in Firestore (`cqs2...Fpp2`). Google Auth è attivo.
- **Risolto disallineamento badge (v1.6.20):** In `AccountSyncModal.tsx` il ruolo mostrato nel badge del profilo è ora sincronizzato dinamicamente con `ownerUid`, eliminando l'hardcoding a "Copilota".
- **Diagnostica sicura schema (v1.6.20):** Implementata in `syncService.ts` e `PreActivationDiagnosticModal.tsx` l'ispezione protetta dei campi in coda (solo nomi campi, tipi `string`/`number`/`array`, chiavi `publicDoc`, chiavi `private_credentials` e `publicSchemaVersion`), con divieto assoluto di esporre valori, prezzi o credenziali.
- **Causa del problema Hobbiton (`att_06`):** Le Firestore Rules pre-ottimizzazione superavano il limite Firebase di 1.000 espressioni nei batch atomici `attivita + private_credentials` con `publicSchemaVersion == 2` (blocco riprodotto in Emulatore già a 17–18 chiavi; un payload reale da 23 campi veniva respinto come `permission-denied` pur con UID Owner e schema validi).
- **Ottimizzazioni dimostrate e rilasciate (18/11/2026 — commit `a7ce904`, Rules live in produzione):** Modificate in modo byte-per-byte identico le sole copie attive `firestore.rules` e `ViaggiodiNozze/firestore.rules`:
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
- **File modificati e stato rilascio:** Commit e push su `main` (`a7ce904`) di `firestore.rules`, `ViaggiodiNozze/firestore.rules`, `docs/HOUNIGO_BASELINE_STABILE.md` (escluso `scripts/deploy-actions.ps1` locale). Deploy `firebase deploy --only firestore:rules --project app-viaggio-di-nozze` completato (`2026-11-18T10:28:03Z`): ruleset attivo `projects/app-viaggio-di-nozze/rulesets/751660ea-5478-4534-b79b-30a5254a9b3d`, SHA-256 live verificato identico alle copie locali (`9e29fd7bf819df1bc84dc87c11dcaf7554e0f18d4d8d841732c9258b02f72724`). Backup rollback ruleset precedente (`424fb98f-36da-4e12-87ce-6d5908786224`, SHA-256 `f2a0a3cf...`) salvato privatamente fuori repository (`rollback_cloud_rules_20261118.rules`). **PUBBLICATO IN PRODUZIONE: SÌ (solo Firestore Rules, nessun deploy app).** **VERIFICATO SU DISPOSITIVO OWNER: SÌ (18/11/2026 alle 11:35:37).**
- **Verifica reale iPhone Owner (18/11/2026, 11:35:37) — P0 Hobbiton RISOLTO su Owner:** iPhone Owner autorizzato, sincronizzazione attiva, coda `0`, conflitti `0` e nessun errore visibile.
- **Verifica ancora da eseguire (separata):** Test bidirezionale con dispositivo Copilota (ricezione Hobbiton + sync di ritorno tappa/spesa e cassaforte), ancora da eseguire.

**Protezione:** non disinstallare la PWA, non effettuare logout casuali, non svuotare IndexedDB/localStorage o la coda, non spezzare il batch atomico, non ampliare le Firestore Rules senza causa dimostrata.

## Task essenziali (ordine di priorità)

1. **P0 — UID reale vs Firestore:** completato lato verifica identità e consolidamento/deploy Rules (`a7ce904`, `751660ea-5478-4534-b79b-30a5254a9b3d`).
2. **P0 — Sblocco Hobbiton (iPhone Owner):** **RISOLTO sul dispositivo Owner (18/11/2026 alle 11:35:37)** — Owner autorizzato, sync attiva, coda `0`, conflitti `0`, nessun errore visibile.
3. **P1 — Due telefoni (Copilota / verifica bidirezionale):** **ancora da eseguire** il test bidirezionale su secondo telefono con Copilota (oltre ad aggiunta/rimozione Copilota, modalità aereo e riconciliazione, GPS Owner verso Copilota, push su iPhone).
4. **P1 — UX iPhone (Safe Area & Dynamic Island):** **correzioni tecniche completate su v1.6.21 (testate localmente in build/Playwright, in pubblicazione su GitHub Pages)** — verificati e corretti overlay superiori/inferiori (`CategorieBar`, `AddMenu`, `UpdateToast`, `InstallPWA`, toast in `OggiView`/`NoteViaggioView`/`SettingsMenu`/`AdminDashboardView`), subheader `sticky` nelle viste categoria e `LIVE` (`.app-sticky-subheader` per evitare copertura sotto `.app-mobile-header`), `DesktopNavigation` in landscape (`--app-safe-left`), `Modal` centrati/bottom-sheet senza doppio padding (`.modal-backdrop-layer--centered`, `SmartInsertModal`, `TripSelectorModal`), modali custom (`WalkthroughModal`, `AccountSyncModal`, `PreActivationDiagnosticModal`, `PdfExportModal`, `UnifiedBooking*`, `DestinationSearchModal`, `DeviceRoleModal`, `ConfirmDialog`, `DayMapsCard`, `TrasportoCard`, `LiveView`, `GestioneViaggioView`) con `dvh` + `--app-safe-*` per schermi piccoli/tastiera e lightbox fullscreen (`LightboxCarousel`, `LiveView`, `LiveEditorialExperience`). Restano P1 aperti: apertura card/Duplica mobile, allegati Documenti/Polizze e **verifica visiva reale su iPhone (Safari + PWA standalone)** di Dynamic Island/safe-area e tastiera iOS.
5. **P2 — LIVE:** foto pre-partenza, foto cloud e messaggi ospiti protetti, senza accessi Firestore pubblici insicuri.
6. **P2 — Manutenzione:** valutare suite statiche datate (`test_unified_identity_cases.cjs`, `test_release_160_rules.cjs` check 9).

## Verifiche Safe Area iPhone / Dynamic Island (18/11/2026 — v1.6.21)

- **Verifiche tecniche superate:**
  - `npm --prefix ViaggiodiNozze run build` (`tsc -b && vite build`) e `oxlint` senza errori sulle viste/componenti modificati.
  - `ViaggiodiNozze/scripts/test_responsive_safearea_160.cjs` (`PASS` su `320`, `375`, `393`, `430`, `1440px`, meta PWA e stabilità scroll).
  - Suite Playwright headless con inset simulati Dynamic Island PWA (`393x852` `[59,0,34,0]`), Safari (`[0,0,0,0]`), iPhone SE (`320x568` `[44,0,34,0]`), tastiera virtuale (`393x390`), landscape (`852x393` `[0,59,21,59]`), desktop (`1280x800`) e vista mobile forzata: verificati gap `CategorieBar` sopra `NavBar` (`+12.4px`), subheader sticky sotto header mobile (`120px` PWA / `61px` Safari), modali centrati senza doppio padding bottom (`layer 34px`, `body 24px`) vs bottom sheet (`layer 0px`, `body 34px`), scroll interno su altezza ridotta e invariant desktop (`320px` sidebar + `960px` main).
- **Ancora da verificare su hardware iPhone reale:**
  - Comportamento effettivo in **Safari iOS** (con barra URL inferiore espansa/compatta) e nella **PWA installata** con Dynamic Island fisica (`env(safe-area-inset-*)` reali, tastiera nativa iOS/scroll focus sugli input, lightboxes e modali lunghi).

## Checklist di rilascio P0 (solo Firestore Rules)

- **A. Verifica diff definitivo (`[x]` 18/11):** Controllato `git status` e `git diff` (nessuna modifica a codice app, ownership o dati reali).
- **B. Equivalenza copie Rules (`[x]` 18/11):** Verificato SHA-256 identico `9e29fd7b...` tra `firestore.rules` e `ViaggiodiNozze/firestore.rules`.
- **C. Conferma sicurezza ruoli (`[x]` 18/11):** Superati su Emulatore 48/48 positivi e 128/128 negativi sulle Rules definitive.
- **D. Commit e push approvati (`[x]` 18/11):** Commit `a7ce904` su `main` dei soli file `firestore.rules`, `ViaggiodiNozze/firestore.rules`, `docs/HOUNIGO_BASELINE_STABILE.md` (`scripts/deploy-actions.ps1` escluso).
- **E. Deploy delle sole Rules (`[x]` 18/11):** Eseguito `firebase deploy --only firestore:rules --project app-viaggio-di-nozze` (`2026-11-18T10:28:03Z`).
- **F. Verifica Rules distribuite (`[x]` 18/11):** Confermato SHA-256 live `9e29fd7b...` sul ruleset `751660ea-5478-4534-b79b-30a5254a9b3d` (nessuna scrittura sul viaggio `0000`).
- **G. Test reale iPhone Owner (`[x]` 18/11 alle 11:35:37):** iPhone Owner autorizzato, sincronizzazione attiva e nessun errore visibile.
- **H. Conferma Hobbiton coda a zero (`[x]` 18/11 alle 11:35:37):** Coda a `0`, conflitti `0`, P0 Hobbiton risolto sul dispositivo Owner.
- **I. Verifica bidirezionale Copilota (`[ ]` ancora da eseguire):** Verificare su secondo dispositivo (Copilota) ricezione di Hobbiton e sync di ritorno.
- **J. Piano di rollback Rules (pronto):** Copia privata pre-deploy `424fb98f-36da-4e12-87ce-6d5908786224` (`f2a0a3cf...`) salvata in `rollback_cloud_rules_20261118.rules` (oltre a `git show d3986fc:firestore.rules`).

## Protocollo di lavoro per Argon / Codex

- Leggere questa baseline e `PROJECT_RULES.md` prima di modificare componenti critici.
- **Un solo problema per prompt**; audit limitato ai file interessati; nessuna riscrittura delle funzioni già approvate.
- Prima `git status` e `git diff`; poi test pertinenti; una build solo quando serve.
- **Non fare commit, push, deploy, deploy regole Firebase o scritture al viaggio `0000` senza autorizzazione esplicita.**
- Report massimo 5–6 righe. Dopo ogni release o collaudo reale, aggiornare qui soltanto lo stato provato, indicando **data, versione e prova**.
- Non copiare in questa baseline UID integrali, dati prenotazione, credenziali, PIN, token, link privati.

> I file storici `docs/HOUNIGO_PROJECT_STATE.md` e `docs/HOUNIGO_BACKLOG.md` risultano datati 26/10/2026 e possono descrivere branch, deploy o priorità precedenti. Usare questo documento per la **situazione corrente**, preservando i documenti storici come archivio.
