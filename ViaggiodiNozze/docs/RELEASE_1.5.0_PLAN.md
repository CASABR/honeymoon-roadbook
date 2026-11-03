# HOUNIGO 1.5.0 — Piano di Release e Note Operative

Data di consolidamento: **3 Novembre 2026**  
Branch di lavoro: `work/product-completion`  
Stato produzione attuale: **1.4.0**  
Stato viaggio 0000: **Intoccabile / Nessuna scrittura remota**  
Costo infrastrutturale: **0 € (Cloudflare Free Workers AI, Pages, D1, Firebase Spark)**

---

## 1. Funzionalità e Correzioni Incluse nella 1.5.0

1. **Eliminazione Tappe Fantasma e Protezione Geocoding**:
   - Isolamento rigoroso tra waypoint di navigazione Google Maps e tappe effettive dell'itinerario roadbook.
   - I waypoint stradali intermedi (es. autostrade, bivi come Playford Hwy o Western Hwy) restano solo indicazioni di rotta e non vengono promossi automaticamente a tappe dell'itinerario senza approvazione esplicita.
   - Protezione del geocoder da omonimie e match geograficamente incompatibili (es. fermata bus di Stawell Victoria rifiutata per percorsi su Kangaroo Island South Australia).
   - Segnalazione percorsi anomali ("Posizione o percorso da verificare") anziché false tratte transoceaniche.
   - Protezione apertura Google Maps: per percorsi non verificati, apre la ricerca sicura della destinazione anziché tentare indicazioni stradali impossibili attraverso l'oceano.

2. **Nuovo Design Oggi e Ottimizzazione Visiva**:
   - Layout compatto con gerarchia chiara, contrasti migliorati e assenza di elementi ridondanti.
   - Logo centrato e navigazione ripulita.
   - Mappa GPS in tempo reale con preferenza LIVE memorizzata localmente.

3. **Selettore Orari a Due Rotelle e Digitazione Rapida**:
   - Selettore orario avanzato con rotelle ore/minuti (passo 5m).
   - Campo di digitazione rapida con inserimento automatico dei due punti (`HH:mm`), validazione dinamica e supporto incolla.
   - Tracciamento esplicito dello stato orario (`confermato` vs `indicativo` vs `non_specificato`).

4. **Passeggiate e Tappa Generica di Default**:
   - Nuova attività contenitore "Passeggiata" con visualizzazione a sottocard nella timeline di Oggi.
   - Categoria predefinita per nuove tappe: "Tappa" generica, senza forzature verso sottocategorie specialistiche.
   - Migrazione retrocompatibile garantita per escursioni e trekking preesistenti.

5. **Importazione Multipla e Quote HouniAI**:
   - Smart Import con estrazione simultanea fino a 5 tappe distinte, anteprima tabellare e approvazione/esclusione selettiva.
   - Quote HouniAI aumentate con diagnostica real-time, conteggio richieste residue e countdown ripristino UTC.

6. **Console Amministratore e Notifiche Push**:
   - Autenticazione con token Bearer verificato lato server Cloudflare Worker per invii push.
   - Simulazione dry-run protetta di default (zero invii accidentali).
   - Tracciamento ultimo accesso admin sicuro.

---

## 2. Verifiche di Compatibilità Worker / Frontend

- **Endpoint AI**: `https://hounigo-ai.nunzio114.workers.dev/v1/houniai` accetta richieste con schema strutturato Gemini/Cloudflare Workers AI, gestendo rate limit con codice 429 e timestamp di reset.
- **Endpoint Push**: `https://hounigo-ai.nunzio114.workers.dev/v1/push` gestisce sottoscrizioni VAPID su database D1 Cloudflare.
- **Frontend Fallback**: In assenza di connettività o con quote esaurite, il frontend opera in modalità autonoma offline senza blocchi.

---

## 3. Piano di Deploy

> **IMPORTANTE**: Nessun deploy o push è stato eseguito in questa sessione. Il worktree locale è pronto e validato.

Quando l'utente deciderà di avviare il rilascio in produzione:
1. Eseguire la build di produzione verificata:
   ```bash
   npm run build
   ```
2. Verificare l'integrità del bundle PWA e la lista precache generata in `dist/`.
3. Pubblicare su GitHub Pages:
   ```bash
   npm run deploy
   ```
4. Verificare l'aggiornamento della cache Service Worker sul client (aggiornamento automatico con prompt al caricamento).

---

## 4. Piano di Rollback

In caso di qualsiasi imprevisto in produzione:
1. Il codice sorgente del rilascio 1.4.0 precedente è fissato al commit `fa56c93` (o `3f7d316`).
2. Il bundle statico precedente 1.4.0 è memorizzato nel commit cleanroom `b220002` (tree `a04a9fd`).
3. Rollback immediato a 1.4.0 in 60 secondi:
   ```bash
   git checkout fa56c93
   npm run build
   npm run deploy
   ```
4. Nessun database remoto (Firestore 0000 o D1) viene alterato durante il rollback, garantendo zero perdita di dati per gli sposi.

---

## 5. Separazione tra Cleanroom GitHub e Deploy Funzionale

- La pulizia della cronologia GitHub (rimozione vecchie chiavi storiche e allineamento branch main) è documentata in `docs/GITHUB_HISTORY_CLEANUP_140.md`.
- Tale bonifica resta **totalmente indipendente e separata** dal deploy applicativo della 1.5.0.
- Nessuna sovrascrittura forzata (`push --force`) verrà effettuata senza esplicita richiesta dell'utente.
