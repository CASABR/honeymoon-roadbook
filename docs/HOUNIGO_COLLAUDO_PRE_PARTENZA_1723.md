# Coda collaudo pre-partenza — 25/11/2026, HOUNIGO 1.7.23

Questa coda integra (non sostituisce) HOUNIGO_BASELINE_STABILE.md e HOUNIGO_TEST_DUE_IPHONE.md. Release 1.7.23 pubblicata secondo il report Antigravity; test su hardware reale ancora aperti. L'utente ha confermato il ripristino dei commenti/foto in 1.7.22; non equivale alla verifica delle nuove funzioni 1.7.23. Usare viaggio sintetico per mutazioni di prova, non 0000; mai svuotare storage o code per test.

## Prima della partenza — eseguibili da solo
- [ ] Verificare versione aggiornata in PWA iPhone; controllare safe area/notch, tastiera, modali, apertura card, foto e PDF, documenti/polizze disponibili offline; su iPad mini se disponibile verificare anche layout LIVE e Duplica.
- [ ] Con Owner su iPhone e ospite in finestra privata del PC/Safari: messaggio generale, risposta con citazione; commento foto e risposta; verificare isolamento per foto, visibilità reciproca e persistenza dopo riapertura.
- [ ] Owner: pubblicare foto di prova, vedere come ospite; eliminare commento e messaggio e verificare sparizione nella vista pubblica.
- [ ] Emoji: inserimento/modifica e persistenza dopo riapertura, senza blocchi o duplicazioni.
- [ ] Push Owner: da ospite inviare messaggio, risposta e commento mentre iPhone bloccato/PWA chiusa; verificare ricezione entro la normale finestra di batching/cron, tap al contenuto; nessun avviso per propria azione.
- [ ] GPS: avviare condivisione Owner, osservare vista ospite da PC, primo centro, nessun salto dopo scelta manuale, ultimo fix dopo perdita rete, STOP revoca vista pubblica.
- [ ] Offline Owner: viaggio sintetico, modifica singola in modalità aereo, riapertura, ritorno online, coda senza perdita/duplicati; lettura dei documenti necessari già scaricati.
- [ ] Promemoria Owner a -60 min con fuso IANA e schermo bloccato (evento sintetico a >65 minuti); distinguere accodamento, consegna e apertura.

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

Nota: nessun nuovo test reale eseguito in questa registrazione, nessuna modifica al codice, ai deploy o a 0000.
