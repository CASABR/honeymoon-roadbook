# Coda collaudo pre-partenza — 25/11/2026, HOUNIGO 1.7.23

Questa coda integra (non sostituisce) HOUNIGO_BASELINE_STABILE.md e HOUNIGO_TEST_DUE_IPHONE.md. Release 1.7.23 pubblicata secondo il report Antigravity; test su hardware reale ancora aperti. L'utente ha confermato il ripristino dei commenti/foto in 1.7.22; non equivale alla verifica delle nuove funzioni 1.7.23. Usare viaggio sintetico per mutazioni di prova, non 0000; mai svuotare storage o code per test.

## Test reali superati — conferma utente del 25/11/2026 (1.7.23)
- [x] Messaggi e risposte con citazione.
- [x] Commenti e risposte alle foto.
- [x] Pubblicazione foto e visualizzazione ospite.
- [x] Eliminazione messaggi e commenti (Owner).
- [x] Notifiche Owner a schermo bloccato.
- [x] GPS LIVE, centratura e arresto condivisione.
- [x] Apertura documenti, PDF e polizze.
- [x] Promemoria 60 minuti prima degli eventi.

## Prima della partenza — eseguibili da solo, ancora aperti
- [ ] Verificare safe area/notch, tastiera, modali, apertura card e layout iPhone/iPad; su iPad mini se disponibile verificare anche layout LIVE e Duplica. Apertura documenti/PDF/polizze confermata; disponibilità offline da verificare.
- [ ] Emoji: inserimento/modifica e persistenza dopo riapertura, senza blocchi o duplicazioni.
- [ ] Offline Owner: viaggio sintetico, modifica singola in modalità aereo, riapertura, ritorno online, coda senza perdita/duplicati; lettura dei documenti necessari già scaricati.

## Con Giusy (o secondo dispositivo con identità Copilota distinta)
- [ ] Accesso, ruolo, iscrizione Push; verifica Hobbiton e allineamento dati privati autorizzati.
- [ ] Sync bidirezionale tappa/spesa e offline/riconciliazione, nessun duplicato.
- [ ] Delegare GPS su viaggio sintetico, verifica condivisione e STOP.
- [ ] Moderazione Copilota: cancellare messaggio/commento e verificare sparizione pubblica.
- [ ] Push Copilota a schermo bloccato: nuova card, foto, commento Owner, messaggio/risposta ospite, promemoria -60 min; tap corretti e nessuna auto-notifica. Owner deve ricevere eventi ospiti anche lui.
- [ ] Verificare che azioni proprie non producano notifiche su altri dispositivi con lo stesso UID; controllare deduplica e raggruppamento.

## Durante il viaggio / dopo il rientro
- [ ] Durante: auto-focus giorno/card attiva, doppio orologio e cambio fusi, mini-card trasporti, GPS aggiornato e layout LIVE su hardware.
- [ ] Dopo: autosalvataggio Shopping (NO-GO pre-partenza), suite obsolete/warning lint, riesame WIP locali; revoca/rotazione credenziali e permessi push secondo baseline, verificando dipendenze LIVE prima della revoca.
- [ ] Verifiche operative distinte dai test: riconciliare eventuali stime/valute del budget, Pechino e check-in/transfer Auckland se ancora aperti. La baseline storica non certifica lo stato attuale di queste prenotazioni: verificare prima di modificarle.

Nota: otto test reali dichiarati superati dall’utente; non certificati indipendentemente. I dettagli non esplicitamente confermati (tap/deep-link, auto-notifiche e deduplica, persistenza dopo riapertura e isolamento delle conversazioni, ultimo fix GPS dopo perdita rete) restano da verificare nel collaudo residuo, senza riaprire gli otto risultati confermati. Nessuna modifica al codice, ai deploy o a 0000.
