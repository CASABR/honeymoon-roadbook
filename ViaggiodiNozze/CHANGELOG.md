# Cronologia aggiornamenti HOUNIGO

Questo file contiene esclusivamente versioni di cui è verificabile la pubblicazione. Le release preparate ma non ancora pubblicate restano fuori dalla cronologia visibile nell’app.

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

## 1.7.6 — 2026-11-23

- Push Sync: programmazione idempotente garantita anche dopo syncAllLocalToCloud e flushPendingPushes senza loop.
- Fuso orario risolto anche dalla tappa del giorno senza sovrascrivere fusi esteri; diagnostica a 4 fasi in Notifiche.

## 1.7.5 — 2026-11-23

- Notifiche Push: pannello Diagnostica Push su iPhone con stato Auth/Sync, ultima mutazione, motivo esclusione e preferenza effettiva.
- Tracciamento locale non-PII anche su uscite anticipate auth/permessi senza credenziali esposte.

## 1.7.4 — 2026-11-23

- Push: diagnostica non-PII client/Worker, protezione job oltre 200 elementi e chiarezza preferenze 15/60 min sulle card.
- Scadenze: fuso dispositivo applicato solo se assente un fuso di destinazione verificato.

## 1.7.3 — 2026-11-23

- Promemoria Push: priorità al campo data aggiornato rispetto a date legacy su tappe, ristoranti e shopping.
- Test di regressione esteso alla modifica di card esistenti a +65 min senza duplicazione dei job.
