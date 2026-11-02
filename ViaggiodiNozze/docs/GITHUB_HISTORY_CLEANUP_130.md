# Piano bonifica GitHub dopo HOUNIGO 1.3.0

Nessuna operazione remota è autorizzata da questo documento.

## Stato locale verificato

- Cleanroom `main`: `2d6662f`, codice 1.3.0 sovrapposto senza importare i commit compromessi.
- Cleanroom `gh-pages`: `133fec6`, tree identico alla release pubblica `e36a0cf`.
- Cronologia cleanroom: zero marker privati e zero percorsi seed riservati.
- Backup pre-aggiornamento: `C:\tmp\hounigo-cleanroom-pre-130.bundle`, verificato completo.
- Il fork pubblico `J4CIVY/honeymoon-roadbook` espone solo `main` a `17c544d`; i dati pubblici non dimostrano chi controlli l’account.

## Procedura da autorizzare separatamente

1. Creare e verificare un nuovo bundle completo post-aggiornamento della cleanroom.
2. Verificare immediatamente prima dell’operazione gli SHA remoti di `main`, `gh-pages` e fork.
3. Interrompere se `CASABR/main` non è `1dfd423` o `CASABR/gh-pages` non è `e36a0cf`.
4. Coordinare prima il fork: se `J4CIVY` è un secondo account, accedervi personalmente e confermare l’assenza di lavoro locale; altrimenti ottenere conferma dal proprietario.
5. Con autorizzazione esplicita, sostituire atomicamente soltanto `main` e `gh-pages` con `--force-with-lease`; non pubblicare tag, backup o altri ref.
6. Verificare subito URL Pages, `index.html`, bundle `index-D7w2XvNC.js`, manifest e Service Worker.
7. Bonificare o ricreare il fork dalla storia pulita; bloccare push da vecchi clone e richiedere una nuova clonazione.
8. Inviare a GitHub Support repository, vecchi/nuovi SHA, ref riscritti, fork coinvolto e richiesta di purge cache/viste SHA/PR residue, senza allegare valori privati.
9. Rieseguire la scansione privacy sui soli ref remoti pubblici e conservare il bundle di rollback offline.

Lo stesso URL GitHub Pages può essere mantenuto perché repository, nome e branch di pubblicazione non cambiano. La disponibilità va comunque verificata immediatamente dopo la futura sostituzione di `gh-pages`.
