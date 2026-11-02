# Verifica accesso J4CIVY

Verifica pubblica del 30 ottobre 2026:

- `J4CIVY/honeymoon-roadbook` è un fork pubblico di `CASABR/honeymoon-roadbook`.
- Il proprietario pubblico è l'account personale `J4CIVY`; i dati pubblici non consentono di stabilire chi controlli l'account.
- Il fork espone soltanto il branch `main`, è 112 commit indietro e 0 commit avanti rispetto al `main` di origine.
- Non risultano quindi commit pubblici esclusivi da preservare, ma la vecchia cronologia resta da considerare contaminata.

## Controllo personale sicuro

1. Non usare vecchi clone e non eseguire push.
2. Aprire una finestra privata del browser e accedere a GitHub con le credenziali che si ritiene appartengano a `J4CIVY`.
3. Verificare che il selettore account mostri esattamente `J4CIVY`.
4. Aprire `https://github.com/J4CIVY/honeymoon-roadbook/settings`.
5. Se la pagina Settings del repository è accessibile e mostra le impostazioni amministrative, l'account autenticato controlla il fork; non modificare né cancellare nulla in questa fase.
6. Se GitHub richiede 2FA, usare soltanto i propri metodi o codici di recupero. Se il recupero fallisce, seguire il recupero account ufficiale GitHub.
7. Comunicare soltanto l'esito “accesso confermato/non confermato”, senza condividere password, token o codici 2FA.

La cancellazione, la riscrittura della cronologia o il force push del fork richiedono un'autorizzazione separata. La cleanroom esistente non è stata modificata.
