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

### Pacchetto 2 (Confermato e Mantenuto)
- **Galleria Fotografica LIVE**: slider orizzontale, compressione canvas, lightbox a schermo intero.
- **Diario e Cartolina di Viaggio**: paginazione a 10 messaggi, eliminazione riservata agli sposi.
- **Stati GPS e Timestamp**: certificazione esatta dell'orario e dei 4 stati satellitari.
- **Card Trasporti**: chiusura check-in e orari di anticipo per voli, traghetti e treni.

---

## 4. LIMITAZIONI NOTE E VERIFICHE MANUALI PENDENTI
1. **Sincronizzazione Foto Multi-Device (Galleria Pubblica Ospiti)**:
   - Attualmente le foto scattate/caricate dal dispositivo organizzatore vengono compresse e salvate in locale in `localStorage['hounigo_live_gallery']`.
   - Verso Firestore viene inviato solo il post testuale senza `photoUrl` (poiché `liveService` accetta solo URL `http(s)` e Firebase Storage non è configurato/autorizzato per upload pubblici da client).
   - Di conseguenza, gli ospiti remoti indipendenti non vedono le foto personalizzate degli sposi, ma solo i post del diario.
   - Nella UI della Beta RC sono stati inseriti disclaimer trasparenti (`🔒 Salvataggio locale (Beta)`) e il pulsante è impostato su *"Salva su dispositivo"*.
   - La funzionalità galleria remota resta NON completata e BLOCCATA fino all'abilitazione di Firebase Storage o CDN persistente post-beta.
2. **Verifica su Due Dispositivi Fisici Reali**:
   - I test multi-client sono stati verificati in emulatore e con suite headless CDP a 1440px, 393px e 320px in Light e Dark mode; resta da effettuare il collaudo manuale simultaneo su due telefoni reali collegati alla stessa sessione LIVE.

---

## 5. STATO DELLA PUBBLICAZIONE ONLINE (BETA RELEASE CANDIDATE)
- **Data e Ora Pubblicazione**: 25 Ottobre 2026, 11:20 CET
- **Branch Sorgente**: `work/product-completion` (Commit `3e89e12`)
- **Branch Target Deployment**: `gh-pages`
- **URL Pubblico Verificato**: `https://casabr.github.io/honeymoon-roadbook/` (HTTP 200)
- **Bundle JS Attivo in Produzione**: `/honeymoon-roadbook/assets/index-CZ5ho9Kr.js` (1.064.452 bytes, HTTP 200)
- **Bundle CSS Attivo in Produzione**: `/honeymoon-roadbook/assets/index-VpG0CVKU.css` (200.150 bytes, HTTP 200)
- **Verifica Browser Reale**: Pagina caricata con successo, 0 errori JavaScript bloccanti in console, onboarding a 3 intenzioni perfettamente visibile e responsivo.
- **Backend & Database**: Firebase Authentication, Firestore Rules, Cloud Functions e viaggio `0000` rimasti intatti al 100%.
