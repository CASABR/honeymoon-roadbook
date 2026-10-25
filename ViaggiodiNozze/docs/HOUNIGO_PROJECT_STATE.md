# HOUNIGO — STATO DEL PROGETTO (PROJECT STATE)
*Data ultimo aggiornamento: 25 Ottobre 2026*
*Repository: CASABR/honeymoon-roadbook*
*Branch corrente di lavoro: work/product-completion*

---

## 1. VISIONE E OBIETTIVO DEL PROGETTO
Hounigo è una Progressive Web App (PWA) Travel Editorial per il viaggio di nozze in Nuova Zelanda (viaggio `0000`), con esperienza di consultazione offline, gestione delle tappe, trasporti, alloggi, diario di bordo e sezione **LIVE Experience** per la condivisione in tempo reale con familiari e amici ("ospiti esterni").

---

## 2. DECISIONI ARCHITETTURALI FONDAMENTALI
1. **Ownership e Sicurezza Viaggio `0000`**:
   - Owner permanente: `cqs2OcE7WzY7XmiqVoZmM7B6Fpp2` (account Google definitivo).
   - Security Rules: isolamento rigoroso multi-tenant, protezione dei dati sensibili (costi, voucher, documenti) e whitelist rigida per le collezioni pubbliche (`trips/{tripId}/live`).
   - Nessuna migrazione dati o modifica ownership non autorizzata.
2. **Identità e Ruoli Dispositivi**:
   - Modalità multi-dispositivo supportata tramite `useAuthIdentity` e `deviceSession.ts`.
   - Ruoli distinti: `organizzatore` (owner/copilota), `guida` (dispositivo fisico con lease GPS attivo), `viewer` e `ospite esterno` (accesso standalone via `?live=1`).
   - Dispositivi Desktop: operano come display di consultazione e monitoraggio dell'itinerario e del segnale della guida mobile, senza forzare la cattura GPS da browser fisso.
3. **LIVE Tracking & GPS Lease**:
   - Single-leader lease model: un solo dispositivo guida alla volta può inviare coordinate attive (`liveGpsService.ts`).
   - I client secondari (incluso desktop, tablet e ospiti) operano come consumatori in tempo reale del feed live via listener Firestore.
   - Throttling a 16s e timeout di stale lease a 120s per prevenire flood e costi operativi.
4. **Architettura Dati Google Maps Giornalieri**:
   - Gestione differenziata e parallela per **Itinerario in Auto** (`driving`) e **Itinerario a Piedi** (`walking`).
   - Gestione chiara del limite tecnico Google Maps (10 tappe/punti massimi per URL di rotta).
   - Retrocompatibilità al 100%: i link salvati con il formato legacy `day_maps_link_{date}` vengono importati automaticamente come percorsi auto senza alcuna perdita dati.

---

## 3. FUNZIONALITÀ COMPLETATE E PROBLEMI RISOLTI

### Risoluzione Regressione LIVE Desktop (Priorità Critica)
- **Causa individuata**: 
  1. `TypeError: Cannot read properties of undefined (reading 'slice')` su `remoteGpsLease.holderDeviceId` quando il lease è presente ma `holderDeviceId` è indefinito.
  2. `RangeError: Invalid time value` in `LiveView.tsx` durante il parsing di `header.statusUpdatedAt` contenente Timestamp Firestore POJO `{ seconds, nanoseconds }`.
  3. Eccezioni non gestite sui listener Firestore `onSnapshot` (`subscribeToLiveHeader`, `subscribeToLiveUpdates`) in assenza di error callback.
  4. Valore `activeTripId` indefinito su desktop in assenza del parametro URL e con tripConfig non ancora idratato: RIMOSSO il fallback cieco `'0000'`. Se non è presente un viaggio autenticato/configurato, viene mostrata una schermata recuperabile di selezione senza chiamate orfane su Firestore.
  5. `Math.round(remoteGpsLocation.accuracy)` che restituiva `NaN` in assenza di accuracy.
- **Risoluzione applicata**:
  - Implementata utility robusta `parseSafeDate` che normalizza Timestamp Firestore (istanze o POJO `{ seconds }`), millisecondi, Date e stringhe ISO.
  - Safe navigation su `holderDeviceId` e `accuracy`.
  - Aggiunti error handler dedicati a tutti i listener Firestore.
  - Modalità desktop: esplicito ruolo di ascolto del dispositivo guida mobile.

### Beta Release Candidate — Consolidamento e Semplificazione UX (25 Ottobre 2026)
- **LIVE Experience Compatta su Mobile**:
  - Mappa ridotta a 220px-360px per garantire visibilità immediata della posizione.
  - Live Intelligence trasformata in una pill compatta a singola riga con toggle espandibile `▼ Programma / ▲ Sintesi`.
  - Controlli di trasmissione Guida e Co-pilota inseriti in cassetto comprimibile.
  - Cartolina più recente in primo piano con archivio paginato comprimibile per non allungare la vista.
  - Risolti overflow a 393px e 320px CSS.
- **Card Trasporti Ultra-Compatte**:
  - Box check-in convertito in riga orizzontale compatta a singola linea, preservando orario di chiusura, anticipo al terminal/porto e badge di stato senza frammentazione.
- **Architettura Informativa Sezione Altro**:
  - Riorganizzazione in 3 sezioni editoriali: *In Evidenza* (Live, Documenti), *Strumenti del Viaggio* (Spese, Note, Bagagli, Assicurazione, Emergenze, Toolkit) e *Gestione Viaggio & Dispositivo*.
  - Rimozione di link e pulsanti tecnici di amministrazione/diagnostica dalla navigazione standard dei tester.
- **Primo Accesso (Onboarding a 3 Intenzioni)**:
  - Schermata di selezione iniziale impostata direttamente sulle tre intenzioni essenziali del viaggiatore:
    1. *Organizza un viaggio*
    2. *Accedi al mio viaggio* (con Google ed Email multi-dispositivo)
    3. *Partecipa a un viaggio* (con codice o invito)
  - Eliminato qualsiasi gergo tecnico, menzione di UID o riferimenti a Firebase.
- **Console Amministratore Globale**:
  - Chiarito il motivo del messaggio "NON AUTORIZZATO" nello screenshot utente: per effettuare query globali su `/trips` le Security Rules richiedono un documento in `/system_admins/{uid}` o il custom claim `admin: true`.
  - Console isolata dai percorsi utente standard (accessibile solo con parametro esplicito `?admin=1`).

### Card Itinerario Google Maps — Restyling Funzionale Travel Editorial
- Nuova card `DayMapsCard.tsx` integrata in `OggiView.tsx`.
- Gestione separata e indipendente di:
  - 🚗 **Itinerario in Auto** (`driving`)
  - 🚶 **Itinerario a Piedi** (`walking`)
- Riconoscimento immediato: percorsi presenti evidenziati con badge di stato e note; percorsi assenti con callout tratteggiato ed esplicito pulsante di inserimento.
- Chiarimento del limite Google Maps: se il percorso ha 10 o più tappe (oppure è spuntato come completo), compare l'avviso tecnico esplicativo: *"Questo itinerario ha raggiunto il limite tecnico imposto da Google Maps (1 partenza + 9 tappe). Non è possibile aggiungere altre soste a questo link."*, superando il badge criptico "Piena".
- Rilevamento automatico delle tappe presenti da URL Google Maps `/maps/dir/`.
- Modale completa di aggiunta, modifica, sostituzione e rimozione.

### Hotfix Beta — Inviti Copilota, Isolamento Dati e Regressioni UI (25 Ottobre 2026)
- **Risoluzione P0 — Errore Invito Copilota**:
  - **Causa individuata**: 
    1. Creazione viaggio: `handleCreate` salvava la configurazione solo in locale, omettendo la scrittura del documento `/trips/{id}` e `/trips/{id}/members/{ownerUid}` su Firestore.
    2. Security Rules: `allow get: if isSignedIn() && (isTripMember(tripId) || isGlobalAdmin())` impediva al copilota invitato di verificare l'esistenza del viaggio tramite ID, restituendo `PERMISSION_DENIED` / errore generico di connessione.
    3. Flusso di Join: `executeJoin` richiedeva che l'UID fosse già presente in `members`, impedendo il primo accesso tramite invito valido.
  - **Risoluzione applicata**:
    1. `handleCreate` ora crea immediatamente il documento `/trips/{id}` e il member doc owner con `writeBatch` e `recordUserAccess`.
    2. `executeJoin` supporta l'auto-join guidato con link d'invito (`invite=true` o `role=copilota`): crea il documento `/members/{copilotUid}` e aggiunge il proprio UID alla whitelist `members` del viaggio.
    3. `firestore.rules`: preparata modifica minima e rigorosa che permette `get` su `/trips/{tripId}` agli utenti autenticati (per consentire la risoluzione del codice/link), e permette l'auto-join per i viaggi custom (`tripId != '0000'`). Nessuna subcollezione privata (tappe, spese, note, documenti) viene esposta: l'accesso ai contenuti rimane protetto da `isTripMember(tripId)`. Il viaggio `0000` rimane intatto e blindato.
- **Risoluzione P0 — Isolamento Totale Dati e Neutralizzazione Contaminazione Viaggi**:
  - **Causa individuata**:
    1. Connessioni IndexedDB aperte mantenute in cache in `dbPromises` senza chiusura né riconnessione sul cambio viaggio.
    2. Cache in memoria `memoryCache` di `StorageService` non invalidata al cambio di viaggio attivo.
    3. Seed legacy Nuova Zelanda `seedRealActivities()` invocato anche per nuovi viaggi.
    4. Fallback date hardcoded (`2026-11-28`, `2027-01-10`) e `detectCountry()` in `OggiView.tsx` che forzava destinazioni della Nuova Zelanda su viaggi generici.
    5. Chiave localStorage `hero_bg_image` globale anziché vincolata al `tripId`.
  - **Risoluzione applicata**:
    1. Aggiunto `closeAndResetDatabases()` su IndexedDB invocato su ogni cambio di viaggio (`saveTripConfig`, `clearTripConfig`).
    2. Ascolto dell'evento `trip_config_changed` in `StorageService` per ripulire istantaneamente la memoria in-memory (`this.memoryCache.clear()`).
    3. Blocco del seed `seedRealActivities()` per tutti i viaggi eccetto il viaggio master `0000` (`if (tripId !== MASTER_TRIP_ID) return;`).
    4. Data fallback isolata: per viaggi personalizzati la data ricade sulle date configurate dal creatore o sulla data odierna (`todayIso`), mai sui default neozelandesi.
    5. `detectCountry()` limitato rigorosamente al viaggio `0000`: per tutti gli altri viaggi il titolo dell'header corrisponde al titolo effettivo del viaggio o a fallback neutro.
    6. Immagine hero isolata per trip: `hero_bg_image_${tripId}`.
- **Risoluzione P1 — Ripristino Card Google Maps Compatta**:
  - Ripristinata la struttura a due righe: riga 1 🚗 Auto (Apri / Modifica / Aggiungi), riga 2 🚶 A piedi (Apri / Modifica / Aggiungi).
  - Eliminata la frammentazione in sottocard affiancate che occupava troppo spazio verticale su smartphone.
  - Conservata la modale per la gestione degli itinerari, retrocompatibilità con i vecchi link e avviso contestuale se il limite delle 10 tappe Google Maps viene superato.
- **Risoluzione P1 — Ripristino Sezione Altro**:
  - Eliminata la proliferazione di riquadri e intestazioni decorative maiuscole.
  - Ripristinata la griglia compatta a due colonne degli strumenti di viaggio con accesso rapido e ordinato a Gestione Viaggio e Ruolo Dispositivo.

### Chiusura Beta 28 Ottobre — Modalità Jarvis (25 Ottobre 2026)
- **P0-A — Risoluzione Causa Radice GPS "Non attivata" e Controlli Guida**:
  - **Causa individuata**: In `LiveEditorialExperienceProps` la prop `online` era omessa; di conseguenza `props.online` risultava costantemente `undefined`, disabilitando perennemente tutti i pulsanti operativi della guida (`disabled={props.isDetectingGps || !props.online}`).
  - **Risoluzione applicata**:
    1. Passaggio esplicito di `isOnline` derivato da `navigator.onLine` con fallback reattivo.
    2. Gestione granulare dei 7 stati di inattività: `not_started` ("Non ancora avviata"), `permission_denied` ("Permesso posizione negato"), `acquiring` ("Posizione in acquisizione"), `other_device_active` ("Altro dispositivo Guida attivo"), `offline` ("Connessione assente"), `paused` ("Trasmissione in pausa"), `technical_error` ("Errore tecnico").
    3. Action Card GPS in evidenza direttamente sotto la mappa con pulsanti espliciti: "Attiva GPS su questo smartphone", "Riprova GPS", "Prendi Guida qui", "Pausa", "Termina", "Riprendi".
    4. Istruzioni contestuali integrate per iOS/Safari (`Su iPhone/Safari: apri Impostazioni > Privacy e sicurezza > Localizzazione`).
    5. Separazione categorica tra GPS reale e posizione programmata: l'overlay stimato è etichettato esplicitamente come `📍 Posizione stimata da programma (Nessun GPS in trasmissione)`.
    6. Nessun avvio automatico del GPS senza consenso esplicito.
- **P0-B — Invito Copilota Crittografico e Sicuro (Compatibile Firebase Spark)**:
  - **Criticità superata**: Rigettata l'ipotesi di auto-join insicura basata sulla sola conoscenza del `tripId`.
  - **Architettura implementata**:
    1. Generazione di token impredittibili ad alta entropia (128 bit) tramite Web Crypto API (`crypto.randomUUID()` / `crypto.getRandomValues()`).
    2. Creazione dell'invito in sottocollezione `/trips/{tripId}/invites/{inviteToken}` con scadenza a 7 giorni, monouso (`status: 'pending' -> 'used'`) e revocabile dal proprietario.
    3. **Sicurezza Server-Side su Piano Gratuito Spark (0 Cloud Functions, $0 costi)**: Il riscatto avviene tramite `writeBatch` atomico del client (`redeemTripInvite` in `tripInviteService.ts`) e viene validato atomicamente in `firestore.rules` tramite `getAfter(/databases/$(database)/documents/trips/$(tripId)/invites/$(token))`. La creazione del membro copilota è autorizzata SOLO se il batch contemporaneamente aggiorna lo stato del token su `'used'` associandolo a `request.auth.uid`.
    4. **Protezione Speciale Viaggio `0000`**: La regola `tripId != '0000'` impedisce tassativamente la creazione o riscatto di token sul viaggio di nozze master.
    5. **Chiusura Falla Accesso con Solo tripId**: La regola `allow get` su `/trips/{tripId}` è stata blindata con `isTripMember(tripId) || isGlobalAdmin()`. Chi possiede solo il `tripId` NON può leggere né i metadati né i dati privati (tappe, spese, note, documenti) del viaggio.
    6. **Coerenza Schema ownerUid / ownerId**: Pieno supporto trasparente sia a `ownerUid` che a `ownerId` nelle funzioni `isTripOwner` e `isTripMember`, garantendo retrocompatibilità e coerenza con i documenti già esistenti in produzione.
    7. **Blindatura Self-Join**: La clausola di auto-join in `allow update` su `/trips/{tripId}` richiede tassativamente che l'utente non sia già presente in `members` e che un nuovo documento membro copilota legittimo sia creato nello stesso batch, impedendo a un copilota esistente di aggiungere terzi all'array `members`.
    8. **Convalida su Firebase Emulator Reale**: Validata al 100% con la suite automatica `scripts/test_beta_release_emulator_validation.cjs` (24/24 asserzioni superate su emulatore Firestore reale, porta 8085, con OpenJDK 21).
    9. **Riconciliazione File Rules**: Allineati e sincronizzati al 100% i due file `firestore.rules` (directory root del repository, utilizzato da root `firebase.json`, e `ViaggiodiNozze/firestore.rules`).
- **P1-A — Selezione dei Viaggi Dopo il Login & Isolamento Dati**:
  - Modalità multi-viaggio sicura: lettura da `/users/{uid}/associatedTripIds` ed esecuzione di singoli `getDoc` dedicati (nessuna scansione globale non autorizzata su `/trips`).
  - Classificazione chiara tra "👑 Organizzatore" e "🤝 Co-pilota" con destinazione, date e indicatore dell'ultimo viaggio utilizzato.
  - Cambio viaggio istantaneo tramite `switchActiveTrip`: chiusura e reset connessioni IndexedDB (`closeAndResetDatabases`), invalidazione cache in memoria `StorageService`, persistenza del ruolo e notifica `trip_config_changed` (zero contaminazione dati).
  - Componente modale dedicato `TripSelectorModal.tsx` e integrazione in `AltroView` e `OnboardingView`.
- **P1-B — Gestione Gmail Ultra-Compatta a Riga Singola**:
  - Nuovo componente `GmailConnectionRow.tsx`: una singola riga orizzontale pulita (pallino di stato verde/grigio, email account collegato e azione primaria "Collega" / "Cerca" / "Importa").
  - Dettagli esplicativi sui permessi `gmail.readonly` e opzioni di cambio/disconnessione account racchiusi in un cassetto comprimibile a comparsa.
  - Preservati permessi minimi di sola lettura e identità Firebase senza alterare l'UID.
  - Integrato in `SmartInsertModal.tsx` e `DocumentiView.tsx`.
- **P1-C — Riorganizzazione Sezione Altro Basata sui Compiti (Task-Based)**:
  - Eliminazione di card arrotondate generiche e riquadri ridondanti.
  - Nuova gerarchia editoriale strutturata per macro-obiettivi del viaggiatore:
    1. *LIVE & Posizione Viaggio* (stato attivo, chip del viaggio corrente con scorciatoia "Cambia Viaggio").
    2. *Documenti & Risorse* (Documenti & Voucher con Gmail compatto, Spese & Budget, Lista Bagagli, Note).
    3. *Sicurezza & Assistenza* (Assicurazione H24, Emergenze, Travel Toolkit).
    4. *Gestione Viaggio & Dispositivo* (Partecipanti & Inviti con link crittografico, Ruolo Dispositivo, I Tuoi Viaggi).
  - Verifica di layout privo di overflow a 393px, 320px e desktop.
- **P2 — Preservazione Funzionalità Consolidate**:
  - Preservati al 100%: ownership viaggio `0000`, login permanente, isolamento cache multi-viaggio, DayMapsCard a 2 righe (auto/piedi), check-in compatto e navigazione desktop.

---

## 4. LIMITAZIONI NOTE E VERIFICHE MANUALI PENDENTI
1. **Sincronizzazione Foto Multi-Device (Galleria Pubblica Ospiti)**:
   - Attualmente le foto scattate/caricate dal dispositivo organizzatore vengono compresse e salvate in locale in `localStorage['hounigo_live_gallery']`.
   - Verso Firestore viene inviato solo il post testuale senza `photoUrl` (poiché `liveService` accetta solo URL `http(s)` e Firebase Storage non è configurato/autorizzato per upload pubblici da client).
   - Di conseguenza, gli ospiti remoti indipendenti non vedono le foto personalizzate degli sposi, ma solo i post del diario.
   - Nella UI della Beta RC sono stati inseriti disclaimer trasparenti (`🔒 Salvataggio locale (Beta)`) e il pulsante è impostato su *"Salva su dispositivo"*.
   - La funzionalità galleria remota resta NON completata e BLOCCATA fino all'abilitazione di Firebase Storage o CDN persistente post-beta.
2. **Autorizzazione Deploy Security Rules e Test su iPhone Fisico**:
   - Le Security Rules crittografiche (`firestore.rules` in root e `ViaggiodiNozze`) sono verificate e validate al 100% su Firebase Emulator reale; attendono deploy remoto esplicito da parte dell'utente.
   - La verifica della Geolocation API in background su PWA iOS/Safari deve essere convalidata sul dispositivo fisico dell'owner.

---

---

## 5. STATO DELLA PUBBLICAZIONE ONLINE (BETA RELEASE CANDIDATE 100%)
- **Data e Ora Ultimo Miglio Beta**: 25 Ottobre 2026, 19:15 CET
- **Branch di Lavoro**: `work/product-completion`
- **Stato Codice Locale**: Pronto al 100% per il deploy immediato (in attesa di autorizzazione utente).
- **Validazione Completa Eseguita**:
  - Suite automatica di integrazione `scripts/test_jarvis_beta_closure.cjs`: 14/14 test superati (100%).
  - Suite su Firebase Emulator Reale `scripts/test_beta_release_emulator_validation.cjs`: 24/24 test superati (100%).
  - Suite collaborazione su emulatore `test_firestore_emulator_collaboration.cjs`: 50/50 test superati (100%).
  - Suite simulazione migrazione `test_migration_simulation_emulator.cjs`: 10/10 test superati (100%).
  - Suite integrità e sync `test_sync_multidevice_tombstones_suite.cjs`: 26/26 test superati (100%).
  - Suite smoke test post-deploy non-distruttivo `scripts/post_deploy_smoke_test.cjs`: 18/18 controlli superati (100%).
  - Build di produzione TypeScript/Vite (`npm run build`): completata con esito 0 (nessun errore o warning bloccante).
- **Documentazione Tester & Procedure Consegna**:
  - Redatta Guida per i Beta Tester: `docs/HOUNIGO_TESTER_GUIDE.md` (con canali feedback CRITICO / IMPORTANTE / MIGLIORAMENTO).
  - Procedura di pubblicazione coordinata e piano di rollback documentati e verificati.
  - Nessuna alterazione ai dati di produzione del viaggio 0000.
