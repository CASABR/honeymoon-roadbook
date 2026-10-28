# A/C/D — Diff, deduplica e blocchi

## A. Diff completo prima → dopo

Il diff machine-readable completo è `generated/proposed-diff.json`: contiene, per ogni record, collezione, ID, azione, fonte, campi modificati e immagini `before`/`after`. `patch-plan.json` è il piano idempotente sorgente; `generated/record-inventory-before.csv` inventaria tutti i 460 record logici iniziali.

| Ambito | Prima | Dopo proposto | Fonte |
|---|---|---|---|
| Stato alloggi/trasporti futuri | `completato`, interpretato anche come pagato | `prenotato`, pagamento separato | Modello corrente + mandato |
| CA783 | due record `transport_flight_pek_akl` e `trn_03_volo_ca783` | un solo record, ID storico `transport_flight_pek_akl` | record più antico + mandato |
| TAO 3/1 | trasporto `trn_14_tao_expedition` + attività `att_38` | solo trasporto originale | mandato |
| Ferry Sydney | trasporto `trn_14_sydney_ferry` + attività `act_026` | solo trasporto originale | contenuto e data |
| Shallow Inlet | `alloggio_21` indica Seaspray | stesso ID, Shallow Inlet/Yanakie | email 28/10 + mandato |
| Werri Beach | `alloggio_25` senza riferimento strutturato | stesso ID, ref. `***REMOVED***` e note sicurezza | email + mandato |
| Snap Rentals | ritiro 08:30 | 02/12 10:00, riferimenti preservati | prenotazione #742210189 |
| ***REMOVED*** | 16:55–18:10 | 16:20–17:35 | schedule change più recente |
| CI706 | assente | `trn_16_ceb_tpe_ci706`, 12:10–14:55 | mandato |
| Trekking | campi parziali/in note | campi strutturati su 11 percorsi | fonti ufficiali + mandato |
| Spot foto | tappe generiche | sottocategoria dedicata, brevi e opzionali | mandato |
| Rifornimenti | 8 duplicati/date errate | record canonici unici | ID, data, luogo e contenuto |

## C. Eliminazioni e dedupliche proposte

Ogni rimozione richiede una tombstone `tombstone_<collezione>_<id>` sincronizzata prima dei dati operativi.

| Collezione/ID | Esito | Motivo / dati preservati |
|---|---|---|
| `trasporti/trn_03_volo_ca783` | elimina | dati utili assorbiti in `transport_flight_pek_akl` |
| `attivita/att_38` | elimina | duplicato fisico TAO; resta `trn_14_tao_expedition` |
| `attivita/act_026` | elimina | duplicato ferry Manly; resta `trn_14_sydney_ferry` |
| `attivita/att_22`, `tappe/tappa_46` | elimina | Hanson Bay escluso definitivamente |
| `tappe/tappa_08` | elimina | Marokopa Falls rimossa dal 02/12 |
| `tappe/tappa_02_rotorua` | elimina | mock legacy senza dati unici |
| `tappe/tappa_03_tekapo` | elimina | versione obsoleta; resta `tappa_37` |
| `tappe/tappa_04_queenstown` | elimina | mock generico senza dati unici |
| `shopping/fuel_g11`, `shopping/shop_001` | elimina | duplicati Allied; resta `shop_04` |
| `shopping/shop_002` | elimina | duplicato Christchurch; resta `fuel_g15_1` |
| `shopping/fuel_g15_2` | elimina | sosta australiana copiata nella NZ |
| `shopping/fuel_g17`, `shopping/shop_003` | elimina | duplicati Richmond; resta `shop_06` |
| `shopping/fuel_g28` | elimina | duplicato Mascot; resta `shop_005` |
| `shopping/shop_004` | elimina | duplicato Batemans Bay; resta `shop_08` |
| 7 record `tappe` | migra | stesso ID in `attivita`, tombstone sulla vecchia collezione |

Le migrazioni riguardano `tappa_10`, `tappa_15`, `tappa_21`, `tappa_24`, `tappa_26`, `tappa_52`, `tappa_72`. Il record Orvieto senza data non viene eliminato: contiene informazione unica e richiede decisione del proprietario.

## D. Informazioni ancora da verificare

1. Voucher Travellers Autobarn: restituzione 29/12 15:00 contro volo da Sydney il 28/12 12:15; blocca `tappa_75`, `shop_005` e modifica del noleggio.
2. CI75: arrivo FCO 10/1 alle 07:15 nel documento Amex contro 07:05 nel riepilogo proprietario.
3. Gestione economica: il riepilogo converte/legge i costi come EUR e usa anche `status=completato` come pagato; AUD/NZD/USD non sono riconciliabili in sicurezza.
4. National Park Shuttles: il record originale `trn_06_tongariro_shuttle` è tombstonato; il ripristino richiede rimozione controllata della tombstone e nuovo `updatedAt`.
5. Prove dei pagamenti dei campeggi dichiarati saldati: non cambiare spunte senza voucher/ricevuta del singolo record.
