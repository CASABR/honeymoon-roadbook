# Prova breve Owner e Giusy — due iPhone

Usare un viaggio sintetico condiviso, senza modificare 0000. Aprire la PWA 1.6.39 su entrambi gli iPhone. La ricezione Push a schermo bloccato e la sincronizzazione reale restano da verificare.

- **Accesso:** Owner invita Giusy come Copilota; verificare il ruolo su entrambi, permesso notifiche nella PWA installata e iscrizione Push distinta per ciascun iPhone.
- **Andata/ritorno:** Owner crea una tappa sintetica; Giusy cambia una nota; Owner vede il cambiamento e modifica un altro campo, che Giusy deve ricevere una sola volta.
- **Offline:** Giusy attiva modalità aereo e modifica la nota; riapre offline, poi riattiva rete. Verificare recupero su entrambi, nessun duplicato e nessuna perdita.
- **Push bloccato:** sul viaggio sintetico preparare un solo evento confermato con fuso IANA corretto e inizio tra almeno 65 minuti; verificare due job a −60 minuti, bloccare gli schermi prima della scadenza e annotare arrivo/ora/tap su entrambi. Se manca, distinguere job assente, invio fallito e invio accettato senza avviso. Nessun invio di prova automatico eseguito da Codex.
- **LIVE:** Owner condivide GPS e Giusy osserva senza attivare un secondo trasmettitore; verificare posizione condivisa e pagina pubblica passiva. Sulla 1.6.39 verificare primo centro GPS, nessun salto dopo scelta manuale, ricentratura esplicita e riapertura. Provare la delega solo nel viaggio sintetico, poi arrestare la condivisione e pulire soltanto i dati di prova.

Annotare versione/iOS, dispositivo, orario e risultato per ogni punto; un test simulato non certifica iPhone fisico o ricezione a schermo bloccato.

## Verifiche ancora aperte

- Giusy deve abilitare le Push nella PWA installata sul suo iPhone e verificare la propria iscrizione.
- Verificare ricezione a -60 minuti con PWA chiusa e iPhone bloccato su entrambi i telefoni.
- Testare sincronizzazione Owner/Copilota, anche offline e dopo il ritorno della rete.
