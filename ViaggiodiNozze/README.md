# Honeymoon Roadbook

Un'applicazione PWA offline-first per la gestione e la consultazione di itinerari di viaggio complessi, originariamente sviluppata per un Viaggio di Nozze e successivamente espansa in un template riutilizzabile SaaS.

## Funzionalità Principali Sviluppate

### 1. Cloud Sync Engine (Firebase Firestore)
Il cuore dell'applicazione è un motore di sincronizzazione offline-first. 
- Utilizza `IndexedDB` come fonte di verità locale (per performance e modalità offline garantita).
- Utilizza `onSnapshot` di Firestore per l'aggiornamento real-time tra dispositivi (es. Guida e Co-pilota).
- Supporta la risoluzione dei conflitti (Last Write Wins) a livello di documento.

### 2. Multi-tenant Onboarding (Zero-State)
L'applicazione non è più vincolata a un singolo viaggio hard-coded.
- Implementazione di un `TripConfig` archiviato in `localStorage`.
- Vista `OnboardingView` per la creazione dinamica del viaggio o la connessione a uno esistente tramite "Codice Invito" (Trip ID).
- Calcolo dinamico dei giorni (`tripDates.ts`) basato sulle date selezionate, con generazione automatica del calendario.
- Utenti legacy automaticamente migrati all'ID `default` per prevenire perdite di dati.

### 3. Caveau Documenti Offline
I documenti di viaggio (passaporti, visti, polizze) possono avere allegati nativi.
- Supporta l'upload di immagini (JPG/PNG) e PDF.
- Salva i file come stringhe Base64 (Data URLs) all'interno del DB locale, garantendo la disponibilità senza connessione internet.
- Sincronizzazione automatica degli allegati con il cloud.
- Supporto alla compressione client-side nativa (tramite Canvas API) per garantire che i caricamenti rispettino i vincoli del DB (max 10MB per IndexedDB, mentre Firestore accetta documenti fino a 1MB per cui le immagini vengono ottimizzate pesantemente).

## Avvio del progetto
- `npm run dev` per avviare il server di sviluppo.
- `npm run build && npm run deploy` per la messa in produzione su GitHub Pages.
