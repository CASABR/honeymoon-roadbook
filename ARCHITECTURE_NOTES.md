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
- `/` → TodayView
- `/viaggio` → TripView
- `/alloggi` → AccommodationsView
- `/trasporti` → TransportsView
- `/budgeter` → BudgetView
- `/altro` → AltroView

## Persistenza locale
- Alloggi e Trasporti: stato locale React + localStorage
- Chiavi: `hrb_accommodations` (Accommodation[]), `hrb_transports` (Transport[])
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
- "In evidenza" ha solo card utili reali: Budgeter, Assicurazione (Heymondo), Emergenze.
- DatePicker in TodayView è interattivo: cliccando sull'icona calendario si apre un foglio per cambiare giorno e mostrare le relative attività.
- L'anteprima di domani in TodayView è orizzontale scorrevole con tutte le attività del giorno successivo. "Vedi tutto" apre un modal di riepilogo.
- Dettaglio dei trasporti in TransportsView: cliccando su una tratta si apre un bottom sheet con dettagli completi (tipo mezzo, partenza/arrivo, data/ora, codici, bagagli, note, segmenti).
- Scheda Viaggio (Itinerario completo): mostra tutti i giorni del viaggio. Cliccando su un giorno si espande rivelando la timeline delle sue attività. È implementata la logica ad espansione esclusiva (un solo giorno può essere aperto alla volta, l'apertura di un giorno chiude il precedente).
- Il pulsante del calendario in Viaggio apre un bottom sheet di selezione del giorno (`TripDatePickerSheet`) che reindirizza e scrolla la pagina sul giorno selezionato in modo smooth.
- AltroView arricchito con accordion informativi reali: Assicurazione Heymondo (chiuso di default), Numeri Emergenza per paese, Bagagli e franchigie, Scadenze.
- Sezione Documenti in Altro: supporta l'inserimento/rimozione e compilazione di passaporti e visti con persistenza in `hrb_documents_v2` e reminder default in "Non compilato ⚠️".
- Budgeter dinamico: calcola spesa totale, residuo e categorie in tempo reale leggendo i prezzi reali dagli alloggi (`hrb_accommodations_v2`) e trasporti (`hrb_transports_v2`) persistiti. Include ereditarietà difensiva dei prezzi reali dai mock statici se non compilati localmente.
- Dettaglio Categoria Budgeter: un bottom sheet (`CategoryDetailSheet`) visualizza l'elenco delle singole voci di costo associate alla categoria toccata.
- Form spese manuali/extra: permette all'utente di aggiungere o rimuovere spese personali sincronizzandole sul budgeter locale.
- localStorage per form aggiungi alloggio/trasporto/attività: semplice, offline, sostituibile (chiavi di versione _v2 per resettare vecchi dati inquinati di debug).
- Nessun drawer/modal pesante: sheet bottom semplice con CSS vanilla.

## Evoluzione Futura e Roadmap

Per le fasi successive dello sviluppo, il progetto dovrà essere configurato per:
1. **Hosting Iniziale:** Deployment su **GitHub Pages** per una preview statica/client-side accessibile online.
2. **Autenticazione:** Integrazione del **Login con Google / Gmail**, consentendo l'accesso sicuro.
3. **Stato Iniziale Utente:** Avvio dell'applicazione con uno stato vuoto (empty state) per i nuovi utenti che non hanno ancora inserito dati, guidandoli nell'importazione.
4. **Gmail Import Reale:** Implementazione di un servizio (serverless o client-side con token OAuth) che legga le email di conferma (voli, hotel, treni) da Gmail per estrarre e mappare automaticamente i dati nel roadbook.
5. **Supporto Multi-utente:** Struttura dei dati isolata per ID utente.
6. **Sincronizzazione Cross-device:** Meccanismo di sync (es. tramite database leggero come Firebase o Supabase, o sync su Google Drive personale) per allineare i dati tra dispositivi mobili diversi in tempo reale.


