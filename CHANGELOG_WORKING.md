# CHANGELOG WORKING

## [2026-07-06 – Sessione 7] Riorganizzazione Documenti per Categoria, Budgeter 5 Categorie (Attività/Altro), Itinerario 44 Giorni ed Allineamento Cache/Routing

### File modificati
- `src/views/TodayView.tsx` — Aggiunti pulsanti freccia sinistra (`IcChevronLeft`) e destra (`IcChevronRight`) ai lati dell'icona calendario nell'header per navigare velocemente tra il giorno precedente ed il giorno successivo dell'itinerario. Gestito lo stato disabilitato per il primo (G1) e l'ultimo giorno (G44).
- `src/main.tsx` — Risolto il bug di routing locale configurando il `basename` di `BrowserRouter` dinamicamente con `import.meta.env.BASE_URL.replace(/\/$/, "")` per essere coerenti alla base path `/honeymoon-roadbook/` impostata in Vite.
- `src/views/TripView.tsx` — Risolto il problema del caricamento bloccato a 13 giorni: implementata una logica di sincronizzazione in `loadTripDays()` che rileva la discrepanza di lunghezza con l'itinerario di default, aggiorna la cache locale a 44 giorni e preserva le attività create manualmente dall'utente.
- `src/views/AltroView.tsx` — Riorganizzato l'accordion dei Documenti per "cosa" (categoria). Aggiunto il bottom sheet `CategoryDocumentsSheet` per visualizzare/sfoltire i documenti della categoria selezionata. Integrata una logica di migrazione in `loadDocuments()` per assegnare le categorie ai vecchi record in locale.
- `src/views/BudgetView.tsx` — Ristrutturate le categorie del budgeter a 5 voci (Trasporti, Alloggi, Attività, Cibo & Extra, Altro) con layout asimmetrico per la quinta scheda. Spostata l'assicurazione sotto "Altro" ed inserite le nuove spese reali sotto "Attività". Integrato il caricamento con migrazione per aggiornare la cache locale del browser.
- `PROJECT_RULES.md` & `ARCHITECTURE_NOTES.md` — Aggiornati con i dettagli della migrazione della cache, del routing e dei nuovi controlli dell'header.
- `CHANGELOG_WORKING.md` — Aggiornato questo file.

---

## [2026-07-06 – Sessione 6] Gestione Documenti Offline + Calcolo Dinamico Spese e Dettaglio Categorie Budgeter

### File modificati
- `src/data/mockData.ts` — Aggiunta del campo `price?: number` a `Accommodation` e `Transport`. Inserimento dei prezzi reali storici estratti dai contratti del roadbook. Aggiunte funzioni per la gestione dei documenti e per le spese manuali del budgeter.
- `src/views/AltroView.tsx` — Riscritto l'accordion dell'Assicurazione per essere chiuso di default. Aggiunto l'accordion *"📁 Documenti di viaggio"* con reminder precompilati per Nunzio e Giusy (Passaporti, Visti) in stato *"Non compilato ⚠️"*. Integrato il form `AddDocumentSheet` per inserire/compilare e rimuovere documenti salvandoli offline in localStorage.
- `src/views/BudgetView.tsx` — Riprogettato il budgeter per eseguire calcoli dinamici in tempo reale delle spese (sommando i prezzi di alloggi e trasporti reali da localStorage, con ereditarietà difensiva dai mock se assenti, più le spese manuali). Integrato il popup `CategoryDetailSheet` per visualizzare le singole voci analitiche di costo per categoria. Aggiunto il form `AddExpenseSheet` per inserire ed eliminare spese manuali/extra.
- `src/views/TransportsView.tsx` & `src/views/AccommodationsView.tsx` — Esportato l'input del campo Prezzo (€) nel form di creazione/modifica delle tratte e alloggi.
- `PROJECT_RULES.md` & `ARCHITECTURE_NOTES.md` — Aggiornati con i dettagli delle nuove funzionalità.
- `CHANGELOG_WORKING.md` — Aggiornato questo file.

---

## [2026-07-06 – Sessione 5] Gestione QR Avanzata + Attività Spuntabili + UI Premium Sobria

### File modificati
- `src/data/mockData.ts` — Aggiunta del campo `qrCodes?: string[]` a `Transport` per consentire più biglietti/QR per una tratta. Inserimento di funzioni helper per il caricamento/salvataggio delle attività spuntate (`loadCompletedActivities`, `saveCompletedActivities`).
- `src/views/TodayView.tsx` — Integrato lo stato di completamento attività (`completedActs`) sincronizzato tramite CustomEvent. Abilitato il cerchio di spunta interattivo sulle attività della timeline con layout sbarrato/attenuato se completate.
- `src/views/TripView.tsx` — Cambiata la chiave a `hrb_trip_days_v2`. Integrata la spunta interattiva delle attività sincronizzata con Oggi. Aggiunto il bottom sheet `TripDatePickerSheet` con scroll automatico.
- `src/views/TransportsView.tsx` — Riprogettato `TransportDetailSheet` per visualizzare più QR code con uno stepper orizzontale ("Biglietto X di Y") e consentire l'aggiunta o l'eliminazione inline istantanea di QR code direttamente dal dettaglio. Aggiornato il form `TransportFormSheet` per supportare l'inserimento multiplo separato da virgola.
- `src/index.css` — Rifinitura grafica premium sobria: implementato il font *Outfit*, ombreggiature morbide a più livelli, angoli arrotondati ampi (`20px`/`24px`), centratura e stile premium per desktop, e trasparenze con sfocatura sfondi (`backdrop-filter`) per bottom sheet e navigazione.
- `PROJECT_RULES.md` & `ARCHITECTURE_NOTES.md` — Aggiornati con i dettagli delle nuove funzionalità.
- `CHANGELOG_WORKING.md` — Aggiornato questo file.

---

## [2026-07-06 – Sessione 4] Itinerario UX + Dettagli Trasporti completi + Diagnosi Live Server

### File modificati
- `src/views/TripView.tsx` — Riprogettata la scheda Viaggio per mostrare l'itinerario cronologico completo di tutti i giorni. Ogni giorno ha un riepilogo compatto ed è espandibile. Aggiunto il form di inserimento attività `AddActivitySheet` locale con persistenza su `localStorage`.
- `src/data/mockData.ts` — Estesa l'interfaccia `Transport` per includere tutti i campi extra utili (compagnia, scalo, bagaglio a mano/stiva/extra, terminal, gate, posto, durata, QR, fonte).
- `src/views/TransportsView.tsx` — Dettaglio trasporti aggiornato per mostrare tutti i campi extra. Aggiunto pulsante di modifica e di eliminazione delle tratte. Integrato il form unico di creazione e modifica (`TransportFormSheet`) pre-popolabile con tutti i campi extra supportati.
- `PROJECT_RULES.md` — Spiegata in dettaglio la diagnosi di incompatibilità con Live Server di Ritwick Dey.
- `ARCHITECTURE_NOTES.md` — Aggiunta la roadmap futura dell'architettura (GitHub Pages, login Gmail, sync cross-device, ecc.).

---

## [2026-07-06 – Sessione 3] Import Dati Reali + Fix UX/UI

### File modificati
- `src/data/mockData.ts` — Importati dati reali dal vecchio progetto (alloggi con indirizzi/maps, voli completi con codici, scali, segmenti, assicurazione Heymondo, contatti emergenza)
- `src/views/TodayView.tsx` — DataPicker interattivo per cambio data, anteprima domani a scorrimento orizzontale completo, "Vedi tutto" con modal di riepilogo, sezione "In evidenza" ripensata (Budgeter + Assicurazione + Emergenze)
- `src/views/TransportsView.tsx` — Tap su tratta per aprire dettaglio (sheet bottom con tipo mezzo, orari, note bagaglio, segmenti scalo, codici prenotazione, QR placeholder)
- `src/views/AltroView.tsx` — Alimentato con informazioni operative reali (dati Heymondo, emergenze per paese, franchigie bagagli reali, scadenze e procedure)
- `ARCHITECTURE_NOTES.md` — Aggiornate le decisioni di design

---

## [2026-07-06 – Sessione 2] Modifiche A/B/C + file MD

### File creati
- `PROJECT_RULES.md` — vincoli, stack, preview locale, regole
- `ARCHITECTURE_NOTES.md` — struttura, design system, routing, persistenza, interfacce
- `CHANGELOG_WORKING.md` — questo file

### File modificati
- `src/views/TodayView.tsx`
- `src/views/AccommodationsView.tsx`
- `src/views/TransportsView.tsx`
- `src/index.css`

---

### A) Scheda OGGI
- **"In evidenza"**: rimossi Biglietti/QR e Programma. Rimaste: Budgeter (→ /budgeter), Domani, Alloggi (→ /alloggi). 3 card invece di 4.
- **QR sul trasporto**: tap sulla voce trasporto con `hasQR: true` apre `QRModal` (bottom sheet). Rimosso QR da "In evidenza".
- **Voci visibili**: `VISIBLE_COUNT = 4`. Button toggle "Vedi tutta / Mostra meno".
- **Prima voce**: sempre evidenziata (dot blu pieno, card con bordo blu).
- **Voci trasporto con QR non in focus**: icona QR visibile a destra, tappabili.

### B) Scheda ALLOGGI
- Stato locale `useState` init da `localStorage.getItem("hrb_accommodations")` ?? mockData
- `useEffect` salva su localStorage ad ogni modifica
- Pulsante "Aggiungi" in alto a destra → apre `AddAccoSheet` (bottom sheet)
- Form: nome*, città*, area, check-in, check-out, date, nota, link Maps
- `id` generato: `acc-user-${Date.now()}`
- Commento in codice: `source: "manual"` pronto per import Gmail futuro

### C) Scheda TRASPORTI
- Stesso pattern localStorage: chiave `"hrb_transports"`
- Bottom sheet `AddTransportSheet`: tipo mezzo (pill selector), data ISO*, orario, da*, a*, dettaglio, nota
- Data in formato ISO `YYYY-MM-DD` — usata per ordinamento cronologico già ora, base per controllo conflitti futuri
- Inserimento: sort automatico per `date + time` dopo ogni aggiunta
- Commenti in codice: `source: "manual"`, `confirmationCode` pronti per import Gmail futuro

### D) Scheda ALTRO — non toccata

---

## Cosa rimane mock temporaneo
- Tutto il contenuto di `src/data/mockData.ts`:
  - `TODAY_DAY_ID`, `TODAY_LABEL`, `DAYS_TO_DEPARTURE` (da calcolare su data reale)
  - Giorni e attività del viaggio
  - Dati alloggi iniziali (sostituibili tramite form o import futuro)
  - Dati trasporti iniziali (stessa cosa)
  - Budget (tutto hardcoded)
- QR nel modale: placeholder SVG, da sostituire con immagine biglietto reale
- Immagini Unsplash nelle card: placeholder, da sostituire con foto reali

## Da rivedere in futuro
- `src/data/store.ts` — centralizzare stato locale in un solo posto
- Calcolo automatico di `TODAY_DAY_ID` dalla data reale del dispositivo
- Import Gmail/Google: aggiungere `source` e `confirmationCode` alle interfacce
- Controllo conflitti orario: confrontare `date + time` dei Transport in store
- QR: collegare a immagine biglietto reale o link esterno

---

## [2026-07-06 – Sessione 1] Setup iniziale
- Scaffold Vite + React + TS + Tailwind v4 + React Router DOM
- Struttura cartelle: data/, components/, views/
- 6 view: Oggi, Viaggio, Alloggi, Trasporti, Budgeter, Altro
- Design system in index.css
- Bottom nav fissa 5 tab
- Dati mock completi in mockData.ts
