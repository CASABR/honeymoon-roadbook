# Piano di applicazione recuperabile — viaggio 0000

## Stato

Solo preparazione: nessuna scrittura su Firestore o IndexedDB reale. Le cinque eliminazioni editoriali, CA783, CI75, Travellers Autobarn e le cinque riconciliazioni multivaluta sono escluse.

## Gate prima dell'applicazione

1. Acquisire un nuovo backup autenticato Firestore e IndexedDB, inclusa `settings`, immediatamente prima della finestra di applicazione.
2. Rigenerare dry-run e `generated/application-manifest.json`; il vecchio manifest è invalido se cambia anche un solo hash.
3. Confrontare in una transazione Firestore ogni record esistente con `expectedBefore.sha256` e verificare che ogni aggiunta sia ancora assente.
4. Se un record, un `updatedAt` o un ID atteso differisce, interrompere prima della prima scrittura: nessun merge automatico e nessuna sovrascrittura.

## Applicazione atomica e idempotente

- Usare una sola transazione Firestore, sotto il limite di 500 scritture, con l'`idempotencyKey` del manifest.
- Assegnare un unico timestamp di applicazione a `updatedAt`; preservare `createdAt` esistente e valorizzarlo solo per record nuovi.
- Per ogni eliminazione scrivere nella stessa transazione `settings/tombstone_<collezione>_<id>` con `entityType`, `deletedId`, `timestamp`, `deletedAt` e `pending: false`, quindi eliminare il record.
- Non riapplicare se esiste una ricevuta completata con lo stesso `idempotencyKey`; una seconda esecuzione deve risultare no-op.
- Dopo il commit, salvare una ricevuta privata con hash reali post-applicazione, timestamp, versioni e tombstone; solo allora riallineare IndexedDB tramite la sincronizzazione ordinaria.

## Verifica e rollback

1. Rileggere Firestore, verificare hash, tombstone, assenza duplicati e viste Copilota/prenotazioni/alloggi/spese/mappa/PDF.
2. Il rollback usa `private/cloud-before.json`, ma prima confronta ogni record corrente con l'hash post-applicazione della ricevuta.
3. Se qualunque record è cambiato dopo l'applicazione, il rollback globale si ferma e richiede riconciliazione manuale: non sovrascrive modifiche successive.
4. Se tutti gli hash coincidono, una transazione inversa ripristina i documenti originali e rimuove soltanto i tombstone creati dalla stessa ricevuta.
