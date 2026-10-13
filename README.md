# Hounigo — Digital Roadbook & Live Companion

Applicazione PWA offline-first per la consultazione, gestione e condivisione di itinerari di viaggio complessi (on the road, viaggi di nozze, itinerari a tappe).

> **Data Audit:** 13 Ottobre 2026  
> **Stato Rilascio:** Prototipo avanzato / Alpha controllata. **Non pronto per il rilascio a utenti non tecnici o pubblico generale.**

---

## 1. Descrizione e Obiettivo

Hounigo nasce per consentire ai viaggiatori di consultare tappe, alloggi, trasporti, attività e note offline durante il viaggio, sincronizzare le modifiche in tempo reale tra compagni di viaggio (ruolo Guida e ruolo Co-pilota) e condividere aggiornamenti pubblici e foto in tempo reale con amici e parenti (feed LIVE esterno).

---

## 2. Funzionalità Implementate e Limiti Noti

### Funzionalità Implementate (Verificate)
- **Dashboard Itinerario Dinamica (`OggiView`):** Navigazione giorno per giorno con range dinamico che include date passate, presenti e future basate sui record salvati in IndexedDB.
- **Card Informative Specializzate:** Card per Trasporti, Alloggi, Tappe, Attività, Ristoranti e Shopping con gerarchia tipografica uniforme.
- **Note Copilota con Popup Dedicato:** Accesso rapido alle note di guida/parcheggio tramite icona 🧭 senza interferire con la card frontale.
- **Sincronizzazione Locale Offline-First:** Persistenza su IndexedDB con layer asincrono (`storageService.ts`) e cache istantanea.
- **Dark Mode Completa:** Copertura cromatica su viewport, shell, card, bottom dock, categorie bar, menu impostazioni e modali.
- **Integrazione AI Gemini Flash:** Estrazione strutturata di dati e modalità Concierge impostata sul modello ufficiale `gemini-3.8-flash` (con resilienza multi-modello) tramite chiamata REST diretta.
- **Feed LIVE Pubblico (`/live_feeds/{tripId}`):** Visualizzazione pubblica per ospiti con reazioni anonime (❤️, 😍, 😂, 👋) e isolamento totale dai dati privati (nessun costo, documento o PNR esposto).
- **Service Worker PWA:** Generazione Service Worker Workbox con skipWaiting e clientClaim per aggiornamenti istantanei.

### Limiti Noti e Rischio Architetturale (Verificati)
- **Onboarding / Join Trip:** Disallineamento architetturale critico tra frontend e backend:
  - Il client in `OnboardingView.tsx` esegue una query Firestore diretta `query(collection(db, 'trips'), where('inviteCode', '==', codeClean))` e un `updateDoc(tripRef, { members: arrayUnion(uid) })`.
  - Le `firestore.rules` vietano la query globale e vietano l'aggiunta di membri da client non già membri (`permission-denied`).
  - La Cloud Function `joinTrip` presente in `functions/src/index.ts` non viene chiamata dal frontend e contiene una gestione asimmetrica dei token d'invito.
- **Isolamento Notifiche Push:** Lo script amministrativo `notify` invia notifiche in broadcast a tutti i device registrati in `push_subscribers` se invocato senza argomenti espliciti.
- **Ruolo 0000 (Master Trip):** Presenza di logiche di bypass hardcoded nel frontend (`OnboardingView`, `App.tsx`, `usePushNotifications`) che bypassano i controlli per il codice `0000`.

---

## 3. Stack Tecnologico e Architettura

- **Frontend Core:** React 19, TypeScript 5.8 / 6.0, Vite 8.
- **Styling:** Tailwind CSS v4 con CSS Variables native e varianti dark mode.
- **Persistenza Client:** IndexedDB via API native + localStorage per flag di sessione sincroni.
- **Backend Cloud:** Firebase Firestore, Firebase Authentication (Anonymous + Email/Google), Cloud Functions for Firebase v2 (Node.js 20).
- **Notifiche Push:** Web Push standard (VAPID) con Service Worker dedicato (`push-sw.js`).
- **Mappe & Routing:** Leaflet / React-Leaflet + OpenRouteService / HeiGIT API.
- **AI Extraction:** Google Gemini API (`gemini-3.8-flash`).

---

## 4. Struttura del Repository

```
App-viaggio-di-nozze/
├── ViaggiodiNozze/              # Applicazione React principale (PWA)
│   ├── src/
│   │   ├── components/         # Card, Modali, Navigation Bar, Form
│   │   ├── hooks/              # Hook custom (Push, Presence, Install)
│   │   ├── services/           # aiExtractor, enrichmentService, liveService
│   │   ├── storage/            # IndexedDB, storageService, syncService
│   │   ├── utils/              # tripConfig, tripDates, masterTrip
│   │   └── views/              # OggiView, MappaView, OnboardingView, ecc.
│   ├── functions/              # Cloud Functions Firebase (TypeScript)
│   ├── public/                 # Asset statici, icone PWA, push-sw.js
│   ├── scripts/                # Script di manutenzione e notifica
│   └── vite.config.ts          # Configurazione bundle Vite + PWA
├── firestore.rules             # Regole di sicurezza Firestore
├── storage.rules               # Regole di sicurezza Storage
├── firebase.json               # Configurazione hosting, rules e functions
├── package.json                # Script workspace root
└── README.md                   # Documentazione di progetto
```

---

## 5. Prerequisiti e Configurazione

### Prerequisiti
- Node.js 20.x o superiore
- npm 10.x o superiore
- Account Firebase con progetto configurato (Firestore, Auth, Functions)

### Variabili d'Ambiente (`.env.local`)
Creare un file `.env.local` nella cartella `ViaggiodiNozze/` partendo da `.env.example`:

```ini
# Firebase Client SDK
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Google Gemini AI (Opzionale: configurabile anche da UI Impostazioni)
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# OpenRouteService Routing API
VITE_ORS_API_KEY=your_ors_api_key_here
```

---

## 6. Comandi di Sviluppo, Build e Deploy

I comandi sono verificati ed eseguibili dalla root o da `ViaggiodiNozze/`:

```bash
# Sviluppo locale (porta 5173)
npm run dev

# Controllo tipi TypeScript
npm run build --prefix ViaggiodiNozze   # include tsc -b && vite build

# Linting codice
npm run lint

# Build e pubblicazione su GitHub Pages
npm run deploy

# Esecuzione test di sicurezza regole locali
node ViaggiodiNozze/test_security_fase3.cjs
```

---

## 7. Architettura di Sicurezza e Flussi Chiave

### A. Accesso ai Viaggi Privati
- **Owner:** Creatore del viaggio, memorizzato in `ownerUid`. Può modificare la configurazione del viaggio e generare inviti.
- **Membri:** Elencati in `/trips/{tripId}/members/{uid}` e nel campo array `members` del documento del viaggio. Accesso consentito in lettura/scrittura a tutti i sotto-documenti (tappe, trasporti, alloggi, ecc.).
- **Esterni:** Nessun accesso consentito a `/trips/{tripId}` o alle sue sottocollezioni.

### B. Flusso Invito e Adesione (`joinTrip`)
1. L'owner genera un codice invito da `GestioneViaggioView`.
2. Il co-pilota riceve il link con parametro `?join=CODICE&role=copilota`.
3. **Stato Attuale:** La transizione verso l'uso esclusivo della Callable Cloud Function `joinTrip` non è completata nel frontend, creando fallimenti per viaggi non master.

### C. Live Feed Pubblico (`/live_feeds/{tripId}`)
- La lettura è aperta a chiunque abbia il link (`allow read: if true`).
- I visitatori possono inserire reazioni anonime validate dallo schema.
- Non vengono mai esposti prezzi, numeri di prenotazione, documenti personali o posizioni GPS non pubblicate esplicitamente.

---

## 8. Problemi Aperti e Debito Tecnico Prioritario

1. **[P0] Unificazione Flusso `joinTrip`:** Aggiornare `OnboardingView.tsx` per chiamare `httpsCallable(functions, 'joinTrip')` con fallback coerente e gestione degli errori (`not-found`, `permission-denied`, `failed-precondition`).
2. **[P0] Isolamento Script Push:** Richiedere obbligatoriamente `tripId` valido in `send-update-notification.cjs` rifiutando l'esecuzione con fallback broadcast a tutti i record.
3. **[P1] Bonifica Bypass `0000`:** Rimuovere gradualmente i controlli hardcoded sul codice viaggio `0000` nei componenti di produzione prima dell'apertura a utenti esterni.
4. **[P1] Linting Oxlint:** Risolvere i warning per variabili inutilizzate e dipendenze degli hook (`useEffect`).

---

## 9. Checklist per Rilascio Beta Pubblico

- [ ] Flusso `joinTrip` via Cloud Function testato su dispositivi reali con account distinti.
- [ ] Regole Firestore verificate in produzione su Firebase Console.
- [ ] Script Push isolato con parametro `tripId` obbligatorio.
- [ ] Rimozione completa di riferimenti e logiche hardcoded al viaggio `0000`.
- [ ] Test di installazione PWA ed esperienza offline su iOS Safari e Android Chrome.
- [ ] Informativa privacy e termini d'uso per visitatori del feed LIVE.
