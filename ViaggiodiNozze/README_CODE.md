# ViaggiodiNozze – Linee Guida di Codice

Queste regole vanno lette e applicate prima di ogni modifica al progetto `ViaggiodiNozze/`.

---

## 🎯 Obiettivi

- Codice **leggero**, **pulito** e **facile da mantenere**.
- Zero dipendenze inutili.
- Errori ridotti al minimo, con TypeScript sfruttato davvero.
- Build veloce e bundle piccolo.

---

## 🧩 Architettura e Organizzazione

1. **Separazione netta dei livelli**:
   - `src/types/` → solo definizioni di tipo.
   - `src/storage/` → solo logica di persistenza.
   - `src/components/` → solo UI.
   - `src/views/` → composizione di componenti per schermata.
   - `src/App.tsx` → solo routing/navigation tra viste.
2. **Nessuna logica di business sparsa nei componenti**:
   - La logica di CRUD e gestione dati vive nei servizi (`storageService.ts`).
   - I componenti ricevono dati e callback, non toccano direttamente lo storage.
3. **Niente copia/incolla dal legacy**:
   - Il codice in `legacy-app/` si usa solo se esplicitamente richiesto.

---

## 🧹 Stile del Codice

1. **TypeScript stretto**:
   - Niente `any` se non strettamente indispensabile (e comunque commentato).
   - Usare `import type` per i soli tipi.
   - Preferire interfacce o type ben definiti in `src/types/index.ts`.
2. **Funzioni e componenti piccoli**:
   - Un componente = una responsabilità chiara.
   - Se un componente supera ~150–200 righe, valutare se spezzarlo.
3. **Niente codice morto**:
   - Rimuovere import inutili.
   - Rimuovere variabili, funzioni e componenti non usati.
4. **Nominazione chiara**:
   - Nomi di componenti in PascalCase (`GiornoCard`, `AlloggioForm`).
   - Nomi di funzioni e variabili in camelCase descrittivo.
   - Evitare abbreviazioni oscure.

---

## ⚡ Performance e Leggerezza

1. **Zero dipendenze superflue**:
   - Non aggiungere pacchetti senza aver verificato che non esista già un'alternativa nativa o già presente nel progetto.
   - Preferire API del browser (es. `IndexedDB` tramite `src/storage/indexedDB.ts`) a librerie pesanti, quando ragionevole.
2. **Bundle piccolo**:
   - Niente import di intere librerie se serve solo una funzione.
   - Usare import specifici e tree-shakable.
3. **Render efficienti**:
   - Evitare calcoli pesanti dentro il corpo del componente.
   - Usare `key` corrette nelle liste.
   - Non passare oggetti/funzioni nuove a ogni render se non necessario (soprattutto in liste lunghe).

---

## 🛡️ Gestione Errori e Robustezza

1. **Niente errori TypeScript ignorati**:
   - Non usare `// @ts-ignore` se non in casi eccezionali e commentati.
2. **Errori runtime**:
   - Catturare gli errori di storage (operazioni su `storageService.ts`) e mostrarli in modo comprensibile all'utente.
   - Non lasciare promise non gestite.
3. **Conferme e azioni distruttive**:
   - Usare sempre il componente `ConfirmDialog` per le eliminazioni.
   - Mai usare `window.confirm` o `alert` per azioni importanti.

---

## 📦 Build e Qualità

1. **Ogni modifica deve passare**:
   - `npm run build` (`tsc -b && vite build`) senza errori.
   - `npm run lint` (oxlint) senza errori.
2. **Nessun warning ignorato**:
   - Se un warning è accettabile, documentarlo brevemente nel codice o in questo README.
3. **Nessuna modifica al legacy**:
   - Non toccare `legacy-app/` se non esplicitamente richiesto dall'utente.

---

## 🌐 Online/Offline (in vista delle prossime fasi)

1. **Il livello di storage deve essere sostituibile**:
   - I componenti non devono sapere se i dati vengono da `IndexedDB`, Firebase Firestore o altro.
   - Tutti gli accessi ai dati passano esclusivamente per `storageService.ts`.
   - Gli eventuali futuri adattatori di sincronizzazione si agganciano a `storageService.ts`, senza modificare la UI.
2. **Preparare la sincronizzazione**:
   - Mantenere ID stabili e coerenti (usare `crypto.randomUUID()` o equivalente alla creazione).
   - Evitare logica che renda difficile il merge tra stato locale e remoto (es. evitare indici mutabili come chiavi primarie).
3. **Co-pilota e accesso condiviso**:
   - La struttura dei tipi in `src/types/index.ts` deve essere progettata per essere serializzabile su Firestore senza trasformazioni complesse.

---

## 🧭 Regola Pratica

Prima di scrivere codice, chiediti:

1. Questo pezzo di codice sarà facile da capire tra 3 mesi?
2. Se lo vedesse un altro sviluppatore, capirebbe subito cosa fa?
3. C'è un modo più semplice per ottenere lo stesso risultato, con meno righe e meno dipendenze?

Se la risposta a una di queste domande è "no", semplifica.
