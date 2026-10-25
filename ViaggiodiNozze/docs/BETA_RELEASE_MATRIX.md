# HOUNIGO — MATRICE DI RILASCIO BETA (BETA RELEASE MATRIX)
*Data target: 28 Ottobre 2026*
*Obiettivo: Prima release stabile fruibile da un gruppo di beta tester esterni (Web/PWA).*

---

## 1. CRITERI DI QUALITÀ PER LA RELEASE CANDIDATE (RC)

| Area | Criterio Minimo Richiesto | Stato Attuale | Note Operative |
| :--- | :--- | :--- | :--- |
| **GPS LIVE Proprietario** | Diagnosi esatta "Non attivata" (7 stati), pulsante esplicito Guida, Action Card sotto mappa, istruzioni iOS. | TESTATO (Pronto x Fisico) | Risolto bug `online` undefined; Action Card contestuale; distinzione GPS reale vs programmato |
| **Invito Copilota Sicuro** | Link crittografico 128-bit imprevedibile, monouso, 7gg, batch atomico Firestore Spark con `getAfter`, no auto-join. | TESTATO | 14/14 test passati; zero funzioni Cloud ($0 Spark); protezione assoluta viaggio 0000 |
| **Selezione Viaggi Post-Login** | Lista viaggi posseduti e copilota (`/users/{uid}`), switch istantaneo con reset IndexedDB e cache. | TESTATO | Modale `TripSelectorModal`; isolamento dati 100% senza scansioni globali non autorizzate |
| **Gmail Compatto** | Riga singola orizzontale (stato, account, azione principale), drawer espandibile per permessi `gmail.readonly`. | TESTATO | Integrato in `SmartInsertModal` e `DocumentiView`; preserva identità e permessi |
| **Sezione Altro Task-Based** | 4 macro-compiti (LIVE, Documenti, Sicurezza, Gestione), zero duplicazioni o riquadri superflui, responsive 393/320px. | TESTATO | Riorganizzazione editoriale completata; verificata con browser subagent |
| **Isolamento Dati Viaggi** | Isolamento 100% tra viaggi diversi nello stesso browser. Seed Nuova Zelanda solo per '0000'. | TESTATO | Reset connessioni IndexedDB, flush memoryCache, zero contaminazione date/titoli |
| **LIVE Desktop** | Consultazione mappa e GPS senza assumere il ruolo guida. Gestione sicura timestamp e tripId. | PUBBLICATO | Rimosso fallback '0000', schermo di selezione recuperabile |
| **LIVE Mobile** | Schermata compatta, gerarchia chiara, controlli guida raggruppati, responsive 393/320px. | PUBBLICATO | LiveEditorialExperience con mappa 220-360px e controlli comprimibili |
| **Galleria Foto Multi-Device** | Condivisione pubblica foto organizzatore -> ospiti indipendenti. | BLOCCATO (Post-Beta) | Locale attivo; disclaimers beta espliciti; storage cloud post-beta |
| **Card Trasporti** | Check-in su riga compatta, orari IATA leggibili, azioni biglietto/PNR chiare. | PUBBLICATO | TrasportoCard con check-in su singola riga orizzontale |
| **Card Google Maps** | Struttura compatta 2 righe (Auto / Piedi: Apri/Modifica/Aggiungi), avviso limite 10 tappe. | TESTATO | DayMapsCard a 2 righe, zero sottocard ingombranti, retrocompatibile |
| **Console Admin Globale** | Nascosta ai tester. Autorizzazione rigorosa `system_admins`. UI snella se non autorizzato. | PUBBLICATO | Rimosso accesso da menu utenti, isolata con ?admin=1 |
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
- [x] **Test 14: Screenshot mobile e desktop**: Verificati viewport 393px, 320px e 1280px con browser subagent. [SUPERATO]
- [ ] **Test Telefono Fisico Owner su Rete Reale (PWA iOS)**: Collaudo finale geolocalizzazione sul dispositivo reale dell'owner pre-apertura tester 28 ottobre.
