# HOUNIGO — BACKLOG DI PROGETTO
*Data ultimo aggiornamento: 25 Ottobre 2026*
*Stati ammessi: DA FARE | IN CORSO | IMPLEMENTATO | TESTATO | PUBBLICATO | VERIFICATO SU DISPOSITIVO REALE | BLOCCATO*

---

## ATTIVITÀ APERTE & SPRINT BETA RELEASE CANDIDATE (TARGET: 28 OTTOBRE 2026)

### 0. HOTFIX P0 POST-DEPLOY — Identità, Multi-Viaggio, Inviti e GPS (25 Ottobre 2026)
- **P0-A — Identità Firebase e Login Google**:
  - *Stato*: PUBBLICATO
  - Collegamento credenziali anonime a Google tramite `linkWithPopup` (preservando UID).
  - Eliminata la vulnerabilità `prevUid`: transizioni solo con linkWithPopup o re-invito.
  - Nessuna perdita di membership e nessun ritorno cieco a `0000`.
- **P0-B — Inviti già Riscattati & Re-ingresso Membro**:
  - *Stato*: PUBBLICATO
  - Token monouso strettamente monouso (`get().data.status == 'active'` prima del riscatto).
  - Membro già autorizzato accede direttamente al viaggio senza ri-consumare il token.
  - Messaggi chiari e non fuorvianti su stato invito.
- **P0-C — Selettore Multi-Viaggio**:
  - *Stato*: PUBBLICATO
  - Conservazione del viaggio attivo locale verificato e ordinamento coerente.
  - Supporto a viaggi con `ownerUid` e schema retrocompatibile `ownerId`.
  - Salvaguardia del viaggio master `0000`.
- **P0-D — GPS Owner "Quota Exceeded" & Salvaguardia Foto**:
  - *Stato*: PUBBLICATO
  - Risolto crash `localStorage.setItem` in `geolocationService.ts` tramite `safeLocalStorageSet` con auto-eviction sole cache sacrificabili e fallback in memory.
  - Fotografie in `hounigo_live_gallery` rigorosamente protette e non sacrificabili.
- **P0-E — Delega GPS "Errore Tecnico"**:
  - *Stato*: PUBBLICATO
  - Risolto rifiuto Firestore Rules in `isGpsGuideEligible` per viaggi con `ownerId`.
  - Durata lease ridotta a 18h con margine di tolleranza 36h per clock skew.
  - Rimappati gli errori tecnici Firestore su messaggi amichevoli contestualizzati.
- **P1 — Nome Copilota Riconoscibile**:
  - *Stato*: PUBBLICATO
  - Richiesta display name all'ingresso (pre-compilato con Google displayName se disponibile) salvato nei record membro.

### 1. LIVE Desktop — Risoluzione Certa e Rimozione Fallback Indiscriminato
- **Priorità**: P0 (Critica / Bloccante)
- **Stato**: IMPLEMENTATO
- **Dipendenze**: Nessuna
- **Criteri di Accettazione**:
  - Nessun crash su desktop in Mappa Interattiva e LIVE Tracking GPS. [SUPERATO]
  - Desktop in sola consultazione senza forzare cattura GPS o assumere ruolo guida. [SUPERATO]
  - Gestione robusta dei timestamp Firestore (supporto POJO `{ seconds }`, millisecondi, Date). [SUPERATO]
  - Errori di rete e permessi intercettati e spiegati. [SUPERATO]
  - Rimosso il fallback indiscriminato `activeTripId || '0000'`: in assenza di tripId autenticato o autorizzato, mostrare schermata recuperabile di selezione viaggio senza chiamate a vuoto su Firestore. [SUPERATO]

### 2. Sincronizzazione Galleria LIVE Pubblica su Dispositivi Ospiti
- **Priorità**: P0 / Architetturale
- **Stato**: BLOCCATO
- **Dipendenze**: Decisione e autorizzazione architettura Storage (Firebase Storage / CDN)
- **Criteri di Accettazione**:
  - Gli ospiti remoti indipendenti attualmente non vedono le immagini salvate localmente in `localStorage['hounigo_live_gallery']`.
  - Nessuna introduzione di Base64 su Firestore né permessi pubblici di scrittura senza autorizzazione.
  - Funzionalità dichiarata come non completata nella galleria pubblica per trasparenza, in attesa di configurazione Firebase Storage.

### 3. LIVE Più Compatto su Smartphone
- **Priorità**: P1
- **Stato**: PUBBLICATO
- **Dipendenze**: LiveEditorialExperience.tsx
- **Criteri di Accettazione**:
  - Sintesi immediata della posizione e ultimo aggiornamento GPS.
  - Altezza mappa ottimizzata per schermi mobile (240px-280px su smartphone).
  - Controlli guida e trasferimento riuniti in pannello/cassetto comprimibile.
  - Anteprima fotografica orizzontale scorrevole mantenuta.
  - Ultima cartolina in evidenza e accesso pulito all'archivio paginato.
  - Nessun overflow o taglio a 393px e 320px CSS.

### 4. Card Trasporti e Card Principali Estremamente Compatte
- **Priorità**: P1
- **Stato**: PUBBLICATO
- **Dipendenze**: TrasportoCard.tsx
- **Criteri di Accettazione**:
  - Riduzione dell'altezza complessiva della card.
  - Orari e destinazioni in massima evidenza.
  - Avviso check-in sintetizzato in una riga compatta ed elegante.
  - Dettagli secondari e modali operativi facilmente accessibili.
  - Testi chiaramente leggibili anche da utenti non digitalizzati.

### 5. Sezione Altro, Impostazioni e Gestione Viaggio — Riorganizzazione Architettura Informativa
- **Priorità**: P1
- **Stato**: IN CORSO
- **Dipendenze**: AltroView.tsx, SettingsMenu.tsx, DesktopNavigation.tsx
- **Criteri di Accettazione**:
  - Funzioni quotidiane subito raggiungibili (LIVE, Documenti, Spese, Bagagli, Note, Assicurazione, Emergenze, Toolkit).
  - Gestione viaggio in posizione coerente e non duplicata.
  - Impostazioni tecniche e ruolo dispositivo raggruppate e non invasive.
  - Rimozione della Console Amministratore e diagnostiche tecniche dai menu utente standard dei tester.

### 6. Primo Accesso (Onboarding Immediato a 3 Intenzioni)
- **Priorità**: P1
- **Stato**: IN CORSO
- **Dipendenze**: OnboardingView.tsx
- **Criteri di Accettazione**:
  - 3 intenzioni principali visibili al primo sguardo:
    1. Organizza un viaggio (Crea)
    2. Accedi al mio viaggio (Google / Email multi-dispositivo)
    3. Partecipa a un viaggio (Codice o link invito)
  - Eliminazione di gergo tecnico (UID, Firebase, ruoli astratti) dal primo accesso.
  - Progressive disclosure: informazioni richieste solo al momento del bisogno.
  - Ingresso rapido al roadbook senza schermate inutili intermedie.

### 7. Console Admin Globale — Protezione Tester e Procedura Autorizzazione
- **Priorità**: P1
- **Stato**: IMPLEMENTATO
- **Dipendenze**: firestore.rules, AdminDashboardView.tsx
- **Criteri di Accettazione**:
  - Chiarito il motivo del "NON AUTORIZZATO": l'utente è owner del viaggio `0000`, ma non è registrato in `/system_admins/{uid}` in Firestore né possiede il custom claim `admin: true`.
  - Preparata procedura minima server-side per abilitare esclusivamente l'amministratore legittimo.
  - Console nascosta dalla navigazione standard dei tester.
  - Interfaccia semplificata in stato non autorizzato senza stack trace invasivi.

### 8. Hotfix Beta — Inviti Copilota, Isolamento Dati e Regressioni UI (25 Ottobre 2026)
- **HOTFIX-01 — Risoluzione Errore Invito Copilota**:
  - Priorità: P0 (Critica / Bloccante)
  - Stato: TESTATO (19/19 test superati)
  - Modifiche: Scrittura immediata `/trips/{id}` e `/members/{ownerUid}` su Firestore, parsing sicuro link/codice invito copilota, auto-join con assegnazione ruolo 'copilota', aggiornamento minimo Security Rules per custom trips.
- **HOTFIX-02 — Isolamento Totale Dati & Cache Multi-Viaggio**:
  - Priorità: P0 (Critica / Bloccante)
  - Stato: TESTATO (19/19 test superati)
  - Modifiche: Chiusura e reset connessioni IndexedDB su cambio viaggio (`closeAndResetDatabases`), flush immediato della memoria in-memory di `StorageService`, isolamento seed Nuova Zelanda esclusivamente su viaggio `0000`, eliminazione fallbacks hardcoded in `tripDates.ts` e `OggiView.tsx`.
- **HOTFIX-03 — Ripristino Card Google Maps Compatta 2 Righe**:
  - Priorità: P1
  - Stato: TESTATO / VERIFICATO IN BROWSER
  - Modifiche: Card a due righe immediate (Auto / A piedi) con azioni Apri/Modifica/Aggiungi senza sottocard e senza ingombri sproporzionati su smartphone.
- **HOTFIX-04 — Ripristino Sezione Altro Compatta**:
  - Priorità: P1
  - Stato: TESTATO / VERIFICATO IN BROWSER
  - Modifiche: Rimozione riquadri decorativi e intestazioni duplicate, griglia compatta a 2 colonne, accesso pulito a Gestione Viaggio e Ruolo Dispositivo.

### 9. Chiusura Beta 28 Ottobre — Modalità Jarvis (25 Ottobre 2026)
- **P0-A — GPS LIVE del Proprietario (Risoluzione "Non attivata" & Action Card)**:
  - Priorità: P0 (Critica / Bloccante)
  - Stato: TESTATO / PRONTO PER VERIFICA SU DISPOSITIVO REALE
  - Modifiche: Corretta omissione di `online` prop in `LiveEditorialExperience`, gestione 7 stati di inattività (`not_started`, `permission_denied`, `acquiring`, `other_device_active`, `offline`, `paused`, `technical_error`), Action Card GPS in evidenza, istruzioni contestuali iOS/Safari, separazione esplicita posizione programmata da GPS reale.
- **P0-B — Invito Copilota Sicuro & Crittografico (Firebase Spark Compatible)**:
  - Priorità: P0 (Critica / Bloccante)
  - Stato: TESTATO SU EMULATORE REALE (24/24 suite emulatore + 14/14 suite jarvis + 50/50 suite collaborazione)
  - Modifiche: Architettura con token 128-bit imprevedibile (`crypto.randomUUID()`), collezione `/trips/{tripId}/invites/{token}`, scadenza a 7 giorni, monouso, validazione atomica server-side in `firestore.rules` con `getAfter(...)` compatibile con piano gratuito Spark (0 Cloud Functions, $0 costi), divieto assoluto auto-join con solo `tripId`, divieto lettura dati privati prima del join, blindatura get `/trips/{tripId}` (solo membri ed admin), supporto unificato `ownerUid` e `ownerId`, protezione assoluta viaggio master `0000`. Testata su Firebase Emulator reale porta 8085 con OpenJDK 21. Sincronizzati al 100% i file `firestore.rules` in root e `ViaggiodiNozze`.
- **P1-A — Selezione dei Viaggi Dopo il Login & Isolamento Dati**:
  - Priorità: P1
  - Stato: TESTATO
  - Modifiche: Query sicura da `/users/{uid}/associatedTripIds` ed esecuzione di singoli `getDoc`, classificazione Organizzatore vs Copilota, indicazione ultimo viaggio utilizzato, `TripSelectorModal.tsx`, `switchActiveTrip` con azzeramento IndexedDB e flush cache di memoria.
- **P1-B — Gestione Gmail Ultra-Compatta a Riga Singola**:
  - Priorità: P1
  - Stato: TESTATO
  - Modifiche: Nuovo componente `GmailConnectionRow.tsx` a riga singola orizzontale, cassetto informativo comprimibile per dettagli permessi `gmail.readonly`, preservazione identità Firebase senza alterazione UID.
- **P1-C — Riorganizzazione Sezione Altro Basata sui Compiti (Task-Based)**:
  - Priorità: P1
  - Stato: TESTATO / VERIFICATO IN BROWSER
  - Modifiche: Riorganizzazione completa in 4 macro-compiti (LIVE & Posizione, Documenti & Risorse, Sicurezza & Assistenza, Gestione Viaggio & Dispositivo), eliminazione riquadri ridondanti, responsive testato a 393px, 320px e desktop.

- **JARVIS-SMOKE — Script Smoke Test Post-Deploy Non-Distruttivo**:
  - Priorità: P0
  - Stato: TESTATO (18/18 controlli superati)
  - Modifiche: Realizzato `scripts/post_deploy_smoke_test.cjs` per verificare caricamento HTML, bundle JS/CSS, manifest PWA, service worker, viewport mobile e assenza di scritture su 0000.
- **JARVIS-GUIDE — Guida per i Beta Tester e Protocollo Feedback**:
  - Priorità: P1
  - Stato: COMPLETATO
  - Modifiche: Creata `docs/HOUNIGO_TESTER_GUIDE.md` con flussi essenziali, limitazioni beta note e classificazione feedback (CRITICO / IMPORTANTE / MIGLIORAMENTO) senza dipendenze esterne.
- **JARVIS-DEPLOY — Procedura di Deploy e Piano di Rollback Coordinato**:
  - Priorità: P0
  - Stato: PUBBLICATO
  - Modifiche: Riconciliati e allineati al 100% i file `firestore.rules`, eseguito il deploy delle Security Rules su `app-viaggio-di-nozze`, completato il deploy del frontend su GitHub Pages (`gh-pages`).

### 10. Chiusura Hotfix, Sicurezza e UI Beta (25 Ottobre 2026)
- **HOTFIX-SEC-01 — Chiusura Vulnerabilità prevUid & Test Avversariale**:
  - Priorità: P0 (Critica / Sicurezza)
  - Stato: COMPLETATO E CONVALIDATO SU EMULATORE (16/16 test)
  - Modifiche: Eliminata la condizione `prevUid` da `firestore.rules`. Rimosso `handleAnonymousToGoogleTransition`. Test avversariale su Firestore Emulator con Owner A, Copilota B e Attaccante C: C respinto anche conoscendo l'UID di B. Conservato collegamento credenziali via `linkWithPopup`.
- **HOTFIX-STORAGE-01 — Salvataggio Locale Sicuro & Protezione Foto**:
  - Priorità: P0 (Critica / Integrità Dati)
  - Stato: COMPLETATO E CONVALIDATO
  - Modifiche: Rimossa `hounigo_live_gallery` da `purgeable`. Separazione netta tra cache rigenerabili (OSM/meteo) e contenuti utente non recuperabili (foto, note, documenti). Fallback su `sessionStorage` e memoria runtime con avviso non bloccante.
- **HOTFIX-CAL-01 — Ripristino Calendario in Oggi (Touch & Desktop)**:
  - Priorità: P1
  - Stato: COMPLETATO E CONVALIDATO
  - Modifiche: Risolto bug mancata apertura datepicker su iOS Safari / WebKit touch; introdotto container interattivo con input trasparente a copertura integrale e fallback `showPicker()`.
- **HOTFIX-MAP-01 — Google Maps Ultra-Compatto su Singola Riga**:
  - Priorità: P1
  - Stato: COMPLETATO E CONVALIDATO
  - Modifiche: Singola riga orizzontale con icona ufficiale Google Maps, pulsante Auto, pulsante Piedi e singola matita che apre modale unificato per entrambi i collegamenti. Testato a 320px e 393px senza overlap.
- **HOTFIX-ADM-01 — Procedura Sicura Console Admin Globale**:
  - Priorità: P1
  - Stato: COMPLETATO E DOCUMENTATO
  - Modifiche: Definita e verificata la procedura manuale per autorizzare esclusivamente l'UID designato in `/system_admins/{uid}` su Firebase Console.

---

## TABELLA DI AVANZAMENTO GLOBALE

| ID | Attività | Priorità | Stato | Data |
| :--- | :--- | :--- | :--- | :--- |
| QA-PHASE-1 | Riconciliazione Versione Online & Rollback Snapshot (28/28 check) | P0 | TESTATO IN AUTOMATICO | 25/10/2026 |
| QA-PHASE-2 | Auth, Identità, Multi-Viaggio & Token Scaduti/Revocati (19/19 test) | P0 | TESTATO SU FIREBASE EMULATOR | 25/10/2026 |
| QA-PHASE-3 | GPS Live, Delega Guida, Throttling & Protezione Foto Storage (12/12) | P0 | TESTATO SU FIREBASE EMULATOR | 25/10/2026 |
| QA-PHASE-4 | Sincronizzazione Two-Client, LWW, Tombstones & Isolamento (8/8) | P0 | TESTATO SU FIREBASE EMULATOR | 25/10/2026 |
| QA-PHASE-5 | Regressioni UI Mobile 320px/393px, Calendario & Maps (Browser Subagent) | P1 | TESTATO IN AUTOMATICO | 25/10/2026 |
| QA-PHASE-6 | Console Admin Globale, Whitelist system_admins & Revoca (7/7 test) | P1 | TESTATO SU FIREBASE EMULATOR | 25/10/2026 |
| HOTFIX-SEC-01 | Chiusura Vulnerabilità prevUid & Test Avversariale (3 Identità) | P0 | PUBBLICATO | 25/10/2026 |
| HOTFIX-STORAGE-01 | Salvataggio Locale Sicuro & Protezione Foto hounigo_live_gallery | P0 | PUBBLICATO | 25/10/2026 |
| HOTFIX-CAL-01 | Ripristino Calendario Oggi (Touch iOS/Android & Desktop) | P1 | PUBBLICATO | 25/10/2026 |
| HOTFIX-MAP-01 | Google Maps Ultra-Compatto a Riga Singola (Auto/Piedi/Matita) | P1 | PUBBLICATO | 25/10/2026 |
| HOTFIX-ADM-01 | Procedura Sicura Console Admin Globale (/system_admins/{uid}) | P1 | PUBBLICATO | 25/10/2026 |
| JARVIS-DEPLOY | Procedura di Deploy Coordinato e Piano di Rollback | P0 | PUBBLICATO | 25/10/2026 |
| JARVIS-SMOKE | Script Smoke Test Post-Deploy Non-Distruttivo (18/18 check) | P0 | PUBBLICATO / ATTIVO | 25/10/2026 |
| JARVIS-GUIDE | Guida per i Beta Tester & Protocollo Feedback | P1 | PUBBLICATO | 25/10/2026 |
| JARVIS-P0A | GPS LIVE del Proprietario (Risoluzione bug 'Non attivata', 7 stati, GPS Action Card) | P0 | PUBBLICATO | 25/10/2026 |
| JARVIS-P0B | Invito Copilota Sicuro Crittografico (Token 128-bit, Spark-Compatible, Blocco auto-join) | P0 | PUBBLICATO | 25/10/2026 |
| JARVIS-P1A | Selezione Viaggi Dopo il Login (Organizzatore/Copilota, Switch con Reset Cache) | P1 | PUBBLICATO | 25/10/2026 |
| JARVIS-P1B | Gestione Gmail Compatta (Riga singola orizzontale, Drawer info comprimibile) | P1 | PUBBLICATO | 25/10/2026 |
| JARVIS-P1C | Sezione Altro Task-Based (4 Aree di Compito, Zero Ridondanze, Responsive) | P1 | PUBBLICATO | 25/10/2026 |
| HOTFIX-01 | Risoluzione Errore Invito Copilota & Auto-join Multi-Identità | P0 | TESTATO | 25/10/2026 |
| HOTFIX-02 | Isolamento Totale Dati & Cache Multi-Viaggio (Zero Contaminazione) | P0 | TESTATO | 25/10/2026 |
| HOTFIX-03 | Ripristino Card Google Maps Compatta (Auto/Piedi 2 righe) | P1 | TESTATO | 25/10/2026 |
| HOTFIX-04 | Ripristino Sezione Altro Compatta & Pulita | P1 | TESTATO | 25/10/2026 |
| P0-01 | Risoluzione Regressione LIVE Desktop & Rimozione Fallback '0000' | P0 | PUBBLICATO | 25/10/2026 |
| P0-02 | Audit Sincronizzazione Galleria Fotografica Multi-Device | P0 | BLOCCATO (Post-Beta) | 25/10/2026 |
| P1-01 | Riorganizzazione Compatta LIVE Experience Mobile | P1 | PUBBLICATO | 25/10/2026 |
| P1-02 | Restyling Compatto Card Trasporti (Check-in su riga singola) | P1 | PUBBLICATO | 25/10/2026 |
| P1-03 | Audit Architettura Informativa Sezione Altro & Impostazioni | P1 | PUBBLICATO | 25/10/2026 |
| P1-04 | Semplificazione Onboarding a 3 Intenzioni Dirette | P1 | PUBBLICATO | 25/10/2026 |
| P1-05 | Isolamento Console Admin Globale dal Percorso Tester | P1 | PUBBLICATO | 25/10/2026 |
| MAP-01 | Nuova Card Maps Travel Editorial (Auto & Piedi) | P1 | PUBBLICATO | 25/10/2026 |
| MAP-02 | Gestione Limite Tecnico 10 Tappe Google Maps | P1 | PUBBLICATO | 25/10/2026 |
| MAP-03 | Migrazione Dati Retrocompatibile Link Preesistenti | P1 | PUBBLICATO | 25/10/2026 |
| LIVE-01 | Parsing Sicuro Timestamp Firestore Multi-Formato | P0 | PUBBLICATO | 25/10/2026 |
| LIVE-02 | Desktop Readonly & No Auto-Guide Role Switch | P0 | PUBBLICATO | 25/10/2026 |
| PK2-02 | Cartolina di Viaggio (Paginazione 10 msg, Ordinamento, Delete Sposi) | P1 | PUBBLICATO | 25/10/2026 |
| PK2-03 | GPS Affidabile (4 stati, Timestamp HH:mm — data, Avviso iOS) | P1 | PUBBLICATO | 25/10/2026 |
| PK0-01 | Ownership Permanente Viaggio `0000` (`cqs2OcE7...`) | P0 | IMPLEMENTATO / VERIFICATO | 24/10/2026 |

