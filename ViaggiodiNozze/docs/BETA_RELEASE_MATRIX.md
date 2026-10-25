# HOUNIGO — MATRICE DI RILASCIO BETA (BETA RELEASE MATRIX)
*Data target: 28 Ottobre 2026*
*Obiettivo: Prima release stabile fruibile da un gruppo di beta tester esterni (Web/PWA).*

---

## 1. CRITERI DI QUALITÀ PER LA RELEASE CANDIDATE (RC)

| Area | Criterio Minimo Richiesto | Stato Attuale | Note Operative |
| :--- | :--- | :--- | :--- |
| **Chiusura prevUid** | Rifiuto categorico di membership create via prevUid da attaccanti; solo linkWithPopup o re-invito. | TESTATO / BLINDATO | Test avversariale emulatore (16/16); Attaccante C respinto anche conoscendo UID di B |
| **Protezione Foto & Storage** | QuotaExceededError non elimina fotografie ('hounigo_live_gallery') né dati utente; fallback session/memory. | TESTATO / PROTETTO | Rimosso hounigo_live_gallery da purgeable; pulizia selettiva sole cache OSM/meteo; zero perdite |
| **Calendario in Oggi** | Tocco e click immediato su icona 📅 su mobile (iOS Safari/Android) e desktop. | TESTATO / RIPRISTINATO | Overlay trasparente a piena area con fallback programmatico showPicker() |
| **Card Google Maps** | Barra ultra-compatta a singola riga su smartphone (Icona Maps, 🚗, 🚶, ✏️ unificata), responsive 320px. | TESTATO / CONSOLIDATO | Singola riga orizzontale, modale unificato Auto + Piedi, no overflow a 320px |
| **GPS LIVE Proprietario** | Diagnosi esatta "Non attivata" (7 stati), pulsante esplicito Guida, Action Card sotto mappa, istruzioni iOS. | TESTATO (Pronto x Fisico) | Risolto bug `online` undefined; Action Card contestuale; distinzione GPS reale vs programmato |
| **Invito Copilota Sicuro** | Link crittografico 128-bit imprevedibile, monouso, 7gg, batch atomico Firestore Spark con `getAfter`, no auto-join. | TESTATO | 16/16 test passati; zero funzioni Cloud ($0 Spark); protezione assoluta viaggio 0000 |
| **Selezione Viaggi Post-Login** | Lista viaggi posseduti e copilota (`/users/{uid}`), switch istantaneo con reset IndexedDB e cache. | TESTATO | Modale `TripSelectorModal`; isolamento dati 100% senza scansioni globali non autorizzate |
| **Gmail Compatto** | Riga singola orizzontale (stato, account, azione principale), drawer espandibile per permessi `gmail.readonly`. | TESTATO | Integrato in `SmartInsertModal` e `DocumentiView`; preserva identità e permessi |
| **Sezione Altro Task-Based** | 4 macro-compiti (LIVE, Documenti, Sicurezza, Gestione), zero duplicazioni o riquadri superflui, responsive 393/320px. | TESTATO | Riorganizzazione editoriale completata; verificata con browser subagent |
| **Isolamento Dati Viaggi** | Isolamento 100% tra viaggi diversi nello stesso browser. Seed Nuova Zelanda solo per '0000'. | TESTATO | Reset connessioni IndexedDB, flush memoryCache, zero contaminazione date/titoli |
| **LIVE Desktop** | Consultazione mappa e GPS senza assumere il ruolo guida. Gestione sicura timestamp e tripId. | PUBBLICATO | Rimosso fallback '0000', schermo di selezione recuperabile |
| **LIVE Mobile** | Schermata compatta, gerarchia chiara, controlli guida raggruppati, responsive 393/320px. | PUBBLICATO | LiveEditorialExperience con mappa 220-360px e controlli comprimibili |
| **Galleria Foto Multi-Device** | Condivisione pubblica foto organizzatore -> ospiti indipendenti. | BLOCCATO (Post-Beta) | Locale attivo; disclaimers beta espliciti; storage cloud post-beta |
| **Card Trasporti** | Check-in su riga compatta, orari IATA leggibili, azioni biglietto/PNR chiare. | PUBBLICATO | TrasportoCard con check-in su singola riga orizzontale |
| **Console Admin Globale** | Nascosta ai tester. Autorizzazione rigorosa `system_admins`. UI snella se non autorizzato. | DOCUMENTATO | Procedura manuale Firebase Console per /system_admins/{uid}; isolata con ?admin=1 |
| **Persistenza & Offline** | Nessuna perdita dati, funzionamento offline di base (IndexedDB + LocalStorage). | PUBBLICATO | Verificato con test di persistenza e tombstone |

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

- [x] **Deploy Firestore Rules**: Regole caricate e compilate con successo su `app-viaggio-di-nozze`.
- [x] **Deploy GitHub Pages**: Frontend pubblicato su branch `gh-pages` (`b677d2d`).
- [x] **Caricamento frontend**: Pagina principale HTTP 200, mount `<div id="root">` presente.
- [x] **Metadati viewport mobile**: Tag viewport configurato per tutti i display smartphone.
- [x] **Integrità bundle JS e CSS**: Script principale (`index-D_jtqkoZ.js`) e foglio di stile (`index-Du7XQE7-.css`) scaricati e validati.
- [x] **PWA Manifest & Icone**: `manifest.webmanifest` valido, display standalone e set icone integro.
- [x] **Service Worker**: `sw.js` attivo con Workbox cache e precache configurata.
- [x] **Nessun tocco ai dati di produzione 0000**: Nessuna scrittura o modifica sul viaggio master.
- [x] **Procedura di pubblicazione e piano di rollback**: Backup regole salvato in `docs/firestore.rules.backup-pre-beta`.



