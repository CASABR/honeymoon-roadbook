# Revisione finale del dry-run 0000

## Decisione sintetica

Nessuna modifica reale è stata applicata. Il piano contiene 24 operazioni di rimozione: 18 risultano nette ed eseguibili, le 5 editoriali sono ora esplicitamente sospese e `trasporti/trn_03_volo_ca783` resta bloccata. Le 10 aggiunte candidate non duplicano record esistenti; 8 restano eseguibili perché le migrazioni `tappa_21` e `tappa_52` seguono il relativo hold editoriale. Le cinque riconciliazioni economiche sono solo preparate e non eseguono conversioni o spunte automatiche.

Riferimenti completi: `patch-plan.json`, `generated/proposed-diff.json`, `generated/final-review.json`, `generated/application-manifest.json`, `application-plan.md` e `generated/record-inventory-before.csv`.

## 1. Le 24 operazioni di rimozione

Le sette righe marcate **migrazione** non eliminano il contenuto logico: tombstonano la vecchia collezione `tappe` e ricreano lo stesso ID in `attivita`. Nessun record sotto elencato è collegato direttamente a `spese` o `documenti`; gli eventuali `locks/<id>` sono lock tecnici transitori, non prenotazioni.

| # | ID | Titolo | Data | Motivo e destinazione | Prenotazioni/spese/documenti | Valutazione |
|---:|---|---|---|---|---|---|
| 1 | `trasporti/trn_03_volo_ca783` | Air China CA783 | 01/12 | duplicato di `transport_flight_pek_akl` | e-ticket ***REMOVED***/71; nessuna spesa/doc diretta | **BLOCCATA**: confermare data e orari prima della fusione |
| 2 | `attivita/att_38` | TAO El Nido→Coron | 03/01 | duplicato di `trn_14_tao_expedition` | costo 0; nessun allegato; lock tecnico | netta, costo già sul trasporto |
| 3 | `attivita/act_026` | Ferry Wharf 3→Manly | 27/12 | duplicato di `trn_14_sydney_ferry` | nessun allegato/spesa; nota contactless trasferita al trasporto | netta dopo preservazione nota |
| 4 | `attivita/att_22` | Hanson Bay Wildlife Sanctuary | 17/12 | escluso definitivamente | nessun collegamento | netta |
| 5 | `tappe/tappa_46` | Hanson Bay & Baudin Beach | 17/12 | escluso definitivamente | nessun collegamento | netta |
| 6 | `tappe/tappa_08` | Marokopa Falls | 02/12 | rimosso dalla giornata | nessun collegamento | netta |
| 7 | `tappe/tappa_02_rotorua` | Rotorua Terme & Geyser | 03/12 | mock legacy generico | nessun collegamento | **BLOCCATA**: non eliminare ora; verificare valore editoriale |
| 8 | `tappe/tappa_03_tekapo` | Lago Tekapo & Good Shepherd | 08/12 | data errata; resta `tappa_37` il 13/12 | nessun collegamento; coordinate/nota trasferibili | **BLOCCATA**: non eliminare ora; verificare sostituzione completa |
| 9 | `tappe/tappa_04_queenstown` | Queenstown & Fiordland | 11/12 | mock legacy generico | nessun collegamento | **BLOCCATA**: non eliminare ora; verificare valore editoriale |
| 10 | `shopping/fuel_g11` | Allied Te Anau | 08/12 | duplicato/data errata; resta `shop_04` | nessuna spesa/doc; indirizzo/nota trasferiti; lock tecnico | netta |
| 11 | `shopping/shop_001` | Allied Te Anau | 11/12 | duplicato; resta `shop_04` | nessuna spesa/doc; lock tecnico | netta |
| 12 | `shopping/shop_002` | Christchurch fuel | 15/12 | duplicato; resta `fuel_g15_1` | nessuna spesa/doc; istruzione restituzione preservata | netta |
| 13 | `shopping/fuel_g15_2` | OTR Yankalilla | 12/12 | sosta australiana copiata in NZ | nessun collegamento; lock tecnico | netta |
| 14 | `shopping/fuel_g17` | EG Ampol Richmond | 14/12 | duplicato/data errata; resta `shop_06` | nessun collegamento | netta |
| 15 | `shopping/shop_003` | EG Ampol Richmond | 17/12 | duplicato; resta `shop_06` | nessun collegamento | netta |
| 16 | `shopping/fuel_g28` | Budget Petrol Mascot | 25/12 | duplicato/data errata; resta `shop_005` | nessun collegamento | netta; record canonico resta bloccato dal voucher Travellers |
| 17 | `shopping/shop_004` | Ampol Batemans Bay | 23/12 | duplicato senza data canonica; resta `shop_08` | nessun collegamento | netta |
| 18 | `tappe/tappa_10` | Ruakuri Bushwalk | 02/12 | **migrazione** a `attivita/tappa_10` | stesso ID, nessun link esterno; lock tecnico | netta |
| 19 | `tappe/tappa_15` | Tawhai Falls | 04/12 | **migrazione** a `attivita/tappa_15` | stesso ID, nessun link esterno | netta |
| 20 | `tappe/tappa_21` | Kaikōura Peninsula Walkway | 07/12 | **migrazione** a spot Point Kean 20 min | stesso ID; nota walkway preservabile | **BLOCCATA**: non migrare ora; riduzione di ambito da verificare |
| 21 | `tappe/tappa_24` | Hokitika Beach/sign | 08/12 | **migrazione** a spot Hokitika waterfront | stesso ID, nessun link esterno | netta |
| 22 | `tappe/tappa_26` | Knights Point Lookout | 10/12 | **migrazione** a spot Knights Point | stesso ID, nessun link esterno | netta |
| 23 | `tappe/tappa_52` | Split Point & Teddy’s Lookout | 18/12 | **migrazione** al solo Split Point | stesso ID, nessun link esterno | **BLOCCATA**: non migrare ora; esclusione di Teddy’s da verificare |
| 24 | `tappe/tappa_72` | Mrs Macquarie’s Chair | 26/12 | **migrazione** a spot fotografico | stesso ID, nessun link esterno | netta |

## 2. Le 10 aggiunte e il controllo collisioni

| ID destinazione | Tipo | Controllo su ID/data/luogo/contenuto | Esito |
|---|---|---|---|
| `trasporti/trn_16_ceb_tpe_ci706` | nuovo | nessun CI706 o CEB→TPE equivalente | non duplicato |
| `attivita/spot_lake_pukaki_20261213` | nuovo | `tappa_37` è Lake Tekapo; il ristorante a Pukaki non è uno spot | non duplicato |
| `attivita/spot_werri_beach_20261224` | nuovo | alloggio Werri e Chinamans Beach hanno funzioni/luoghi diversi | non duplicato |
| `attivita/tappa_10` | migrazione | sorgente unica `tappe/tappa_10`, eliminata nello stesso piano | 1:1, non duplicato |
| `attivita/tappa_15` | migrazione | sorgente unica `tappe/tappa_15` | 1:1, non duplicato |
| `attivita/tappa_21` | migrazione | sorgente unica `tappe/tappa_21` | non duplicato, ma migrazione sospesa |
| `attivita/tappa_24` | migrazione | sorgente unica `tappe/tappa_24` | 1:1, non duplicato |
| `attivita/tappa_26` | migrazione | sorgente unica `tappe/tappa_26` | 1:1, non duplicato |
| `attivita/tappa_52` | migrazione | sorgente unica `tappe/tappa_52` | non duplicato, ma migrazione sospesa |
| `attivita/tappa_72` | migrazione | sorgente unica `tappe/tappa_72` | 1:1, non duplicato |

Il record shuttle Tongariro non rientra nelle 10 aggiunte: resta bloccato perché l'ID originale è tombstonato e il pagamento NZD richiede applicazione controllata.

## 3. Perché 926 copie ma 460 record logici

| Componente | Copie/documenti | Natura |
|---|---:|---|
| 353 record condivisi presenti sia in IndexedDB sia in Firestore | 706 | repliche legittime offline/cloud, non duplicati |
| cache `routes` solo IndexedDB | 88 | cache locale legittima, non sincronizzata |
| `members` 9 + `devices` 13 + `locks` 85 solo Firestore | 107 | metadati cloud legittimi |
| chunk allegati Firestore | 19 | frammenti fisici di 4 allegati, non record logici aggiuntivi |
| documento root viaggio + LIVE root + 4 LIVE updates | 6 | documenti cloud fuori dalle collezioni logiche |
| **Totale confrontato** | **926** | 441 locali + 485 cloud |

I 460 record logici cloud sono 353 record replicati più 107 metadati cloud. I duplicati reali sono gruppi di contenuto all'interno di questi record logici, non l'esistenza delle due repliche IndexedDB/Firestore.

## 4. Test tombstone: da 25/26 a 26/26

Il fallimento era nel test statico `addRistorante`: il test ritagliava arbitrariamente 1.100 caratteri dal metodo e interrompeva il testo prima di `idbPut`, ottenendo indice `-1`. La prova runtime sullo stesso metodo già dimostrava che una tombstone blocca il salvataggio. Il test ora estrae l'intero metodo fino al successivo `async`, verifica esplicitamente la presenza di `idbPut`/`notifyDataChanged` e mantiene il controllo d'ordine `validateSaveAgainstTombstone` → persistenza → notifica. Nessun sorgente runtime è stato modificato.

## 5. Cinque riconciliazioni multivaluta

| Pratica | Costo originale | Acconto/pagato | Saldo | Cauzione | Spunta | Stato piano |
|---|---:|---:|---:|---:|---|---|
| Shallow Inlet | 62,00 AUD | 0,00 AUD | 62,00 AUD | 50,00 AUD cash rimborsabili | no | preparata, non applicata |
| Werri #***REMOVED*** | 78,00 AUD | 0,00 AUD dimostrati | 78,00 AUD | 0 | no | preparata, non applicata |
| TAO | 1.500,00 USD | 1.500,00 USD | 0 | 0 | sì, prova email | preparata, non applicata |
| SeaLink #***REMOVED*** | 655,49 AUD | 655,49 AUD | 0 | 0 | sì, prova email | una sola spesa su andata; ritorno incluso |
| Tongariro shuttle | 147,30 NZD | 147,30 NZD | 0 | 0 | sì, prova email | preparata; ID tombstonato |

`cost`, `depositPaid`, `remaining`, `securityDeposit` e valuta restano distinti nel piano. Nessuna conversione è eseguita. L'app non è ancora sicura per applicarli ad alloggi/trasporti: tipi e riepiloghi assumono EUR; quindi tutte le riconciliazioni hanno `apply:false`.

## 6. Corrispondenza fra viste

| Vista | Verifica | Esito/rischio |
|---|---|---|
| Copilota/Oggi | legge le collezioni canoniche e `noteCopilota` | passa per date, orari e note |
| Prenotazioni | `getAllUnifiedBookings()` legge trasporti, alloggi e attività, deduplica per ID | passa; pagamenti multivaluta restano bloccati |
| Alloggi | legge direttamente `alloggi`; nome/luogo/ref Werri propagano | passa |
| Spese | legge le stesse entità tramite `resolvePaymentInfo` | **non sicuro multivaluta**: visualizza EUR e può inferire pagato da `completato` |
| Mappa | legge tappe, alloggi e attività | 7 coordinate puntuali verificate; Lake Pukaki, Ruakuri e Hokitika restano address-only perché non identificano un punto univoco |
| PDF | legge attività, trasporti, alloggi e tappe dallo storage | include indirizzi, orari, riferimenti, logistica, `noteCopilota` e metriche trekking; non legge né esporta dati LIVE |

Il dry-run è coerente a livello di source collection e ID. Il limite PDF è risolto; le tre coordinate non univoche restano dichiarate e la multivaluta rimane esclusa dall'applicazione.

## 7. Blocchi obbligatori

1. Travellers Autobarn: restituzione 28/12 mattina contro voucher precedente 29/12 15:00; blocca noleggio, fuel e sequenza aeroporto.
2. CI75: arrivo FCO 07:05 contro 07:15; nessun valore scelto silenziosamente.
3. CA783: data operativa e orari completi da confermare; aggiornamento canonico e rimozione duplicato sono entrambi bloccati.

## 8. Decisioni che meritano approvazione umana

- Approvare le 18 rimozioni nette e le relative tombstone.
- Mantenere sospese le cinque rimozioni editoriali: `tappa_02_rotorua`, `tappa_03_tekapo`, `tappa_04_queenstown`, `tappa_21`, `tappa_52`.
- Non approvare CA783, Travellers, CI75 o i cinque pagamenti come scritture automatiche.
- Accettare i tre punti address-only oppure fornire un accesso/spot univoco; usare `application-plan.md` e rigenerare il manifest da un backup fresco prima di qualsiasi scrittura.

## 9. Ultima rigenerazione e validazione

- Dry-run: 460 record logici prima, 450 dopo; 79 record aggiornati, 18 rimossi, 8 aggiunti e 18 tombstone nel diff eseguibile.
- Anti-duplicati: tutte le 10 aggiunte candidate ricontrollate, zero collisioni; le due migrazioni editoriali sospese non entrano nel manifest.
- Coordinate: 7 punti verificati; Lake Pukaki, Ruakuri e Hokitika restano con indirizzo descrittivo e limite esplicito.
- Piano recuperabile: 97 operazioni dati + 18 tombstone, 115 scritture massime in una sola transazione; rollback subordinato agli hash post-applicazione.
- Test: tombstone/sync 26/26, export PDF 15/15, `npm run build` superato. Nessuna scrittura reale, push o deploy.
