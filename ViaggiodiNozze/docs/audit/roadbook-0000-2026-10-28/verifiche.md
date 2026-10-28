# E–M — Verifiche operative

## E. Sovrapposizioni

- Nessuna sovrapposizione certa resta nelle correzioni pronte: Tongariro è isolato; Kaikōura dinner è spostata a pranzo; Marlo è spostato a pranzo; Hanson Bay è rimosso.
- 30/11 Mutianyu resta subordinato ai tempi reali d'ingresso e al rientro anticipato per CA783; è proposto, non prenotato.
- 19/12 Twelve Apostles resta proposto finché manca slot/QR.
- **Blocco:** il 28/12 non è validabile senza voucher Travellers compatibile con il volo 12:15.

## F. Geografia e guida

- Rimossi Marokopa/Mangapohue dal 02/12, Allied Te Anau dal giorno errato, fuel Christchurch/Waitomo e Hanson Bay.
- Shopping Auckland passa alle 08:00 prima del ritiro Snap; può essere saltato senza impatto.
- Seaspray viene corretto nello stesso `alloggio_21` in Shallow Inlet, Yanakie; questo riallinea pernottamento e rotta del 20–21/12.
- Marlo diventa pranzo opzionale; niente guida serale imposta. Gli spot sono lungo rotta, 10–20 minuti e sacrificabili.
- Le 88 `routes` sono cache IndexedDB: dopo applicazione vanno invalidate/rigenerate, non sincronizzate come record Firestore.

## G. Voli, ferry, noleggi e check-in/out

| Elemento | Esito |
|---|---|
| CA783 | un solo record; partenza 01/12 00:25; arrivo 17:25/17:34 da verificare |
| Snap #742210189 | 02/12 10:00 → 15/12 entro 12:00; corretto |
| Bluebridge #1135407 | 06/12 13:30; preservato |
| NZ261 | 15/12 15:25–17:35; preservato |
| Bargain | unico noleggio 15–17/12; pickup dopo bagagli via shuttle |
| SeaLink #***REMOVED*** | 16/12 07:40 e 17/12 12:20; orari coerenti, pagamento bloccato dal modello valuta |
| Travellers ***REMOVED*** | **bloccante:** 29/12 15:00 vs necessità 28/12 mattina |
| ***REMOVED*** | corretto a 08/01 16:20–17:35 |
| CI706 | aggiunta proposta 09/01 12:10–14:55 |
| CI75 | partenza 23:25 preservata; arrivo 07:05/07:15 non risolto |

## H. Prenotato, proposto, opzionale

- Gli alloggi e i trasporti futuri non saranno più `completato`: stato prenotazione e pagamento restano separati.
- Mutianyu, Polynesian Spa, stargazing, Twelve Apostles senza QR e tutti gli spot fotografici sono `da_valutare`/opzionali.
- Museo del Novecento è `non_bloccato` finché manca prova di biglietto.
- Attività con voucher/orario vincolante restano `prenotato`; attività libere mantengono `libero`.

## I. Trekking strutturati

| ID | Percorso | Distanza/tipo | Durata/difficoltà | Accesso, navetta e piano B |
|---|---|---|---|---|
| `att_10` | Tongariro | 20,2 km one-way | 7–8 h, impegnativo | Ketetahi shuttle 07:00, presenza 06:45; GO/NO-GO meteo; piano B riposo/trasferimento |
| `tappa_10` | Ruakuri | 1 km loop | 45 min, facile | Waitomo; nessuna navetta; saltabile |
| `tappa_15` | Tawhai Falls | 0,8 km A/R | 15–20 min, facile | parcheggio DOC; nessuna navetta; saltabile |
| `att_15` | Minnehaha | 1,2 km loop | 20 min, facile | Fox Glacier; buio/pioggia: saltare |
| `att_16` | Lake Matheson Jetty | 2,4 km A/R | 45 min, facile | Jetty viewpoint; circuito 4,4 km/1h30 solo alternativa |
| `att_12` | Hokitika Gorge | 1,6 km loop | circa 1h30, facile | distinguere lookout breve; pioggia/piene: solo tratto sicuro |
| `att_23` | Maits Rest | 0,8 km loop | circa 30 min, facile | parcheggio dedicato; saltabile |
| `att_26` | Mount Oberon | 6,8 km A/R | 2 h, Grade 4 | Telegraph Saddle, verificare shuttle/chiusure; piano B Tidal River |
| `att_27` | Prom Wildlife Walk | 2,3 km loop | 45 min, Grade 2 | parcheggio dedicato; caldo/fauna: accorciare |
| `att_30` | Wentworth Falls | 1,4 km A/R | 45–60 min, Grade 3 | circa 200 gradini; meteo/chiusure: lookout |

Coordinate/dislivelli non confermati non sono inventati. Fonti: DOC NZ, Parks Victoria, NSW National Parks e Great Ocean Road Coast and Parks Authority, consultate il 28/10/2026.

## J. Alert pratici, in priorità

1. Travellers: ottenere voucher definitivo di restituzione; senza conferma il 28/12 è incompatibile.
2. Twelve Apostles: prenotare slot 19/12 quando apre e conservare QR; verificare Gibson Steps/Loch Ard 24–48 h prima.
3. Tongariro: GO/NO-GO meteo e avvisi DOC la mattina; presentarsi 06:45.
4. CI75: confermare arrivo FCO 07:05 o 07:15; ricontrollare tutti i voli/aeroporti.
5. Wilsons Prom: verificare Telegraph Saddle, shuttle, chiusure e incendi.
6. Fox/Franz Josef: verificare meteo, accessi e stato Heli-Hike.
7. Filippine: compilare eTravel solo sul portale ufficiale nelle 72 ore richieste.
8. Cina: verificare requisiti ingresso/transito e margine CA783.
9. Shallow Inlet: telefonare vicino al 20/12 per ETA; 50 AUD cash bond separato.
10. Werri Beach: saldare 78 AUD tramite canale verificato; ignorare link WhatsApp.

## K. Pagamenti

| Record/pratica | Totale | Pagato | Residuo | Cauzione | Spunta proposta | Fonte/esito |
|---|---:|---:|---:|---:|---|---|
| `alloggio_21` Shallow Inlet | 62 AUD | 0 | 62 AUD | 50 AUD cash rimborsabili | no | mandato; struttura bloccata da multivaluta |
| `alloggio_25` Werri #***REMOVED*** | 78 AUD | 0 verificato | 78 AUD | — | no | email/mandato; valore corrente 48 è errato |
| `trn_14_tao_expedition` | 1.500 USD | 1.500 USD | 0 | — | sì | email pagamento ricevuto; valore EUR corrente non sostituibile in sicurezza |
| SeaLink #***REMOVED***, due tratte | 655,49 AUD | 655,49 AUD | 0 | — | sì, una sola pratica | email; evitare doppio conteggio |
| `trn_06_tongariro_shuttle` | 147,30 NZD | 147,30 NZD | 0 | — | sì | email; record originale tombstonato |
| Snap Rentals | da voucher | 319 nel record, valuta non strutturata | da verificare | da verificare | no | riconciliare voucher noleggio |
| Bargain Car | 84,51 EUR | non verificato | da verificare | da verificare | no | mandato; noleggio separato dai campeggi |
| Travellers Autobarn | da voucher | 511 AUD nel record | da verificare | da verificare | no | voucher finale richiesto |

Pagamenti corretti realmente: **0**. Le cinque riconciliazioni confermate sopra restano preparate, non applicate. Gli altri alloggi dichiarati saldati non ricevono nuove spunte senza prova del singolo record.

## L. Sincronizzazione e viste

- Oggi, Categorie, ricerca, Mappa, Copilota e PDF leggono le stesse collezioni operative; aggiornare il record originale mantiene i riferimenti.
- LIVE non riceve importi, voucher o documenti; nessuna pubblicazione è prevista dal piano.
- Tombstone e `settings` devono sincronizzarsi prima delle eliminazioni. Il test deve includere un dispositivo con cache offline precedente.
- Rischio noto: alcuni cleanup legacy in `ensureRefuels()` usano cancellazione IndexedDB senza tombstone. Il piano non deve usare quel percorso.
- Dopo applicazione servono rilettura Firestore, profilo IndexedDB pulito, profilo offline riaperto e nuovo export PDF; queste verifiche non possono essere dichiarate superate nel dry-run.

## M. Backup e rollback

1. Backup privato: `private/local-before.json` e `private/cloud-before.json`; hash SHA-256 in `generated/dry-run-summary.json`.
2. Prima dell'applicazione: fermare modifiche da altri dispositivi, completare un pull, verificare gli hash e applicare solo operazioni approvate con i servizi autenticati.
3. Per ogni delete: creare prima la tombstone condivisa, poi eliminare il record; per ogni update mantenere ID e aumentare `updatedAt`.
4. Verifica: rileggere Firestore e un IndexedDB pulito; poi riaprire una cache offline e accertare che i record eliminati non riappaiano.
5. Rollback: ripristinare le pre-image con timestamp nuovo, eliminare gli add con tombstone e rimuovere in modo coordinato le tombstone delle entità ripristinate.

**Limite bloccante:** il rollback non è atomico e l'export UI omette `settings`; senza finestra controllata e test su più dispositivi non è garantibile. Per questo nessuna modifica reale è stata applicata.

## Validazione del pacchetto

- Dry-run: superato; 460 record logici inventariati, 110 differenze simulate, nessuna scrittura e ID unici.
- Persistenza/sync: 6/6 test superati.
- Suite tombstone/multi-device: 26/26. Il matcher statico ora estrae l'intero metodo invece di troncare `addRistorante` a 1.100 caratteri; runtime applicativo invariato.
- `npm run build`: superato; PWA e Service Worker generati. Restano soltanto warning noti su chunk e import misti.
- `git diff --check`: superato; snapshot privati ignorati; nessuna chiave privata, refresh token, client secret o API key negli output tracciabili.
