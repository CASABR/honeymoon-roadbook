# ARCHITECTURE NOTES

## Struttura cartelle
```
src/
├── data/
│   └── mockData.ts        ← unica fonte dati mock (tipi + dati statici)
├── components/
│   ├── Icons.tsx           ← SVG inline, zero dipendenze
│   └── BottomNav.tsx       ← 5 tab con NavLink
├── views/
│   ├── TodayView.tsx
│   ├── TripView.tsx
│   ├── AccommodationsView.tsx
│   ├── TransportsView.tsx
│   ├── BudgetView.tsx
│   └── AltroView.tsx
├── App.tsx                 ← router + shell mobile
├── main.tsx
└── index.css               ← design system globale
```

## Design system (index.css)
- `.app-shell` → contenitore mobile max 430px centrato
- `.page-content` → scroll area sopra la nav fissa
- `.bottom-nav` / `.nav-item` → nav fissa 68px
- `.card` → card bianca rounded-2xl shadow-sm
- `.section-label` → label uppercase piccola
- `.badge-in-corso` → pill verde stato trasporto
- `.quick-card` → card In evidenza
- `.day-pill` / `.day-pill.active` → selettore giorni Viaggio
- `.hide-scrollbar` → scrollbar nascosta

## Routing
- `/` → redirect a `/oggi` (via `<Navigate replace>`)
- `/oggi` → TodayView
- `/viaggio` → TripView
- `/alloggi` → AccommodationsView
- `/trasporti` → TransportsView
- `/budgeter` → BudgetView
- `/altro` → AltroView

**SPA su GitHub Pages:** `public/404.html` cattura i 404 e reindirizza alla root con il subpath come query. Lo script in `index.html` ripristina l'URL corretto prima del mount di React Router.

## Persistenza locale
- Alloggi e Trasporti: stato locale React + localStorage
- Chiavi: `hrb_accommodations_v2` (Accommodation[]), `hrb_transports_v3` (Transport[])
- Pattern: init = localStorage ?? mockData, salva su ogni modifica
- Pronto per essere sostituito da un store centralizzato

## Interfacce pronte per evoluzione futura
```ts
// Da aggiungere a Accommodation e Transport quando serve:
source?: "manual" | "gmail" | "google_calendar"
confirmationCode?: string
// Per conflitti orario:
// confrontare date (ISO) + time (HH:MM) tra tutti i Transport
```

## Decisioni prese
- QR non va in "In evidenza" → apre dal tap sulla voce trasporto in timeline.
- "La tua giornata" mostra 4 voci visibili, poi espandibile.
- "In evidenza" ha 3 card pulite e utili: Budgeter, Checklist (cose da fare), Emergenze (numeri utili).
- DatePicker in TodayView è interattivo: cliccando sull'icona calendario si apre un foglio per cambiare giorno e mostrare le relative attività.
- Navigazione giorno nell'header di Oggi: aggiunti pulsanti freccia sinistra/destra ai lati dell'icona calendario per passare rapidamente al giorno precedente o successivo. I pulsanti sono disabilitati e sfumati se ci si trova all'inizio (G1) o alla fine (G44) del viaggio.
- L'anteprima di domani in TodayView è orizzontale scorrevole con tutte le attività del giorno successivo. "Vedi tutto" apre un modal di riepilogo.
- Dettaglio dei trasporti in TransportsView: cliccando su una tratta si apre un bottom sheet con dettagli completi (tipo mezzo, partenza/arrivo, data/ora, codici, bagagli, note, segmenti).
- Scheda Viaggio (Itinerario completo): mostra tutti i giorni del viaggio. Cliccando su un giorno si espande rivelando la timeline delle sue attività. È implementata la logica ad espansione esclusiva (un solo giorno può essere aperto alla volta, l'apertura di un giorno chiude il precedente). In editMode, l'utente può modificare, eliminare o riordinare (tasti ↑/↓) le attività (compresi i trasporti). L'ordinamento cronologico automatico si attiva solo se l'orario viene cambiato, preservando la sequenza manuale desiderata.
- Il pulsante del calendario in Viaggio apre un bottom sheet di selezione del giorno (`TripDatePickerSheet`) che reindirizza e scrolla la pagina sul giorno selezionato in modo smooth.
- AltroView arricchito con accordion informativi reali: Assicurazione Heymondo (chiuso di default), Numeri Emergenza per paese, Bagagli e franchigie, Scadenze.
- Sezione Documenti in Altro: raggruppati per "cosa" (categoria) anziché per persona. Include un foglio di dettaglio della singola categoria per visualizzare ed inserire documenti ed una logica di migrazione automatica per i vecchi record precedentemente salvati privi del metadato `category`.
- Budgeter dinamico: calcola spesa totale, residuo e categorie in tempo reale leggendo i prezzi reali dagli alloggi (`hrb_accommodations_v2`) e trasporti (`hrb_transports_v3`) persistiti. 5 categorie stabili: Trasporti, Alloggi, Attività, Cibo & Extra, Altro. Assicurazione (dato reale €294,21 da polizza HEY2101185) inclusa sotto "Altro". Il popup dettaglio "Altro" mostra anche la card informativa della polizza (brand, numero polizza, periodo, copertura). Migrazione automatica dei vecchi record.
- Sincronizzazione itinerario: la logica di caricamento rileva discrepanze di lunghezza tra la cache locale e la definizione mock per aggiornare smooth l'itinerario a 44 giorni completo e continuo, conservando le attività create a mano dall'utente.
- Routing Basename Dinamico: in `main.tsx` `BrowserRouter` adotta `import.meta.env.BASE_URL` privato dello slash terminale come basename, risolvendo conflitti di instradamento in dev ed in produzione (es. GitHub Pages).
- localStorage per form aggiungi alloggio/trasporto/attività: semplice, offline, sostituibile (chiavi di versione _v2 per resettare vecchi dati inquinati di debug).
- Bottom Sheet & Safe Area Mobile: implementate in `index.css` le classi esplicite `.bottom-sheet-backdrop` (per l'overlay oscurato, z-index a 90) e `.bottom-sheet-container` (per il foglio effettivo, altezza massima a `82dvh !important` e padding inferiore calcolato con la safe-area `calc(32px + env(safe-area-inset-bottom, 16px)) !important`). Questo garantisce isolamento visivo, accessibilità dei pulsanti inferiori su Safari mobile e stabilità senza effetti collaterali su modali centrati o altre classi utility.
- Risoluzione Overflow in Timeline: aggiunta la classe `min-w-0` a livello di card in `TripView.tsx` per abilitare il corretto troncamento dinamico dei titoli lunghi ed impedire che i controlli di modifica (✏️, 🗑️, ↑, ↓) debordino a destra della card.
- Sezione Checklist: memorizzata localmente in `hrb_checklists_v3` che gestisce liste multiple offline con aggiunta/rimozione dinamica di elementi e liste.
- Rilevamento scalo aereo: calcolo automatico dei tempi di attesa tra segmenti in TransportsView e visualizzazione differenziata con evidenza (scalo lungo >= 6 ore colorato in arancione con consiglio di uscita visa-free, scalo breve in grigio).
- Navigazione deep-link con auto-scroll: l'URL parametrizzato `/altro?open=...` gestisce l'apertura all'avvio e lo scorrimento smooth all'accordion corrispondente.
- UX Documenti su Mobile: rimosso l'effetto hover dal pulsante per eliminare gli allegati dei documenti. Il pulsante "×" è ora sempre visibile, ingrandito e dotato di shadow per favorire il tap touch su mobile.
- Sincronizzazione Itinerario e Dettagli: esportata la persistenza dinamica di `tripDays` per condividere ed aggiornare in tempo reale le modifiche/cancellazioni di attività tra la tab Oggi (`TodayView`) e Viaggio (`TripView`).
- Cliccabilità ed Editing: reso cliccabile l'intero target delle card delle attività (trasporti compresi) sia in Oggi che in Viaggio per aprire direttamente il foglio di consultazione/modifica/cancellazione delle attività.
- Dimensione Allegati Elevata: incrementata a **10 MB** la dimensione massima degli allegati in Oggi e Trasporti per supportare screenshot e PDF complessi sul telefono offline.


## Evoluzione Futura e Roadmap

Per le fasi successive dello sviluppo, il progetto dovrà essere configurato per:
1. **Hosting Iniziale:** ✅ **Completato** — Deployment su **GitHub Pages** (`https://casabr.github.io/honeymoon-roadbook/`). Supporto SPA 404 via `public/404.html` + script redirect in `index.html`. CSP configurata via meta tag.
2. **Autenticazione:** Integrazione del **Login con Google / Gmail**, consentendo l'accesso sicuro.
3. **Stato Iniziale Utente:** Avvio dell'applicazione con uno stato vuoto (empty state) per i nuovi utenti che non hanno ancora inserito dati, guidandoli nell'importazione.
4. **Gmail Import Reale:** Implementazione di un servizio (serverless o client-side con token OAuth) che legga le email di conferma (voli, hotel, treni) da Gmail per estrarre e mappare automaticamente i dati nel roadbook.
5. **Supporto Multi-utente:** Struttura dei dati isolata per ID utente.
6. **Sincronizzazione Cross-device:** Meccanismo di sync (es. tramite database leggero come Firebase o Supabase, o sync su Google Drive personale) per allineare i dati tra dispositivi mobili diversi in tempo reale.


