# PROJECT RULES

## Obiettivo
Companion app personale per il viaggio di nozze (NZ · AU · PH).
Utilità pratica durante il viaggio, non un prodotto commerciale.

## Memoria permanente e baseline di stabilità
- Prima di ogni modifica, consultare docs/HOUNIGO_BASELINE_STABILE.md. Preservare le funzionalità consolidate, distinguere test automatici da verifiche su dispositivi reali e aggiornare la baseline dopo ogni risultato confermato. Non considerare risolto un problema sulla base di sole ipotesi.

## Vincoli fissi
- Solo mobile (max-width 430px, mobile-first reale)
- Offline-first: i dati devono funzionare senza rete
- Niente backend, niente cloud, niente auth adesso
- Niente librerie nuove se non strettamente necessarie
- Niente effetti pesanti o animazioni inutili
- Niente feature fuori scope
- Codice semplice e mantenibile, non cleverness inutile

## Stack approvato
- React + TypeScript + Vite
- Tailwind v4 (via @tailwindcss/vite)
- React Router DOM (routing client-side semplice)
- localStorage per persistenza locale (no IndexedDB per ora)

## Preview locale
- **Vite Dev Server (Consigliato):** Eseguire `npm run dev` → `http://localhost:5173/`. È lo strumento nativo e necessario. Gestisce la compilazione in tempo reale di TSX/TypeScript e HMR automatico.
- **Incompatibilità con Live Server:** L'estensione Live Server (Ritwick Dey) è concepita per file statici HTML/JS standard. Non compila il codice TypeScript/JSX e non risolve i moduli nudi (es. `import React from "react"`), generando inevitabilmente errori nel browser se avviata sul sorgente non compilato. Inoltre, i server statici puri non gestiscono il routing SPA di `react-router-dom` al ricaricamento (generano 404).
  → **Regola:** Non usare Live Server per lo sviluppo. Usare sempre Vite dev server.


## Architettura dati (per import futuro)
- Tutti i dati stanno in `src/data/mockData.ts` (mock temporanei)
- Le interfacce TypeScript sono pronte per l'evoluzione:
  - `Accommodation` → pronta per import da Gmail/Google (campo `source?: "manual" | "gmail"`)
  - `Transport` → supporta `source`, `confirmationCode`, `qrCodeData` e `qrCodes?: string[]` (per multipli QR code/biglietti scorrevoli)
  - `Completed Activities` → persistito tramite `hrb_completed_activities_v2` e sincronizzato in tempo reale tra Oggi e Viaggio tramite un custom event listener
  - `DocumentItem` → raggruppati per categoria ("cosa"), persistiti in `hrb_documents_v2` con migrazione automatica delle categorie per vecchi record privi di metadati.
  - `BudgetEntry` → diviso in 5 categorie (Trasporti, Alloggi, Attività, Cibo & Extra, Altro) persistito in `hrb_budget_entries_v2` con migrazione e unione automatica dei default. Assicurazione (€294,21 reale, polizza HEY2101185) inclusa sotto "Altro". Trasporti e Alloggi NZ hanno price reali; AU/PH da completare.
- Conflitti orario: le strutture hanno già `date` + `time` ISO → confronto facile in futuro
- Strategia: isolare la fonte dati in `src/data/store.ts` (da creare quando serve)

## Gestione Bottom Sheet e Safe Area Mobile
- **Backdrop dei popup:** Usare sempre la classe `.bottom-sheet-backdrop` per tutti gli overlay e backdrop dei fogli che si aprono dal basso. Questa classe ha preimpostato lo `z-index: 90 !important` (per stare sopra la bottom-nav che è a `z-index: 50`) e l'effetto blur dello sfondo. Non usare `.fixed.inset-0` con z-index bassi o stili inline.
- **Contenitore del foglio:** Usare sempre la classe `.bottom-sheet-container` per il wrapper interno del bottom-sheet. Questa classe limita l'altezza a `82dvh !important` (lasciando spazio in alto per la chiusura ed evitando scroll bloccanti) e calcola automaticamente il padding inferiore per la safe area mobile con fallback integrato (`calc(32px + env(safe-area-inset-bottom, 16px)) !important`).
- **Modali centrati / media viewer:** Per visualizzatori d'immagini o modali a schermo intero non allineati in basso, usare `.fixed.inset-0.items-center` e `z-index` elevati (es. `z-[100]`), senza toccare le classi del bottom-sheet.
- **Contenimento Overflow Timeline:** Le card flessibili (`flex-1`) all'interno di timeline row orizzontali che supportano la modalità modifica (editMode) devono avere sempre la classe `min-w-0` abilitata. Questo garantisce che il browser possa restringere la card e troncare con ellisse i titoli lunghi, salvaguardando lo spazio a destra per l'action block dei controlli (`✏️`, `🗑️`, `↑`, `↓`) ed evitando l'overflow orizzontale.

## Vincoli permanenti di interfaccia e regressione (approvati il 19/11/2026)
Considerare le seguenti regole **invarianti non derogabili** in ogni intervento futuro (non modificarle senza richiesta esplicita dell'utente):
- **Orari delle 6 categorie sempre nell'header superiore:** Su `AlloggioCard`, `AttivitaCard`, `RistoranteCard`, `ShoppingCard`, `TappaCard` e `TrasportoCard`, gli orari (inclusi orari multipli/`+1`, `IN/OUT`, indicatori `Confermato`/`indicativo` e date di fallback già previste) devono stare **esclusivamente** nell'header superiore (`.hounigo-ds-card-header` → `.hounigo-ds-header-top`, componente `CardHeaderTimeBadge`) a destra della categoria (`.hounigo-ds-header-cat`). È **vietato** spostarli accanto al titolo `<h3>` nel body (`CardTitleWithTime`, `.hounigo-ds-title-row`, `.hounigo-ds-time-stamp--inline`).
- **Nessuna duplicazione degli orari:** Ogni card espone un solo cartellino orario in header; il titolo `<h3>` e il body della card non devono replicare o affiancare badge orari.
- **Fronte Alloggi senza inviti al check-in:** Sul fronte di `AlloggioCard` (`.hounigo-ds-card-footer`) non devono comparire pulsanti o inviti proattivi al check-in quando `accommodation.checkInDone` è falso; il badge interattivo `✓ Check-in fatto` compare solo a check-in già effettuato.
- **Swipe in `Oggi` dedicato al cambio giorno:** Lo swipe orizzontale in `OggiView` (`handleDaySwipeStart`/`Move`/`End`) è riservato esclusivamente al cambio giorno (`setSelectedDate`), mentre `App.tsx` disabilita lo swipe globale cambio tab su `activeTab === 'oggi'`.
- **Preservare moduli critici già verificati:** Non alterare, senza richiesta esplicita, la sincronizzazione Firestore (`1.6.27`, `syncService.ts`), le notifiche push/Worker (`1.6.28`, `usePushNotifications.ts`, `pushNotificationService.ts`, `NotificationBellButton.tsx`, `cloudflare/houniai-worker/src/index.js` & `push.js`) e la ripresa GPS LIVE (`1.6.29`, `liveGpsContinuity.ts`, `LiveView.tsx`).
- **Verifica anti-regressione:** Dopo modifiche a card, stili `.hounigo-ds-*` o vista `Oggi`, eseguire `node ViaggiodiNozze/scripts/test_card_ui_invariants.cjs`.

## Cose da NON fare
- Refactor speculativi
- Toccare file non richiesti
- Aggiungere dipendenze non richieste
- Pensare a viralità, monetizzazione, multi-utente
- Introdurre selettori CSS globali troppo larghi su classi utility di Tailwind (es. sovrascrivere `.fixed.inset-0` o `.fixed.items-end` in modo generico), che rompono layout e overlay invisibili in altre parti dell'app.
