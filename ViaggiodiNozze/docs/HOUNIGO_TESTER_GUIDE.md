# HOUNIGO — GUIDA PER I BETA TESTER (BETA 28 OTTOBRE 2026)

> **Inizia in 30 Secondi**:
> 1. Apri **`https://casabr.github.io/honeymoon-roadbook/`** dallo smartphone.
> 2. Seleziona **"1. Organizza un viaggio"** per creare il tuo itinerario, oppure tocca il link WhatsApp ricevuto per unirti come **Co-pilota**.
> 3. Aggiungi la tua prima tappa dal tab **Itinerario** e prova a invitare un compagno di viaggio!

Benvenuto nel programma di collaudo di **Hounigo**, la Progressive Web App (PWA) editoriale per organizzare, vivere e condividere il tuo viaggio on the road.

Questa guida rapida descrive come iniziare, come testare i flussi principali e come segnalare eventuali anomalie o suggerimenti.

---

## 1. COME APRIRE E INSTALLARE HOUNIGO

Hounigo è disponibile come applicazione web progressiva (PWA):

1. **Da Smartphone (Consigliato per i tester in movimento)**:
   - **iPhone (Safari)**: Apri il link `https://casabr.github.io/honeymoon-roadbook/`, tocca l'icona di condivisione in basso (quadrato con freccia verso l'alto) e seleziona **"Aggiungi alla schermata Home"**.
   - **Android (Chrome)**: Apri il link, tocca i tre puntini in alto a destra e seleziona **"Installa app"** o **"Aggiungi a schermata Home"**.
   - 💡 *Se apri il link da WhatsApp*: tocca l'icona del browser o i tre puntini in basso/alto a destra per aprire il link direttamente in **Safari** o **Chrome** prima di installare l'app.
2. **Da Desktop / Tablet**:
   - Apri il link con qualsiasi browser moderno (Chrome, Safari, Edge, Firefox). L'applicazione si adatterà automaticamente alla visualizzazione panoramica.

---

## 2. FLUSSI PRINCIPALI DA TESTARE

### A. Creare un Nuovo Viaggio
1. Alla prima apertura (o da **Altro** > **I Tuoi Viaggi** > **Crea nuovo viaggio**), tocca **"1. Organizza un viaggio"**.
2. Inserisci il titolo (es. *Giappone 2026* o *Weekend in Toscana*), il tuo nome come organizzatore e le date di partenza e rientro.
3. Tocca **"Crea Viaggio e Prosegui"**: il viaggio verrà salvato istantaneamente sul cloud e associato al tuo profilo.

### B. Invitare un Co-pilota (Condivisione Sicura)
1. Dalla schermata di conferma creazione (oppure in qualunque momento da **Altro** > **Partecipanti & Inviti**), tocca **"Invita un Copilota"**.
2. Tocca **"Copia Link d'Invito"** o usa la condivisione diretta (WhatsApp, Telegram, Messaggi).
3. Il link generato contiene una chiave crittografica protetta valida 7 giorni.
4. Quando il co-pilota apre il link dal suo smartphone, vedrà la schermata **"Invito Co-pilota Valido"** con i dettagli del viaggio e potrà toccare **"Accetta Invito e Inizia"** per collaborare in tempo reale su tappe, note e spese.

### C. Selezionare o Cambiare Viaggio
1. Vai nella sezione **Altro** (ultima voce della barra di navigazione in basso o nel menu laterale).
2. In alto vedrai il chip del viaggio attualmente attivo: tocca il pulsante **"Cambia Viaggio"**.
3. Comparirà l'elenco di tutti i viaggi associati al tuo account, divisi ordinatamente tra:
   - 👑 **Organizzatore**: i viaggi creati da te.
   - 🤝 **Co-pilota**: i viaggi a cui sei stato invitato.
4. Tocca **"Apri"** su un viaggio: i dati del viaggio selezionato si caricheranno istantaneamente senza residui del viaggio precedente.

### D. LIVE Experience & Posizione GPS
1. Tocca la scheda **LIVE** nella navigazione.
2. Se sei l'Organizzatore con smartphone sul campo:
   - Sotto la mappa comparirà l'**Action Card GPS** con il pulsante verde *"Attiva GPS su questo smartphone"*.
   - Autorizza la geolocalizzazione quando richiesto dal browser.
   - Lo stato passerà a *"Attiva (Guida)"* e la mappa mostrerà la tua posizione reale aggiornata.
3. Se sei su Desktop o se non hai attivato il GPS:
   - La mappa mostrerà in modo trasparente lo stato (*"Non ancora avviata"*, *"Connessione assente"* o la posizione stimata da programma), senza spacciare stime per GPS reale.

---

## 3. COSA È ANCORA IN BETA (LIMITAZIONI NOTE)

Per garantire la massima stabilità durante il collaudo, alcune funzioni avanzate sono contrassegnate come sperimentali o temporaneamente limitate:

- **Galleria Fotografica Pubblica Cloud**: Le foto che scatti vengono salvate sul tuo dispositivo locale. La sincronizzazione istantanea remota delle immagini verso gli ospiti esterni sarà abilitata nella release successiva tramite CDN persistente.
- **Tracciamento GPS in Background su iPhone**: Se blocchi lo schermo di un iPhone per periodi prolungati, Safari/iOS potrebbe sospendere temporaneamente la localizzazione per risparmio energetico; riaprendo la PWA la trasmissione riprenderà immediatamente.
- **Console Amministratore Globale**: È riservata alla manutenzione tecnica e non compare nei menu utente standard.

---

## 4. COME SEGNALARE UN ERRORE O UN FEEDBACK

Per consentire al team di intervenire tempestivamente, puoi inviare i tuoi feedback tramite email o messaggio diretto specificando:

1. **Dispositivo utilizzato** (es. *iPhone 15 Pro iOS 17.5*, *Samsung Galaxy S23 Chrome*, *MacBook Safari*).
2. **Priorità del feedback**:
   - 🔴 **CRITICO (Bloccante)**: L'app si blocca, schermo bianco, dati non salvati, impossibile accedere o creare il viaggio.
   - 🟡 **IMPORTANTE**: La funzione funziona ma in modo anomalo o confuso (es. pulsante difficile da toccare, testo tagliato a 320px, tempo di attesa anomalo).
   - 🟢 **MIGLIORAMENTO / SUGGERIMENTO**: Un'idea per rendere l'interfaccia più comoda, intuitiva o gradevole.
3. **Cosa stavi facendo** (passaggi esatti per riprodurre la situazione).
4. **Schermata o screenshot** (se visibile un messaggio di avviso o errore).

Grazie per il tuo prezioso contributo alla beta di Hounigo!
