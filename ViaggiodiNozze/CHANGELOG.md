# Cronologia aggiornamenti HOUNIGO

Questo file contiene esclusivamente versioni di cui è verificabile la pubblicazione. Le release preparate ma non ancora pubblicate restano fuori dalla cronologia visibile nell’app.

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
