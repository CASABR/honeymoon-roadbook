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
- **Integrazione AI Houni AI (Google AI Studio & Gemini Flash):** Estrazione intelligente dati voucher, note e concierge di viaggio. Supporto completo e trasparente a chiavi generate da Google AI Studio sia con nuovo prefisso `AQ.` che con formato standard `AIzaSy.`. Sanitizzazione automatica delle stringhe (trim e strip apici), autenticazione via query parameter `?key=`, chiamata endpoint `v1beta/models/...:generateContent` e pipeline resiliente basata sul modello `gemini-3.1-flash-lite` con fallback automatico multi-modello.
- **Feed LIVE Pubblico (`/live_feeds/{tripId}`):** Visualizzazione pubblica per ospiti con reazioni anonime (❤️, 😍, 😂, 👋) e isolamento totale dai dati privati (nessun costo, documento o PNR esposto).
- **Service Worker PWA:** Generazione Service Worker Workbox con skipWaiting e clientClaim per aggiornamenti istantanei.

### Tabella Ufficiale Attività Honeymoon 2026/2027

Elenco consolidato delle attività ed escursioni confermate dell'itinerario ufficiale on-the-road (Nuova Zelanda, Australia, Filippine). **Nota di integrità:** l'itinerario ufficiale e i relativi costi e note operative non devono essere sovrascritti o sostituiti da seed mockup fittizi.

| # | Data | Attività / Esperienza | Luogo / Fornitore | Prezzo / Modalità | Note Operative & Copilota |
|---|---|---|---|---|---|
| 1 | 28/11/2026 | **Museo del Novecento** | Milano (Piazza del Duomo) | 20,00 € (10 € cad.) | Ultimo ingresso ore 18:30, chiusura 19:30. In loco o online. |
| 2 | 30/11/2026 | **Grande Muraglia Cinese (Mutianyu)** | Pechino / Scalo Air China | In loco (Funivia & Toboggan) | Scalo di 18h 35m. Visto transito 24/144h. Toboggan discesa. |
| 3 | 02/12/2026 | **Waitomo Caves (Glowworm Caves Tour)** | Waitomo / GetYourGuide | 84,58 € (Saldato) | Barca sotterranea larve luminose. 12-14 °C. Divieto foto. |
| 4 | 03/12/2026 | **Hobbiton Movie Set Tour** | Matamata / GetYourGuide | 129,36 € (Saldato) | Partenza ore 08:30 da Waitomo. Presentarsi alle 10:45 a The Shires Rest. |
| 5 | 03/12/2026 | **Esperienza Culturale Maori Te Pā Tū con Cena** | Rotorua / GetYourGuide | 288,58 € (Saldato) | Ref: 3KQIPMAAZJD6CHQ8VYDBGVT1FDXMDDCF. Rito e cena tradizionale Hāngi. |
| 6 | 07/12/2026 | **Kaikoura Whale Watch** | Kaikoura / GetYourGuide | 174,14 € (Saldato) | Check-in ore 08:10 Whaleway Station. Pastiglia mal di mare 30 min prima. |
| 7 | 09/12/2026 | **Fox Glacier Heli-Hike** | Fox Glacier / Headout | 852,82 € (Saldato) | Volo elicottero + trekking su ghiaccio. Verifica meteo ore 07:30. |
| 8 | 12/12/2026 | **Crociera Milford Sound** | Milford Sound / Cruise Milford NZ | 154,08 € (Saldato) | Prenotata Booking. Banco Cruise Milford. Parcheggio a 10 min a piedi. |
| 9 | 16/12/2026 | **Seal Bay Conservation Park (Leoni Marini)** | Kangaroo Island / Parks SA | 50,00 € (Da saldare) | Tour guidato con ranger sulla battigia tra i leoni marini protetti. |
| 10 | 16/12/2026 | **Flinders Chase NP (Remarkable Rocks & Admirals Arch)** | Kangaroo Island / Parks SA | Incluso nel pass parco | Sculture di granito e otarie neozelandesi. Accesso con pass auto. |
| 11 | 24/12/2026 | **Dolphin Cruise Jervis Bay** | Jervis Bay / Huskisson | 70,00 € (Da saldare) | Uscita in catamarano per branchi di delfini residenti a Jervis Bay. |
| 12 | 30/12/2026 | **Tour Privato Barca Boracay (Island Hopping)** | Boracay / White Beach Station 2 | 60,00 € (Da saldare) | Barca locale privata per Crocodile Island e snorkeling Crystal Cove. |
| 13 | 02/01/2027 | **Briefing Obbligatorio TAO Philippines** | El Nido Town Proper | Incluso nella spedizione | Ore 17:30 ritiro sacche stagne e briefing rotte e sicurezza. |
| 14 | 03-06/01/2027 | **Spedizione Avventura TAO Philippines (El Nido → Coron)** | Palawan / TAO Philippines | 1.410,65 € (Saldato) | 4 giorni tra isole remote Linapacan e Culion. Campi base tradizionali. |

---

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
