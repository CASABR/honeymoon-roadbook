# Piano di applicazione recuperabile — viaggio 0000

## Stato e conteggi esatti

Solo preparazione manifest: **nessuna scrittura su Firestore o IndexedDB reale** (`noRealWrites: true`).
Il piano include le decisioni editoriali approvate e isola rigorosamente i blocchi non certi.

- **Record logici analizzati**: 460 pre-audit → 450 post-audit (differenza netta: -10 record logici).
- **Record applicabili nel manifest sicuro (102 operazioni distinte)**:
  - **76 record aggiornati** (action `update`: 71 normalizzazioni/correzioni tecniche certe + 5 decisioni editoriali approvate in-place: `tappa_02_rotorua`, `tappa_03_tekapo`, `tappa_04_queenstown`, `tappa_21`, `tappa_52`).
  - **18 record rimossi** (action `delete`, con 18 tombstone preventive e nessun legame con prenotazioni/spese).
  - **8 record aggiunti** (action `add`: 3 nuovi spot/voli certi e 5 migrazioni da tappe ad attività con ID identico).
  - *(Nota di raccordo: i 76 aggiornamenti + 8 aggiunte costituiscono gli 84 record positivi modificati/creati rilevati dal dry-run summary).*
  - **18 tombstone** generate preventivamente (`settings/tombstone_<collezione>_<id>`).
  - **Totale transazione**: 102 operazioni logiche (76 + 18 + 8) + 18 tombstones = **120 scritture Firestore** (sotto la soglia di 500).
- **Record esclusi / bloccati (nessuna scrittura)**:
  1. `trasporti/trn_03_volo_ca783` (rimozione bloccata) e `trasporti/transport_flight_pek_akl` (aggiornamento bloccato per conferma data/orari).
  2. `trasporti/trn_16_ceb_tpe_fco` (volo CI75: bloccato per discordanza orario arrivo 07:05 vs 07:15).
  3. `trasporti/trn_10_travellers_camper` e `shopping/shop_005` (restituzione Travellers Autobarn: bloccata per conflitto data/ora voucher 28/12 vs 29/12).
  4. 5 riconciliazioni multivaluta con `apply: false` (Shallow Inlet AUD, Werri #***REMOVED*** AUD, TAO USD, SeaLink #***REMOVED*** AUD, Tongariro shuttle NZD).

## Gate prima dell'applicazione

1. Acquisire un nuovo backup autenticato Firestore e IndexedDB, inclusa `settings`, immediatamente prima della finestra di applicazione.
2. Rigenerare dry-run e `generated/application-manifest.json`; il vecchio manifest è invalido se cambia anche un solo hash.
3. Confrontare in una transazione Firestore ogni record esistente con `expectedBefore.sha256` e verificare che ogni aggiunta sia ancora assente.
4. Se un record, un `updatedAt` o un ID atteso differisce, interrompere prima della prima scrittura: nessun merge automatico e nessuna sovrascrittura.

## Applicazione atomica e idempotente

- Usare una sola transazione Firestore, sotto il limite di 500 scritture (esattamente 120 scritture previste), con l'`idempotencyKey` del manifest (`roadbook-0000-cc5be9891257ea349ffd0e06`).
- Assegnare un unico timestamp di applicazione a `updatedAt`; preservare `createdAt` esistente e valorizzarlo solo per record nuovi.
- Per ogni eliminazione scrivere nella stessa transazione `settings/tombstone_<collezione>_<id>` con `entityType`, `deletedId`, `timestamp`, `deletedAt` e `pending: false`, quindi eliminare il record.
- Non riapplicare se esiste una ricevuta completata con lo stesso `idempotencyKey`; una seconda esecuzione deve risultare no-op.
- Dopo il commit, salvare una ricevuta privata con hash reali post-applicazione, timestamp, versioni e tombstone; solo allora riallineare IndexedDB tramite la sincronizzazione ordinaria.

## Verifica e rollback

1. Rileggere Firestore, verificare hash, tombstone, assenza duplicati e viste Copilota/prenotazioni/alloggi/spese/mappa/PDF.
2. Il rollback usa `private/cloud-before.json`, ma prima confronta ogni record corrente con l'hash post-applicazione della ricevuta.
3. Se qualunque record è cambiato dopo l'applicazione, il rollback globale si ferma e richiede riconciliazione manuale: non sovrascrive modifiche successive.
4. Se tutti gli hash coincidono, una transazione inversa ripristina i documenti originali e rimuove soltanto i tombstone creati dalla stessa ricevuta.
