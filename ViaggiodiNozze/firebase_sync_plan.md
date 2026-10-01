# Architecture Plan: Firebase Real-time Sync Engine

## Obiettivo Principale
Trasformare "Honeymoon Roadbook" da un'applicazione completamente isolata in locale a un ecosistema collaborativo **Offline-First**. Le modifiche effettuate dal "Co-pilota" (es. aggiungere post-it, spuntare checklist bagagli, inserire spese) devono apparire in tempo reale sul dispositivo della "Guida", e viceversa.

## Componenti Chiave

### 1. Inizializzazione Firebase
- Creeremo il file `src/services/firebaseConfig.ts` utilizzando la libreria Firebase v12 (già presente nel `package.json`).
- Utilizzeremo le variabili d'ambiente (es. `import.meta.env.VITE_FIREBASE_API_KEY`) per evitare di hardcodare le chiavi.

### 2. Architettura del Database (Firestore)
Per mantenere le cose semplici ed efficienti per una singola "room" (il vostro viaggio):
- Collezione Root: `trips`
- Documento: `trips/default`
- Sotto-collezioni (corrispondenti agli stores di IndexedDB):
  - `trips/default/activities`
  - `trips/default/transports`
  - `trips/default/accommodations`
  - `trips/default/spese`
  - `trips/default/notes`

### 3. Integrazione con `storageService.ts`
Attualmente `storageService` salva in IndexedDB e lancia l'evento `notifyDataChanged`.
Implementeremo un approccio ibrido **"Local-First, Cloud-Synced"**:
1. L'utente salva una modifica (es. Nuova Nota).
2. L'app salva in **IndexedDB** per reattività immediata e disponibilità offline.
3. Contestualmente, invia il payload a **Firestore**.
4. In background, `firebaseSync.ts` resta in ascolto tramite `onSnapshot` sulle sotto-collezioni Firestore.
5. Se un altro dispositivo (es. il Co-pilota) effettua una modifica, il listener Firestore si attiva sul telefono della Guida.
6. L'app della Guida scarica il dato, lo aggiorna nel proprio IndexedDB locale e lancia un evento di re-render UI.

### 4. Risoluzione dei Conflitti
Poiché stiamo usando sotto-collezioni per le singole entità, le collisioni saranno rarissime. Se la Guida modifica il volo A e il Co-pilota modifica la Tappa B, i due documenti sono separati. Per modifiche concorrenti allo *stesso* elemento, vincerà l'ultimo arrivato al server (LWW - Last Write Wins).

## Configurazione Richiesta
Per poter procedere, avrò bisogno delle credenziali del progetto Firebase. Se hai già un progetto Firebase attivo, forniscimi questo oggetto (o inseriscilo nel tuo `.env.local`):

```json
{
  "apiKey": "AIzaSy...",
  "authDomain": "tuo-progetto.firebaseapp.com",
  "projectId": "tuo-progetto",
  "storageBucket": "tuo-progetto.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abcdef..."
}
```

## Prossimi Step Operativi
1. Sostituire il mock `syncService.ts` con il vero bridge Firestore.
2. Inizializzare la connessione in `App.tsx` al mount.
3. Mappare i metodi CRUD per abilitare l'invio e la ricezione in streaming.
