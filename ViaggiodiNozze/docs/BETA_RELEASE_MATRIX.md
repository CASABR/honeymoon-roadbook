# HOUNIGO — MATRICE DI RILASCIO BETA (BETA RELEASE MATRIX)
*Data target: 28 Ottobre 2026*
*Obiettivo: Prima release stabile fruibile da un gruppo di beta tester esterni (Web/PWA).*

---

## 1. CRITERI DI QUALITÀ PER LA RELEASE CANDIDATE (RC)

| Area | Criterio Minimo Richiesto | Stato Attuale | Note Operative |
| :--- | :--- | :--- | :--- |
| **Brand Identity & Loghi Ufficiali** | Due loghi ufficiali integrati (Logo A Navy su Light, Logo B Bianco su Dark), Manrope, Trail Icons, Light Onboarding & Light HouniAI. | PUBBLICATO | Online su gh-pages commit 69b4006 (bundle index-1JsOyJle.js), due PNG originali preservati, smoke test 18/18 PASS |
| **Chiusura prevUid** | Rifiuto categorico di membership create via prevUid da attaccanti; solo linkWithPopup o re-invito. | PUBBLICATO | Regole pubblicate su app-viaggio-di-nozze; codice senza prevUid online nel bundle index-DxxPChKC.js |
| **Protezione Foto & Storage** | QuotaExceededError non elimina fotografie ('hounigo_live_gallery') né dati utente; fallback session/memory. | PUBBLICATO | Protezione online (LiveView-Cm4wFBQ9.js, geolocationService); foto non sacrificabili |
| **Calendario in Oggi** | Tocco e click immediato su icona 📅 su mobile (iOS Safari/Android) e desktop. | PUBBLICATO | Overlay trasparente e showPicker() operativi online nel bundle principale |
| **Card Google Maps** | Barra ultra-compatta a singola riga su smartphone (Icona Maps, 🚗, 🚶, ✏️ unificata), responsive 320px. | PUBBLICATO | Singola riga orizzontale, modale unificato Auto + Piedi online |
| **GPS LIVE Proprietario** | Diagnosi esatta "Non attivata" (7 stati), pulsante esplicito Guida, Action Card sotto mappa, istruzioni iOS. | PUBBLICATO | Risolto bug `online` undefined; Action Card contestuale online |
| **Invito Copilota Sicuro** | Link crittografico 128-bit imprevedibile, monouso, 7gg, batch atomico Firestore Spark con `getAfter`, no auto-join. | PUBBLICATO | Regole Firestore attive in produzione; token monouso protetto |
| **Selezione Viaggi Post-Login** | Lista viaggi posseduti e copilota (`/users/{uid}`), switch istantaneo con reset IndexedDB e cache. | PUBBLICATO | Modale `TripSelectorModal`; isolamento dati 100% online |
| **Gmail Compatto** | Riga singola orizzontale (stato, account, azione principale), drawer espandibile per permessi `gmail.readonly`. | PUBBLICATO | Integrato in `SmartInsertModal` e `DocumentiView`; preserva identità e permessi |
| **Sezione Altro Task-Based** | 4 macro-compiti (LIVE, Documenti, Sicurezza, Gestione), zero duplicazioni o riquadri superflui, responsive 393/320px. | PUBBLICATO | Riorganizzazione editoriale completata e attiva online |
| **Isolamento Dati Viaggi** | Isolamento 100% tra viaggi diversi nello stesso browser. Seed Nuova Zelanda solo per '0000'. | PUBBLICATO | Reset connessioni IndexedDB, flush memoryCache, zero contaminazione date/titoli |
| **LIVE Desktop** | Consultazione mappa e GPS senza assumere il ruolo guida. Gestione sicura timestamp e tripId. | PUBBLICATO | Rimosso fallback '0000', schermo di selezione recuperabile online |
| **LIVE Mobile** | Schermata compatta, gerarchia chiara, controlli guida raggruppati, responsive 393/320px. | PUBBLICATO | LiveEditorialExperience con mappa compatta e controlli comprimibili online |
| **Galleria Foto Multi-Device** | Condivisione pubblica foto organizzatore -> ospiti indipendenti. | IMPLEMENTATO | Locale attivo; disclaimers beta espliciti; storage cloud post-beta |
| **Card Trasporti** | Check-in su riga compatta, orari IATA leggibili, azioni biglietto/PNR chiare. | PUBBLICATO | TrasportoCard con check-in su singola riga orizzontale |
| **Persistenza & Offline** | Nessuna perdita dati, funzionamento offline di base (IndexedDB + LocalStorage). | PUBBLICATO | Verificato con test di persistenza e tombstone |
| **GPS Cloud Limit (P0)** | Nessun "Limite temporaneo operazioni cloud", rimossa runTransaction contesa, throttle 15s in-memory, handover immediato copilota. | PUBBLICATO | Rilasciato su app-viaggio-di-nozze e online nel bundle index-djclbXgz.js |
| **Cartoline LIVE (P0)** | Cartolina eliminata non ricompare dopo refresh/sync multi-client, tombstones persistenti, foto locale preservata. | PUBBLICATO | Rilasciato su app-viaggio-di-nozze e online nel bundle index-djclbXgz.js |
| **Header LIVE Mobile (P1)** | Header compatto ~48px, badge LIVE pulsante, titolo viaggio dinamico, zero ridondanze/sovrapposizioni (320px/393px). | PUBBLICATO | Online nel bundle index-djclbXgz.js |
| **Rotella Impostazioni (P1)** | Semplificata, rimossi Guida/Tutorial e duplicati, 4 voci essenziali + cassetto Opzioni Avanzate, admin con ?admin=1. | PUBBLICATO | Online nel bundle index-djclbXgz.js |
| **Persistenza Attività & Orari (P0)** | Salvataggio simultaneo e contemporaneo senza abort precoce, sync orari, decisioni collisioni in localStorage. | TESTATO | 14/14 test passati su Firebase Emulator (JDK 21), build 0 errori |
| **Link Invito 1° Click (P0)** | Zero errori transitori permessi al primo click, ensureSignedInUser(), metadati nel token, auto-join immediato membri. | TESTATO | 14/14 test passati su Firebase Emulator (JDK 21), build 0 errori |
| **Selettore Viaggi Safari (P1)** | Spiegazione chiara stato Ospite anonimo vs Google account, login sicuro, no restore cieco né perdita GIAPPONE. | TESTATO | Build 0 errori, isolamento sandboxed verificato |
| **Delega Guida GPS Nomi Reali (P1)** | Nomi reali (***REMOVED***/***REMOVED***), rimossi codici tecnici, feedback su scrittura Firestore, immutabilità assoluta ownerUid. | TESTATO | 14/14 test passati su Firebase Emulator (JDK 21), build 0 errori |
| **Modifica Tappe da Oggi (P1)** | Modifica diretta tappe dalla timeline di Oggi con TappaForm precaricato, preservazione ID, refresh e mutazioni offline per guida/copilota. | TESTATO LOCALMENTE | Test suite passata, build 0 errori, mutazioni abilitate |
| **Sezione Adesso Temporale (P1)** | Eliminata ridondanza quadrupla: pre-trip con countdown pulito, during-trip con in corso/prossimo, post-trip solo a data conclusa. | TESTATO LOCALMENTE | Test suite passata, verifica confini temporali e fusi |
| **Coerenza Firestore Rules (P0)** | Entrambi i file firestore.rules identici al 100%, status in ['active', 'used'], divieto scansione inviti e protezione 0000. | TESTATO LOCALMENTE | 14/14 P0 test + 24/24 beta test passati su Firebase Emulator |
| **Identità Google Pre-esistente (P0)** | Connessione Google con credenziali già esistenti mantiene UID Google legittimo senza migrazioni indebite di membership. | TESTATO LOCALMENTE | Verificato in accountService.ts e suite test |

---

## 2. STATO DELLE FUNZIONALITÀ PER IL 28 OTTOBRE 2026

### Funzionalità ABILITATE per la Beta
1. **Invito Copilota Crittografico**: Generazione token 128-bit imprevedibile (`crypto.randomUUID()`), link con token 7 giorni monouso, validazione atomica Firestore batch con `getAfter`, divieto assoluto auto-join su solo tripId, protezione assoluta viaggio 0000.
2. **GPS LIVE Affidabile & Trasparente**: Rilevamento esatto dello stato (7 motivi di inattività), Action Card sotto la mappa con attivazione/pausa/trasferimento, supporto esplicito Safari/iOS e distinzione della posizione programmata.
3. **Selezione & Cambio Viaggio Isolato**: Selezione viaggi organizzatore vs copilota, azzeramento IndexedDB e cache al cambio viaggio.
4. **Gmail Compatto**: Barra singola discreta per inserimento rapido e consultazione documenti.
5. **Sezione Altro Task-Based**: 4 percorsi chiari per tutte le esigenze di viaggio, logistica e gestione.
6. **Card Maps Giornaliera Compatta**: Due righe pulite per auto e a piedi con link, modale di editing e avviso per percorsi da 10 tappe.
7. **Logistica Trasporti & Alloggi**: Visualizzazione chiara orari, check-in sintetico, voucher e PNR.
8. **LIVE Experience (Consultazione & Diario)**: Mappa satellitare con posizione reale/prevista, feed messaggi con paginazione a 10 e reazioni.

### Funzionalità DISABILITATE o CONTRASSEGNATE COME BETA
1. **Galleria Fotografica Pubblica Multi-Device**: La memorizzazione locale delle foto è attiva sul dispositivo di chi scatta; la sincronizzazione istantanea remota verso gli ospiti è contrassegnata come "In arrivo con Storage Cloud".
2. **Console Amministratore Globale**: Esclusa dalla navigazione utente standard e accessibile unicamente tramite parametro URL riservato (`?admin=1`).

---

## 3. PROTOCOLLO DI COLLAUDO DISPOSITIVI FISICI
- [x] **Test 1: Owner autenticato ma GPS inattivo**: Riconoscimento stato `not_started`, Action Card visibile. [SUPERATO 14/14]
- [x] **Test 2: Owner che richiede di diventare Guida**: Azione `takeGuideHere`, persistenza ruolo sessione `'guida'`. [SUPERATO 14/14]
- [x] **Test 3: Lease GPS occupato da altro dispositivo**: Segnalazione `other_device_active`, opzione trasferimento. [SUPERATO 14/14]
- [x] **Test 4: Permesso GPS negato e ripristino**: Stato `permission_denied`, istruzioni iOS/Safari. [SUPERATO 14/14]
- [x] **Test 5: Nuovo utente crea viaggio**: Creazione atomica `/trips/{id}`, `/members/{uid}`, generazione token invito crittografico. [SUPERATO 14/14]
- [x] **Test 6: Account con più viaggi**: Elenco viaggi posseduti e copilota da `/users/{uid}`. [SUPERATO 14/14]
- [x] **Test 7: Passaggio tra viaggi con dati indipendenti**: Chiusura IndexedDB, flush cache in memoria, zero leak. [SUPERATO 14/14]
- [x] **Test 8: Copilota con invito crittografico valido**: Riscatto atomico con batch, transizione token in `'used'`, join autorizzato. [SUPERATO 14/14]
- [x] **Test 9: Estraneo con solo tripId**: Blocco categorico accesso senza token crittografico. [SUPERATO 14/14]
- [x] **Test 10: Invito scaduto o revocato**: Blocco riscatto se `status !== 'pending'` o `expiresAt < now`. [SUPERATO 14/14]
- [x] **Test 11: Lettura dati privati prima del join**: Subcollezioni private protette da `isTripMember()`. [SUPERATO 14/14]
- [x] **Test 12: Regressioni login, sync, Maps e LIVE**: Mantenimento card 2 righe, parsing timestamp e login permanente. [SUPERATO 14/14]
- [x] **Test 13: Build completa di produzione**: `npm run build` completato senza errori TypeScript o Vite. [SUPERATO]
- [ ] **Test Telefono Fisico Owner su Rete Reale (PWA iOS)**: Collaudo finale geolocalizzazione sul dispositivo reale dell'owner pre-apertura tester 28 ottobre.

---

## 4. CONVALIDA FIRESTORE SECURITY RULES SU FIREBASE EMULATOR REALE
*Ambiente: Firebase Emulator Suite v15.28.2 (Porta 8085) su OpenJDK 21 LTS*
*Suite: `scripts/test_beta_release_emulator_validation.cjs`*
*Esito: 24/24 asserzioni superate con successo (100%)*

- [x] **Creazione remota viaggio con `ownerUid`**: Batch atomico crea doc `/trips/{id}` e member doc `/members/{uid}` con role 'owner'. [PASS 01]
- [x] **Creazione remota viaggio con `ownerId`**: Retrocompatibilità completa per documenti legacy o generatori client. [PASS 02]
- [x] **Riconoscimento owner per modifiche**: `isTripOwner` riconosce legittimamente l'owner sia tramite `ownerUid` che `ownerId`. [PASS 03]
- [x] **Generazione invito copilota**: Owner crea `/trips/{id}/invites/{token}` con 7 giorni di validità e role 'copilota'. [PASS 04]
- [x] **Divieto generazione inviti per non-owner**: Estraneo o copilota non possono creare token di invito. [PASS 05 - PERMISSION_DENIED]
- [x] **Protezione master `0000` su inviti**: Vietata categoricamente la creazione di inviti su `0000` (`tripId != '0000'`). [PASS 06 - PERMISSION_DENIED]
- [x] **Accesso con solo `tripId` bloccato**: Estraneo con solo ID viaggio non può eseguire `get` su `/trips/{tripId}`. [PASS 07 - PERMISSION_DENIED]
- [x] **Accesso dati privati prima del join bloccato**: Estraneo non può accedere a `/tappe`, `/spese`, `/documenti`. [PASS 08 - PERMISSION_DENIED]
- [x] **Verifica token pre-join**: Utente con link e token esatto legge i metadati dell'invito in `/invites/{token}`. [PASS 09]
- [x] **Divieto scansione/list inviti**: Estraneo non può enumerare o scansionare i token altrui. [PASS 10 - PERMISSION_DENIED]
- [x] **Riscatto atomico invito valido**: Batch atomico consuma il token (`status: 'used'`), crea `members/{uid}` e aggiorna `members` array. [PASS 11]
- [x] **Accesso post-join copilota**: Dopo il riscatto il copilota è membro effettivo e legge `/trips/{id}`. [PASS 12]
- [x] **Collaborazione post-join copilota**: Il copilota ha accesso di scrittura nelle tappe e risorse condivise. [PASS 13]
- [x] **Blocco riuso token già consumato**: Secondo utente che tenta di riscattare un token già usato viene respinto. [PASS 14 - PERMISSION_DENIED]
- [x] **Blocco token scaduto**: Token con `expiresAt < request.time` viene respinto. [PASS 15 - PERMISSION_DENIED]
- [x] **Blocco token revocato**: Token con `status: 'revoked'` viene respinto. [PASS 16 - PERMISSION_DENIED]
- [x] **Blocco auto-join non autorizzato**: Auto-iscrizione senza token crittografico viene respinta. [PASS 17 - PERMISSION_DENIED]
- [x] **Blocco auto-promozione a owner**: Tentativo di iscriversi con role 'owner' viene respinto. [PASS 18 - PERMISSION_DENIED]
- [x] **Blocco auto-join su `0000`**: Tentativo di iscrizione o join su `0000` viene respinto. [PASS 19 - PERMISSION_DENIED]
- [x] **Isolamento `0000` da estranei**: Estraneo non può leggere `/trips/0000`. [PASS 20 - PERMISSION_DENIED]
- [x] **Isolamento tappe private `0000`**: Estraneo non può leggere le tappe di `0000`. [PASS 21 - PERMISSION_DENIED]
- [x] **Impossibilità eliminazione `0000`**: Nemmeno l'owner può cancellare `0000`. [PASS 23 - PERMISSION_DENIED]
- [x] **Compatibilità viaggi esistenti**: Viaggi senza la sottocollezione `/invites` continuano a funzionare regolarmente. [PASS 24]

---

## 5. SMOKE TEST POST-DEPLOY & STATO PUBBLICAZIONE (100% PUBBLICATO)
*Suite: `scripts/post_deploy_smoke_test.cjs`*
*URL Live: `https://casabr.github.io/honeymoon-roadbook/`*
*Esito: 18/18 controlli superati con successo (100%)*

- [x] **Deploy Firestore Rules**: Nuove regole (senza vulnerabilità prevUid) rilasciate con successo su `app-viaggio-di-nozze`.
- [x] **Deploy GitHub Pages**: Frontend pubblicato su branch remoto `gh-pages` (commit `6a7f785`, sorgente `7d23b48`).
- [x] **Caricamento frontend**: Pagina principale HTTP 200, mount `<div id="root">` presente.
- [x] **Metadati viewport mobile**: Tag viewport configurato per tutti i display smartphone.
- [x] **Integrità bundle JS e CSS**: Script principale (`assets/index-DxxPChKC.js` - 1065 KB) e foglio di stile (`assets/index-DdMy2aXy.css` - 202 KB) scaricati e validati. Chunks dinamici (`AdminDashboardView-jjsVRa4h.js`, `storageService-CvYJbMDP.js`, `LiveView-Cm4wFBQ9.js`, `attachmentChunkService-Ce_n3qlw.js`) verificati online (HTTP 200).
- [x] **PWA Manifest & Icone**: `manifest.webmanifest` valido, display standalone e set icone integro (HTTP 200).
- [x] **Service Worker**: `sw.js` attivo con Workbox cache e precache configurata (HTTP 200).
- [x] **Nessun tocco ai dati di produzione 0000**: Nessuna scrittura o modifica sul viaggio master.
- [x] **Procedura di pubblicazione e piano di rollback**: Backup delle regole attive prima del deploy salvato e verificato in `docs/firestore.rules.active-production-before-hotfix`; commit gh-pages precedente registrato (`b677d2d`).

---

## 6. ESITO QUALITY ASSURANCE NOTTURNO (25-26 OTTOBRE 2026)
*Totale verifiche eseguite: 88 asserzioni di test superate (100%)*

- [x] **Fase 1 — Riconciliazione Online**: 28/28 verifiche superate (HTTP 200, bundle index-DxxPChKC.js, manifest, precache sw.js, deep links, rollback snapshot valido). [TESTATO IN AUTOMATICO]
- [x] **Fase 2 — Auth, Identità & Multi-Viaggio**: 19/19 test superati su Firebase Emulator reale porta 8085 (creazione, riscatto invito atomico, lettura dati privati, linkWithPopup, protezione prevUid chiusa, re-invito account Google preesistente, re-ingresso senza riuso token, blocco estranei e token scaduti/revocati). [TESTATO SU FIREBASE EMULATOR]
- [x] **Fase 3 — GPS Live, Delega Guida & Storage**: 12/12 test superati su Firebase Emulator (avvio owner, vista copilota, delega guida, revoca delega, rate limit 15s/16s, quota storage satura con salvaguardia foto hounigo_live_gallery, isolamento GPS). [TESTATO SU FIREBASE EMULATOR]
- [x] **Fase 4 — Sincronizzazione Two-Client & Affidabilità**: 8/8 test superati su Firebase Emulator (sync tappe, tombstone in settings/tombstone_..., spese, offline edit & reconnect, LWW basato su updatedAt, prevenzione resurrezione). [TESTATO SU FIREBASE EMULATOR]
- [x] **Fase 5 — Regressioni UI Mobile (320px/393px) & Desktop**: Verificato con Browser Subagent (zero overflow, scrollWidth <= 320px, tocco su 📅 calendario, Google Maps a singola riga con modale unificato, tabs Altro e Live). [TESTATO IN AUTOMATICO]
- [x] **Fase 6 — Console Admin Globale**: 14 controlli statici + 7 test runtime superati (blocco query per utenti normali e trip owner, isolamento totale di system_admins, query per admin in whitelist, revoca istantanea). [TESTATO SU FIREBASE EMULATOR]
- [ ] **Test Telefono Fisico Owner & Copilota**: Da effettuare il 26 ottobre da ***REMOVED*** e ***REMOVED*** su dispositivi reali prima della distribuzione ai tester il 28 ottobre. [IN ATTESA DI COLLAUDO REALE]

---

## 7. ESITO JARVIS 2: SIMULAZIONE UTENTI REALI & MATRICE DI PRONTEZZA BETA (25-26 OTTOBRE 2026)
*Suite di simulazione: `scripts/test_jarvis2_user_simulation.cjs`*
*Ambiente: Firebase Emulator Suite v15.28.2 (Porta 8085) su OpenJDK 21 LTS*
*Esito: 14/14 percorsi utente superati con successo (100%)*

### A. Percorsi Utente Verificati
- [x] **Tester A1 (Creazione Viaggio)**: Tester A apre da smartphone e crea un nuovo viaggio senza alcuna conoscenza di Firebase, UID o Cloud Sync. Batch atomico `/trips/{id}` + `/members/{uid}` (ruolo `owner`). [SUPERATO]
- [x] **Tester A2 (Inserimento Tappa)**: Tester A aggiunge la sua prima tappa (es. *Firenze arrivo*) con orario e dettagli logistici. [SUPERATO]
- [x] **Tester A3 (Inserimento Prenotazione)**: Tester A memorizza alloggio e voucher riservato con codice PNR protetto. [SUPERATO]
- [x] **Tester A4 (Generazione Invito Copilota)**: Tester A tocca "Invita un Copilota" e genera un link con token crittografico monouso 128-bit valido 7 giorni. [SUPERATO]
- [x] **Tester A5 (Collegamento Google senza perdita dati)**: Tester A collega il proprio account Google con `linkWithPopup`: l'UID rimane identico, nessun dato o membership viene perso. [SUPERATO]
- [x] **Tester B1 (Apertura Link WhatsApp)**: Tester B apre il link `?join={tripId}&token={token}`, visualizza titolo viaggio e nome organizzatore prima di accettare. [SUPERATO]
- [x] **Tester B2 (Accettazione Invito & Nome)**: Tester B inserisce il proprio nome (*Sara*), accetta l'invito e riscatta il token atomicamente in transizione `pending -> used`. [SUPERATO]
- [x] **Tester B3 (Consultazione Condivisa)**: Tester B consulta tappe e prenotazioni create dall'organizzatore. [SUPERATO]
- [x] **Tester B4 (Modifica Condivisa)**: Tester B aggiunge e modifica elementi condivisi (es. spesa pranzo). [SUPERATO]
- [x] **Tester B5 (Rientro Successivo)**: Tester B rientra nel viaggio in una sessione successiva senza dover riutilizzare il token (riconosciuto come membro attivo). [SUPERATO]
- [x] **Tester B6 (Divieto Cancellazione Viaggio)**: Tester B non può eliminare il viaggio dell'Organizzatore (`PERMISSION_DENIED`). [SUPERATO]
- [x] **Tester C1 (Ospite LIVE senza account)**: Tester C apre `?live=1&tripId=...` e consulta il feed pubblico senza creare alcun account. [SUPERATO]
- [x] **Tester C2 (Protezione Dati Privati Ospite)**: Tester C riceve `PERMISSION_DENIED` se tenta di accedere a voucher, alloggi, tappe, spese o note private. [SUPERATO]
- [x] **Tester C3 (Impossibilità Scalata Privilegi Ospite)**: Tester C non può pubblicare aggiornamenti nel live feed né iscriversi come membro. [SUPERATO]

### B. Matrice di Prontezza Beta (5 Criteri)
1. **Primo accesso**: **SUPERATO** (3 percorsi chiari: Organizza, Accedi, Partecipa; zero gergo tecnico; avvio rapido).
2. **Creazione e recupero viaggio**: **SUPERATO** (Salvataggio cloud atomico + IndexedDB/localStorage offline; ripristino istantaneo al riavvio).
3. **Collaborazione**: **SUPERATO** (Link crittografico WhatsApp monouso, nome copilota personalizzato, modifiche sincronizzate, divieto cancellazione per il copilota).
4. **Sicurezza e privacy**: **SUPERATO** (Firestore Rules blindate su emulator reale: isolamento 100%, blocco estranei, subcollezioni private protette da `isTripMember`, console admin protetta dietro whitelist).
5. **Stabilità mobile**: **SUPERATO CON LIMITAZIONI** (UI testata a 320px e 393px; limitazioni documentate: passaggio Safari -> PWA e background GPS prolungato su iOS richiedono verifica su iPhone fisico reale; galleria ospiti remoti locale).

### C. Validazione Hotfix Google OAuth, Note Copilota e PWA (26/10/2026)
*Suite Automatizzata: `scripts/test_beta_google_copilot_pwa.cjs` (17/17 PASS - 100%)*
- [x] **Flusso Google OAuth (PWA Standalone & iOS)**:
  - Gestione atomica `auth/credential-already-in-use` con `signInWithCredential` (nessun secondo popup bloccato da Safari).
  - Transizione corretta dello stato vista `OnboardingView` verso `mode = 'account_login'`.
  - Preservazione token invito pendente (`sessionStorage: houni_pending_invite`) durante redirect/popup.
  - Empty state informativa se l'account Google non ha viaggi attivi (nessun ripristino fraudolento del viaggio `0000`).
- [x] **Note Copilota UX**:
  - Armonizzazione visiva a verde smeraldo (`emerald`) su tutte le card (`TappaCard`, `TrasportoCard`, `AttivitaCard`, `AlloggioCard`, `RistoranteCard`, `ShoppingCard`).
  - Sincronizzazione immediata 0ms dello stato React locale all'uscita dal modale.
  - Reset affidabile a grigio neutro se il testo viene rimosso.
- [x] **Tracciamento Versione & PWA Update**:
  - Iniezione dynamic commit hash (`__COMMIT_HASH__`) e data build (`__BUILD_TIME__`).
  - Controllo di aggiornamento manuale via `reg.update()` in Impostazioni e Diagnostica senza azzeramento cache/IndexedDB.
- [!] **Verifica Finale su Dispositivo Fisico Reale**:
  - Release pubblicata online: commit `f54bc9ad6e2bda06be585d4e75b945c4581f7047` (sorgente `b9dbfad`).
  - Eseguire i 3 test mirati su iPhone per validare definitivamente la chiusura del feedback beta.






