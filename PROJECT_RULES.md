# PROJECT RULES

## Obiettivo
Companion app personale per il viaggio di nozze (NZ · AU · PH).
Utilità pratica durante il viaggio, non un prodotto commerciale.

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

## Cose da NON fare
- Refactor speculativi
- Toccare file non richiesti
- Aggiungere dipendenze non richieste
- Pensare a viralità, monetizzazione, multi-utente
- Introdurre selettori CSS globali troppo larghi su classi utility di Tailwind (es. sovrascrivere `.fixed.inset-0` o `.fixed.items-end` in modo generico), che rompono layout e overlay invisibili in altre parti dell'app.
