# Cronologia aggiornamenti HOUNIGO

Questo file contiene esclusivamente versioni di cui è verificabile la pubblicazione. Le release preparate ma non ancora pubblicate restano fuori dalla cronologia visibile nell’app.

## 1.7.37 — 2026-11-26

- Retro Trasporti uniforme per tutte le sottocategorie, con campi specifici e dati precedenti preservati.
- Aereo: retro e fronte ridisegnati per mobile, campi editabili, avvisi leggibili, terminal e posti adattivi e azioni accessibili.

## 1.7.36 — 2026-11-26

- Retro Treno compatto: binario, carrozza e posti separati, cambio treno dedicato, fusi automatici per località riconosciute e note collassate, con compatibilità dei dati precedenti.

## 1.7.35 — 2026-11-26

- Retro Aereo: dati aeroportuali automatici con verifica solo in caso di anomalie, grafica dedicata allo scalo e card a larghezza intera nella modalità mobile su iPad.

## 1.7.34 — 2026-11-26

- Retro Aereo: note copilota chiuse di default, riepiloghi tecnici compatti e fusi ricavati dagli aeroporti riconosciuti, con correzione manuale.

## 1.7.33 — 2026-11-26

- Retro Aereo: sezioni itinerario, economia, dettagli tecnici e note distinte per colore, con contrasto verificato nei temi chiaro e scuro.

## 1.7.32 — 2026-11-26

- Retro Aereo: modale più alto su iPhone, campi testuali adattivi e spaziature più compatte, con safe area e tastiera preservate.

## 1.7.31 — 2026-11-26

- Retro Aereo più compatto su iPhone: nome e mezzo affiancati, azioni in una riga, terminal multilinea e note dello scalo editabili.

## 1.7.30 — 2026-11-26

- Retro card Aereo: riorganizzazione gerarchica (Compagnia con selettore mezzo accanto, Partenza/Arrivo, Terminal/Gate, Quadro economico sempre aperto, Scalo, Dettagli volo collassati, IATA/fusi avanzati collassati, PNR/Bagagli/Biglietti, Note Copilota) con durata scalo calcolata in sola lettura.

## 1.7.29 — 2026-11-26

- Retro card Aereo ottimizzato: quadro economico sempre aperto, Terminal/Gate visibile, Dettagli volo collassati, gestione scali con calcolo automatico durata e fuso orario, IATA/fusi automatici, funzioni condivise PNR/Bagagli/Biglietti senza perdita modifiche e Note Copilota.

## 1.7.28 — 2026-11-26

- Ottimizzazione iPad mini 6 landscape (1133×744): timeline a 2 colonne affiancate, mappa LIVE affiancata a prossimo spostamento e stato GPS, modali più ampie e compatte in altezza, sidebar snella e preservazione di scroll, giorno selezionato e modifiche in corso durante la rotazione.

## 1.7.27 — 2026-11-25

- Fix safe area iPhone Dynamic Island e tastiera software su modali e sheet mobile (`Modal`, `useVisualViewportBox`, `index.css`), con verifica automatica su viewport mobile/iPad e retro card Trasporti su iPhone 15 Pro simulato.

## 1.7.26 — 2026-11-25

- Retro card Trasporti ottimizzato per sottocategoria (Aereo, Treno, Traghetto, Auto, Camper, Bus/Transfer, Taxi, Metro): altezza ridotta con sezioni espandibili per dettagli secondari, quadro economico e note, mantenendo sempre visibili e modificabili tutti i dati già compilati anche cambiando mezzo.

## 1.7.25 — 2026-11-25

- LIVE e Oggi: verifica e affinamento del doppio orologio Italia/locale (badge fonte GPS/Programma e indicatore cambio data +/-1g su mezzanotte e linea internazionale del cambio di data verso Auckland), auto-focus su giorno e card attiva senza salti durante la navigazione manuale o prima della partenza.

## 1.7.24 — 2026-11-25

- LIVE offline: coda locale persistente per messaggi, commenti foto e risposte di Owner e Copiloti con stato «In attesa di invio», annullamento e invio automatico alla riconnessione.

## 1.7.23 — 2026-11-25

- LIVE: pulsante Rispondi stile WhatsApp sotto messaggi e commenti foto (anche senza account), moderazione Owner/Copilota e notifiche Push raggruppate con apertura diretta del contenuto.

## 1.7.22 — 2026-11-25

- Fix P0 LIVE: eliminato il loop infinito di sottoscrizione ai commenti foto nella lightbox che saturava il rate-limit IP (429) bloccando commenti e caricamento foto.

## 1.7.21 — 2026-11-25

- LIVE: commenti alle singole foto senza account, salvati su Cloudflare D1, con lettura condivisa e moderazione riservata agli organizzatori.

## 1.7.20 — 2026-11-25

- LIVE ospiti: messaggi senza account, salvati su Cloudflare D1, condivisi tra dispositivi, con antispam e moderazione Owner/Copilota.

## 1.7.19 — 2026-11-25

- LIVE: conserva e mostra l'ultima posizione GPS autorizzata sulla mappa, anche su altri dispositivi e dopo perdita del segnale.
- Diagnostica sicura dei problemi di salvataggio messaggi, commenti e reazioni sul backend.

## 1.7.18 — 2026-11-25

- Fix P0 LIVE: stato temporale pre-partenza indipendente da GPS anche per ospiti esterni e preflight CORS Worker su reazioni, messaggi e commenti.

## 1.7.17 — 2026-11-25

- Rifinitura LIVE mobile: intestazione compatta, orologio non duplicato, icone Lucide, stato vuoto mappa e safe-area Safari.

## 1.7.16 — 2026-11-25

- Restyling boarding pass TrasportoCard, reazioni LIVE persistenti e messaggi ospiti protetti.

## 1.7.15 — 2026-11-24

- Card Trasporti: mini-timeline compatta Partenza e Arrivo con orari locali allineati e +1g.

## 1.7.14 — 2026-11-24

- Card Trasporti: badge orizzontale compatto Posto con icona Armchair e troncamento su una riga.

## 1.7.13 — 2026-11-24

- Uniformati pulsanti Aggiorna/Annulla/Elimina nei form card con conferma esplicita e corretto layout orario Modifica Tappa.

## 1.7.12 — 2026-11-24

- Card Trasporti: indicatore Check-in da fare spostato nel body accanto all'operatore con icona e testo compatto.

## 1.7.11 — 2026-11-24

- Notifiche Push puntuali al minuto (cron */1 * * * * compatibile con piano Free e indice D1 due_at).
- Payload descrittivi con categoria, titolo reale, ora locale HH:MM e luogo breve, sanitizzati lato client e Worker con fallback legacy.

## 1.7.10 — 2026-11-23

- Push multi-fuso: associazione automatica imbarco→aeroporto di partenza del volo e checkout→località dell'alloggio collegato.
- Preservato orario locale su tappe del 09/01 (Taipei e Cebu) senza eccezioni per ID e senza inventare fusi su casi ambigui.

## 1.7.9 — 2026-11-23

- Push Destinazione Prima: risoluzione fusi automatica multi-fonte (tappe, trasporti, alloggi) con blocco fallback su giorni multi-fuso o esteri futuri.
- Corretti TAO 03/01 (Asia/Manila), Imbarco Taipei 09/01 (Asia/Taipei) e prevenzione falsi positivi IATA di destinazione.

## 1.7.8 — 2026-11-23

- Fusi orari automatici per promemoria Push: priorità card/luogo/tappa e fallback fuso dispositivo registrato in diagnostica.
- Rilevamento cambio fuso dispositivo e recupero limitato (max 2, deduplicato) per soli eventi futuri.

## 1.7.7 — 2026-11-23

- Diagnostica Push iPhone: storico ultime 10 mutazioni, evidenza dedicata all'ultima Attività e conferma D1 esplicita.
- Pulsante Copia diagnostica senza dati personali né credenziali.
