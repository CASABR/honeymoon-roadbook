# Roadbook 0000 — dry-run del 28/10/2026

## Stato

**Solo preparato, non applicato.** Nessuna scrittura è stata eseguita su Firestore, IndexedDB reale, Rules, membership o dati di altri viaggi. Il roadbook non è dichiarato definitivo: servono approvazione del dry-run, soluzione della gestione multivaluta e rilettura persistente dopo l'eventuale applicazione.

## Perimetro analizzato

- 441 record locali IndexedDB e 485 documenti Firestore/LIVE, per 926 copie confrontate.
- 460 record logici cloud prima della proposta; 446 dopo la simulazione.
- Le collezioni operative locali e cloud hanno gli stessi ID e conteggi. Le 88 `routes` sono cache solo locale; `members`, `devices` e `locks` sono correttamente solo cloud.
- Le differenze degli allegati riguardano esclusivamente il chunking Firestore; non sono duplicati logici.
- `inviteTokens` non è enumerabile dall'account corrente (`403`), ma non è coinvolta dalle correzioni.

## Fonte autorevole e sincronizzazione

HOUNIGO è offline-first: IndexedDB e Firestore sono entrambi scrivibili e prevale il record con `updatedAt` più recente. Prima dei dati operativi vengono sincronizzati `settings` e tombstone; questo è il meccanismo che impedisce la riesumazione dei record eliminati. Per il dry-run la base autorevole è lo snapshot Firestore autenticato, verificato contro IndexedDB, integrato secondo la gerarchia voucher/email/mandato del proprietario. Firestore non è autorevole in modo assoluto se un dispositivo offline conserva una versione più recente.

## Esito simulazione

- 77 record aggiornati, 23 rimossi e 10 aggiunti nel diff eseguibile; la ventiquattresima rimozione (CA783) resta bloccata.
- 611 campi coinvolti complessivamente, inclusi campi di record aggiunti/rimossi; 23 tombstone pronte e una sospesa.
- Nessun ID è cambiato negli aggiornamenti; le 7 migrazioni conservano l'ID passando da `tappe` ad `attivita`.
- Restano bloccati i pagamenti multivaluta/shuttle e le tre discrepanze obbligatorie Travellers, CI75 e CA783.

## Output A–M

- A/C/D: `before-after.md`, `patch-plan.json`, `generated/proposed-diff.json`.
- Revisione per approvazione: `final-dry-run-review.md` e `generated/final-review.json`.
- B: `roadbook-proposto.md`.
- E/F/G/H/I/J/K/L/M: `verifiche.md`.
- Inventario completo: `generated/record-inventory-before.csv`.
- Snapshot privati e hash: `private/` (ignorata da Git) e `generated/dry-run-summary.json`.

## Gate di applicazione

Non applicare il piano finché il proprietario non approva il dry-run e non sono risolti i blocchi in `verifiche.md`. L'export applicativo non include `settings`, quindi da solo non costituisce un backup completo dei tombstone; un rollback sicuro richiede gli snapshot privati e una finestra di sincronizzazione controllata.
