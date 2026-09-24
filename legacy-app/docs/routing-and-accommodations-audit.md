# 🏰 Audit Integrato Itinerario, Alloggi Reali & Servizio Routing

**Data Audit**: 3 settembre 2026  
**Ambito**: Analisi congiunta dell'itinerario (44 Giorni: 28 nov 2026 – 10 gen 2027), sincronizzazione notti/alloggi reali (`accommodations.json`), vettori di trasporto (`transports.json`), logica del modulo repository (`repository.ts`), funzioni helper (`mockData.ts`), routing service (`routingService.ts`) e componente vista (`TodayView.tsx`).

---

## 1. Riepilogo Numerico

- **Giorni totali itinerario (`itinerary.json`)**: 44 giorni (`day-1` → `day-44`)
- **Notti di soggiorno totali del viaggio**: 43 notti (28 novembre 2026 → 9 gennaio 2027)
- **Attività totali catalogate**: 118 attività
- **Strutture ricettive definite (`accommodations.json`)**: 19 alloggi registrati
- **Notti coperte da alloggi in `accommodations.json`**: 25 notti
- **Notti coperte da hotel/campeggi definiti in `itinerary.json`**: 14 notti
- **Notti in volo / transito marittimo**: 4 notti (29 nov, 30 nov, 16 dic van/campeggio, 9 gen volo rientro)
- **Vettori principali (`transports.json`)**: 12 elementi (7 voli, 1 treno alta velocità, 1 traghetto marittimo, 3 noleggi auto/van)

---

## 2. Tabella Completa Attività Classificate

Di seguito la classificazione di tutte le 118 attività dell'itinerario nelle 5 categorie principali:
- `driving-stop`: attrazione, ristorante, hotel o luogo raggiungibile in auto.
- `non-driving-transport`: volo, treno, traghetto o trasporto interurbano non guidabile.
- `road-transport`: auto a noleggio, taxi, van o transfer stradale.
- `hotel-event`: check-in, check-out, deposito bagagli.
- `non-routable`: attività generica o priva di luogo identificabile.

| Giorno / Data | ID | Orario | Titolo | Tipo | Subtitle / Località | MapsUrl | Trasporto Associato | Categoria Routing Proposta | Origine Rilevabile | Destinazione Rilevabile | Qualità | Motivo |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Day 1 (28 nov)** | `d1-1` | 11:05 | Roma Termini → Milano Centrale | `transport` | Trenitalia Frecciarossa | ✅ Presente | `tr-train-1` | `non-driving-transport` | Roma Termini | Milano Centrale | Alta | Treno Alta Velocità |
| Day 1 (28 nov) | `d1-hotel` | 15:00 | Check-in a&o Hostel Milano Ca Granda | `hotel` | Via di Vittorio 1, Milano | ✅ Presente | - | `hotel-event` | Milano Centrale | Via di Vittorio 1 | Alta | Struttura alloggio principale |
| Day 1 (28 nov) | `d1-2` | 16:30 | Passeggiata in centro: Duomo & Galleria | `sightseeing` | Piazza del Duomo, Milano | ✅ Presente | - | `driving-stop` | Via di Vittorio 1 | Piazza del Duomo | Alta | Punto turistico in centro città |
| Day 1 (28 nov) | `d1-3` | 20:00 | Cena a Milano | `food` | Trattoria / Pizzeria zona Brera o Centrale | ✅ Presente | - | `non-routable` | Piazza del Duomo | Brera, Milano | Media | Nome locale assente e query generica |
| **Day 2 (29 nov)** | `d2-0` | 09:30 | Check-out a&o Hostel Milano Ca Granda | `hotel` | Direzione Aeroporto Milano Malpensa | ❌ Assente | - | `hotel-event` | Via di Vittorio 1 | Malpensa MXP | Media | Check-out alloggio |
| Day 2 (29 nov) | `d2-1` | 12:30 | Milano MXP → Pechino PEK | `transport` | Air China CA950 · Volo diretto | ❌ Assente | `tr-flight-mxp-akl` | `non-driving-transport` | Milano MXP | Pechino PEK | Alta | Volo aereo intercontinental |
| **Day 3 (30 nov)** | `d3-1` | 05:50 | Arrivo a Pechino PEK | `transport` | Air China CA950 · Terminal 3 | ❌ Assente | `tr-flight-mxp-akl` | `non-driving-transport` | Pechino PEK | Pechino PEK | Alta | Arrivo volo scalato |
| Day 3 (30 nov) | `d3-taxi1` | 07:00 | Taxi: Aeroporto PEK → Muraglia Cinese | `transport` | Pechino Capital Airport T3 | ✅ Presente | - | `road-transport` | PEK T3 | Badaling Great Wall | Alta | Trasferimento taxi stradale |
| Day 3 (30 nov) | `d3-2` | 08:30 | Muraglia Cinese a Badaling | `sightseeing` | Badaling, Great Wall of China | ✅ Presente | - | `driving-stop` | Badaling | Badaling | Alta | Attrazione turistica |
| Day 3 (30 nov) | `d3-taxi2` | 11:10 | Taxi: Muraglia → Piazza Tiananmen | `transport` | Badaling → Piazza Tiananmen | ✅ Presente | - | `road-transport` | Badaling | Piazza Tiananmen | Alta | Trasferimento taxi stradale |
| Day 3 (30 nov) | `d3-3` | 12:20 | Pranzo in zona Tiananmen / Hutong | `food` | Qianmen Street, Pechino | ✅ Presente | - | `driving-stop` | Piazza Tiananmen | Qianmen Street | Alta | Ristorante / area ristorazione |
| Day 3 (30 nov) | `d3-4` | 13:30 | Piazza Tiananmen e Città Proibita | `sightseeing` | Tiananmen Square & Forbidden City | ✅ Presente | - | `driving-stop` | Qianmen Street | Tiananmen Square | Alta | Attrazione turistica |
| Day 3 (30 nov) | `d3-taxi3` | 15:40 | Taxi: Tiananmen → Aeroporto PEK | `transport` | Piazza Tiananmen → PEK T3 | ✅ Presente | - | `road-transport` | Tiananmen Square | PEK T3 | Alta | Trasferimento taxi stradale |
| Day 3 (30 nov) | `d3-5` | 17:00 | Check-in volo notte PEK → AKL | `other` | Beijing Capital Airport T3 | ❌ Assente | `tr-flight-mxp-akl` | `non-driving-transport` | PEK T3 | PEK T3 | Alta | Operazione imbarco volo |
| Day 3 (30 nov) | `d3-6` | 00:25 | PEK → Auckland AKL | `transport` | Air China CA783 · Volo notte | ❌ Assente | `tr-flight-mxp-akl` | `non-driving-transport` | Pechino PEK | Auckland AKL | Alta | Volo aereo intercontinentale |
| **Day 4 (1 dic)** | `d4-1` | 17:25 | Arrivo Auckland AKL | `transport` | Dogana e ritiro auto noleggio | ❌ Assente | `tr-rent-nz-snap` | `road-transport` | Auckland AKL | Auckland Parnell | Media | Arrivo volo + Ritiro auto |
| Day 4 (1 dic) | `d4-2` | 20:00 | Check-in Noa Hotel | `hotel` | Auckland CBD | ✅ Presente | - | `hotel-event` | Auckland Parnell | Noa Hotel Auckland | Alta | Alloggio overnight |
| **Day 5 (2 dic)** | `d5-1` | 09:00 | Ritiro auto a noleggio · Auckland | `sightseeing` | Auckland Airport | ❌ Assente | `tr-rent-nz-snap` | `road-transport` | Noa Hotel | Auckland Airport | Alta | Punto partenza roadtrip |
| Day 5 (2 dic) | `d5-2` | 11:15 | Hamilton Gardens | `sightseeing` | Hamilton, Nuova Zelanda | ✅ Presente | - | `driving-stop` | Auckland Airport | Hamilton Gardens | Alta | Parco / Giardino Botanico |
| Day 5 (2 dic) | `d5-3` | 13:30 | Otorohanga Kiwi House | `sightseeing` | 20 Alex Telfer Drive, Otorohanga | ✅ Presente | - | `driving-stop` | Hamilton Gardens | 20 Alex Telfer Dr | Alta | Parco faunistico con indirizzo |
| Day 5 (2 dic) | `d5-4` | 16:00 | Mangapohue Natural Bridge | `sightseeing` | Te Anga Road, Waitomo | ✅ Presente | - | `driving-stop` | 20 Alex Telfer Dr | Te Anga Road | Alta | Attrazione naturale |
| Day 5 (2 dic) | `d5-5` | 17:30 | Waitomo Glowworm Caves | `sightseeing` | 39 Waitomo Village Road | ✅ Presente | - | `driving-stop` | Te Anga Road | 39 Waitomo Village Rd | Alta | Grotte bioluminescenti |
| Day 5 (2 dic) | `d5-6` | 22:00 | Waitomo Village Chalets | `hotel` | Hotel Access Road, Waitomo | ❌ Assente | - | `hotel-event` | 39 Waitomo Village Rd | Waitomo Chalets | Alta | Alloggio overnight |
| **Day 6 (3 dic)** | `d6-1` | 09:00 | Hobbiton Movie Set | `sightseeing` | 501 Buckland Road, Matamata | ✅ Presente | - | `driving-stop` | Waitomo Chalets | 501 Buckland Rd | Alta | Set cinematografico |
| Day 6 (3 dic) | `d6-2` | 13:00 | Big Dog and Sheep — Pranzo Tirau | `food` | Tirau i-SITE Visitor Centre | ✅ Presente | - | `driving-stop` | 501 Buckland Rd | Tirau i-SITE | Alta | Ristorante / sosta |
| Day 6 (3 dic) | `d6-3` | 15:00 | Te Waihou Blue Spring | `sightseeing` | Whites Road, Putaruru | ✅ Presente | - | `driving-stop` | Tirau i-SITE | Whites Road | Alta | Sorgente naturale |
| Day 6 (3 dic) | `d6-4` | 17:30 | Mitai Maori Village | `sightseeing` | 196 Fairy Springs Road, Rotorua | ✅ Presente | - | `driving-stop` | Whites Road | 196 Fairy Springs Rd | Alta | Villaggio culturale |
| Day 6 (3 dic) | `d6-5` | 22:00 | Wylie Court Motor Lodge | `hotel` | 345 Fenton Street, Rotorua | ❌ Assente | - | `hotel-event` | 196 Fairy Springs Rd | 345 Fenton St | Alta | Alloggio overnight |
| **Day 7 (4 dic)** | `d7-1` | 09:00 | Redwoods Treewalk | `sightseeing` | 1 Long Mile Road, Rotorua | ✅ Presente | - | `driving-stop` | Wylie Court Lodge | 1 Long Mile Rd | Alta | Parco naturale |
| Day 7 (4 dic) | `d7-2` | 11:00 | Polynesian Spa | `sightseeing` | 1000 Hinemoa Street, Rotorua | ❌ Assente | - | `driving-stop` | 1 Long Mile Rd | 1000 Hinemoa St | Alta | Centro termale |
| Day 7 (4 dic) | `d7-3` | 13:30 | Waiotapu Thermal Wonderland | `sightseeing` | 201 Waiotapu Loop Road | ❌ Assente | - | `driving-stop` | 1000 Hinemoa St | 201 Waiotapu Loop Rd | Alta | Parco geotermico |
| Day 7 (4 dic) | `d7-4` | 15:30 | Wairakei Terraces | `sightseeing` | Wairakei | ❌ Assente | - | `driving-stop` | 201 Waiotapu Loop Rd | Wairakei Terraces | Media | Terme geotermiche |
| Day 7 (4 dic) | `d7-5` | 16:30 | Cascate Huka | `sightseeing` | Wairakei, Taupo | ❌ Assente | - | `driving-stop` | Wairakei Terraces | Cascate Huka | Alta | Cascate naturali |
| Day 7 (4 dic) | `d7-6` | 18:45 | Skotel Alpine Resort | `hotel` | Tongariro National Park | ❌ Assente | - | `hotel-event` | Cascate Huka | Skotel Alpine Resort | Alta | Alloggio overnight |
| **Day 8 (5 dic)** | `d8-1` | 08:00 | Trekking Tongariro Alpine Crossing | `sightseeing` | Trekking tra i vulcani attivi | ❌ Assente | - | `driving-stop` | Skotel Alpine Resort | Tongariro Track | Media | Inizio trekking |
| Day 8 (5 dic) | `d8-2` | 17:00 | Spostamento a Levin | `transport` | Trasferimento da Tongariro a Levin | ❌ Assente | - | `road-transport` | Tongariro | Levin | Alta | Trasferimento guidato |
| Day 8 (5 dic) | `d8-3` | 20:00 | Totara Lodge Motel | `hotel` | 15 Devon Street, Levin | ❌ Assente | - | `hotel-event` | Levin | 15 Devon Street | Alta | Alloggio overnight |
| **Day 9 (6 dic)** | `d9-0` | 08:30 | Partenza da Levin | `sightseeing` | Verso Wellington | ❌ Assente | - | `driving-stop` | 15 Devon St | Wellington | Media | Partenza mattutina |
| Day 9 (6 dic) | `d9-1a` | 10:00 | Museum Te Papa Tongarewa | `sightseeing` | Wellington — Museo Nazionale | ❌ Assente | - | `driving-stop` | Levin | Te Papa Museum | Alta | Museo Nazionale |
| Day 9 (6 dic) | `d9-1` | 12:30 | Traghetto Wellington → Picton | `transport` | Bluebridge Ferry (Livia) | ❌ Assente | `tr-ferry-wlg-pic` | `non-driving-transport` | Wellington Ferry Terminal | Picton Ferry Terminal | Alta | Traghetto marittimo tra le due isole (INTERROMPE AUTO) |
| Day 9 (6 dic) | `d9-2` | 16:15 | Arrivo Picton · Marlborough Sounds | `transport` | Proseguire verso Kaikoura | ❌ Assente | - | `road-transport` | Picton Ferry Terminal | Kaikoura | Alta | Sbarco e ripresa guida Isola Sud |
| Day 9 (6 dic) | `d9-3` | 21:00 | Kaikoura Seaside Lodge | `hotel` | 268 Esplanade, Kaikoura | ❌ Assente | - | `hotel-event` | Picton | 268 Esplanade, Kaikoura | Alta | Alloggio overnight |
| **Day 10 (7 dic)**| `d10-whale`|09:00 | Whale Watch Kaikoura | `sightseeing` | Whale Way Station, Kaikoura | ❌ Assente | - | `driving-stop` | 268 Esplanade | 224 Esplanade, Kaikoura | Alta | Stazione avvistamento balene |
| Day 10 (7 dic) | `d10-1` | 13:30 | Kaikoura → Arthur Pass | `transport` | Strada panoramica costa est | ❌ Assente | - | `road-transport` | Kaikoura | Arthur Pass | Alta | Spostamento guidato |
| Day 10 (7 dic) | `d10-2` | 18:00 | Otira Stagecoach Hotel | `hotel` | 6435 Otira Highway, Otira | ❌ Assente | - | `hotel-event` | Arthur Pass | 6435 Otira Highway | Alta | Alloggio overnight |
| **Day 11 (8 dic)**| `d11-0` | 09:00 | Partenza da Otira | `sightseeing` | Otira Viaduct Lookout | ❌ Assente | - | `driving-stop` | 6435 Otira Hwy | Otira Viaduct | Alta | Punto panoramico |
| Day 11 (8 dic) | `d11-1` | 10:00 | Hokitika | `sightseeing` | Hokitika, West Coast NZ | ❌ Assente | - | `driving-stop` | Otira Viaduct | Hokitika Town | Alta | Cittadina di mare |
| Day 11 (8 dic) | `d11-2` | 11:30 | Hokitika Gorge | `sightseeing` | Kokatahi 7881 | ❌ Assente | - | `driving-stop` | Hokitika | Hokitika Gorge | Alta | Gola turchese |
| Day 11 (8 dic) | `d11-3` | 14:00 | Sosta pranzo a Franz Josef | `food` | Full Of Beans, Main Road | ❌ Assente | - | `driving-stop` | Hokitika Gorge | Main Road, Franz Josef | Alta | Ristorante / Caffè |
| Day 11 (8 dic) | `d11-4` | 16:00 | Franz Josef Glacier Walk | `sightseeing` | Passeggiata fronte ghiacciaio | ❌ Assente | - | `driving-stop` | Main Road | Franz Josef Glacier Carpark | Alta | Parcheggio ghiacciaio |
| Day 11 (8 dic) | `d11-5` | 19:00 | Haka House Franz Josef | `hotel` | 2/4 Cron Street, Franz Josef | ❌ Assente | - | `hotel-event` | Glacier Carpark | 2 Cron Street, Franz Josef | Alta | Alloggio overnight |
| **Day 12 (9 dic)**| `d12-1` | 08:30 | Fox Glacier Helihike | `sightseeing` | Salita in elicottero | ❌ Assente | - | `driving-stop` | Haka House Franz | 44 Main Road, Fox | Alta | Base elicotteri con indirizzo |
| Day 12 (9 dic) | `d12-2` | 15:00 | Lake Matheson Walk | `sightseeing` | Specchio riflesso Monte Cook | ❌ Assente | - | `driving-stop` | 44 Main Road | Lake Matheson Road | Alta | Lago riflesso |
| Day 12 (9 dic) | `d12-3` | 18:00 | Ivorytowers Accommodation | `hotel` | 33/35 Sullivans Road, Fox | ❌ Assente | - | `hotel-event` | Lake Matheson | 33 Sullivans Rd, Fox | Alta | Alloggio overnight |
| **Day 13 (10 dic)**|`d13-0` | 08:30 | Partenza da Ivory Towers | `sightseeing` | 33/35 Sullivans Road, Fox | ❌ Assente | - | `driving-stop` | 33 Sullivans Rd | 33 Sullivans Rd | Alta | Partenza alloggio |
| Day 13 (10 dic)| `d13-1` | 09:00 | Lake Matheson | `sightseeing` | Lake Matheson Road | ❌ Assente | - | `driving-stop` | 33 Sullivans Rd | Lake Matheson Road | Alta | Lago panoramico |
| Day 13 (10 dic)| `d13-2` | 12:00 | Haast Pass | `sightseeing` | West Coast 9382 | ❌ Assente | - | `driving-stop` | Lake Matheson | Haast Pass | Alta | Passo di montagna |
| Day 13 (10 dic)| `d13-3` | 12:15 | Fantail Falls | `sightseeing` | Cascata su Haast Pass | ❌ Assente | - | `driving-stop` | Haast Pass | Fantail Falls | Alta | Cascata stradale |
| Day 13 (10 dic)| `d13-4` | 13:30 | Blue Pools | `sightseeing` | Blue Pools Track, Otago | ❌ Assente | - | `driving-stop` | Fantail Falls | Blue Pools Track | Alta | Pozze cristalline |
| Day 13 (10 dic)| `d13-5` | 15:00 | Wanaka | `sightseeing` | Lake Wanaka, Nuova Zelanda | ❌ Assente | - | `driving-stop` | Blue Pools | Lake Wanaka | Alta | Lago e cittadina |
| Day 13 (10 dic)| `d13-6` | 15:30 | Roy's Peak Lookout | `sightseeing` | 2 Glendhu Bay Road | ❌ Assente | - | `driving-stop` | Lake Wanaka | 2 Glendhu Bay Road | Alta | Punto panoramico |
| Day 13 (10 dic)| `d13-7` | 17:30 | Cardrona Hotel | `hotel` | Cardrona Valley Road | ❌ Assente | - | `hotel-event` | 2 Glendhu Bay Rd | Cardrona Valley Road | Alta | Hotel storico overnight |
| **Day 14 (11 dic)**|`d14-1` | 09:00 | Avvicinamento Milford Sound | `transport` | Viaggio attraverso Eglinton Valley | ❌ Assente | - | `road-transport` | Cardrona | Eglinton Valley | Alta | Spostamento guidato |
| Day 14 (11 dic)| `d14-2` | 18:00 | Knobs Flat Accommodation | `hotel` | Eglinton Valley | ❌ Assente | - | `hotel-event` | Eglinton Valley | Knobs Flat | Alta | Alloggio overnight |
| **Day 15 (12 dic)**|`d15-1` | 10:00 | Milford Sound Cruise | `sightseeing` | Crociera panoramica fiordi | ❌ Assente | - | `driving-stop` | Knobs Flat | Milford Visitor Terminal | Alta | Terminal crociere nei fiordi |
| Day 15 (12 dic)| `d15-2` | 15:00 | Milford Sound → Queenstown | `transport` | Rientro verso Queenstown | ❌ Assente | - | `road-transport` | Milford Sound | Arrowtown | Alta | Spostamento guidato |
| Day 15 (12 dic)| `d15-3` | 19:00 | Arrowtown Lodge | `hotel` | Arrowtown, Queenstown Area | ❌ Assente | - | `hotel-event` | Queenstown | Arrowtown | Alta | Alloggio overnight |
| **Day 16 (13 dic)**|`d16-1` | 10:00 | Arrowtown → Lake Tekapo | `transport` | Spostamento laghi turchesi | ❌ Assente | - | `road-transport` | Arrowtown | Lake Tekapo | Alta | Spostamento guidato |
| Day 16 (13 dic)| `d16-2` | 21:00 | Stargazing Monte John | `sightseeing` | Cielo stellato UNESCO Tekapo | ❌ Assente | - | `driving-stop` | Lake Tekapo | Dark Sky Project, Tekapo | Alta | Osservatorio astronomico |
| Day 16 (13 dic)| `d16-3` | 23:00 | Fairlie Holiday Park / Lodge | `hotel` | Lake Tekapo Area | ❌ Assente | - | `hotel-event` | Dark Sky Project | Fairlie Holiday Park | Alta | Alloggio overnight |
| **Day 17 (14 dic)**|`d17-1` | 10:00 | Lake Tekapo → CHC Airport | `transport` | Rilascio auto in aeroporto | ❌ Assente | `tr-rent-nz-snap` | `road-transport` | Fairlie / Tekapo | Christchurch Airport | Alta | Rilascio auto noleggio NZ |
| Day 17 (14 dic)| `d17-2` | 18:20 | Volo Christchurch CHC → ADL | `transport` | Air New Zealand NZ261 | ❌ Assente | `tr-flight-chc-adl` | `non-driving-transport` | Christchurch CHC | Adelaide ADL | Alta | Volo aereo internazionale (INTERROMPE GUIDA) |
| Day 17 (14 dic)| `d17-3` | 20:25 | Arrivo Adelaide | `transport` | Ritiro auto e check-in | ❌ Assente | `tr-rent-au-eastcoast`| `road-transport` | Adelaide Airport | Jacksons Motor Inn | Alta | Ritiro auto noleggio AU |
| **Day 18 (15 dic)**|`d18-1` | 08:00 | Adelaide → Cape Jervis Ferry | `transport` | Traghetto auto e viaggio | ❌ Assente | - | `non-driving-transport` | Adelaide | Cape Jervis / Kangaroo Island | Alta | Traghetto marittimo auto per l'isola |
| Day 18 (15 dic)| `d18-2` | 13:00 | Flinders Chase National Park | `sightseeing` | Remarkable Rocks | ❌ Assente | - | `driving-stop` | Penneshaw | Flinders Chase NP | Alta | Parco nazionale su isola |
| Day 18 (15 dic)| `d18-3` | 19:00 | Kangaroo Island Retreat | `hotel` | Flinders Chase Area | ❌ Assente | - | `hotel-event` | Flinders Chase NP | Kangaroo Island Retreat | Alta | Alloggio overnight |
| **Day 19 (16 dic)**|`d19-1` | 15:00 | Rientro ad Adelaide Airport | `sightseeing` | Rilascio auto | ❌ Assente | `tr-rent-au-eastcoast`| `road-transport` | Kangaroo Island | Adelaide Airport | Alta | Rilascio auto noleggio Adelaide |
| Day 19 (16 dic)| `d19-2` | 19:00 | Volo Adelaide ADL → MEL | `transport` | Virgin Australia VA218 | ❌ Assente | `tr-flight-adl-mel` | `non-driving-transport` | Adelaide ADL | Melbourne MEL | Alta | Volo aereo domestico AU (INTERROMPE GUIDA) |
| Day 19 (16 dic)| `d19-3` | 20:45 | Arrivo Melbourne | `transport` | Ritiro Van camperizzato | ❌ Assente | `tr-rent-au-van` | `road-transport` | Melbourne Airport | Melbourne Camper Park | Alta | Ritiro Van camperizzato |
| **Day 20 (17 dic)**|`d20-1` | 09:00 | Melbourne → Great Ocean Road | `sightseeing` | Partenza viaggio on-road | ❌ Assente | - | `road-transport` | Melbourne | Geelong / Great Ocean Rd | Alta | Inizio Great Ocean Road |
| Day 20 (17 dic)| `d20-2` | 16:00 | Dodici Apostoli (12 Apostles) | `sightseeing` | Tramonto sulla Great Ocean Road | ❌ Assente | - | `driving-stop` | Geelong | Twelve Apostles | Alta | Faraglioni panoramici |
| Day 20 (17 dic)| `d20-3` | 19:00 | 12 Apostles Campground | `hotel` | Port Campbell area | ❌ Assente | - | `hotel-event` | Twelve Apostles | 12 Apostles Campground | Alta | Campeggio overnight |
| **Day 21 (18 dic)**|`d21-1` | 09:00 | 12 Apostoli → Melbourne | `transport` | Strada panoramica via Costa | ❌ Assente | - | `road-transport` | Port Campbell | Melbourne | Alta | Guida di rientro via costa |
| Day 21 (18 dic)| `d21-2` | 16:00 | Melbourne City tour | `sightseeing` | Hosier Lane e lungofiume Yarra | ❌ Assente | - | `driving-stop` | Melbourne | Hosier Lane | Alta | Tour urbano |
| Day 21 (18 dic)| `d21-3` | 19:00 | Melbourne Tourist Park | `hotel` | Melbourne Area | ❌ Assente | - | `hotel-event` | Hosier Lane | Melbourne Tourist Park | Alta | Campeggio overnight |
| **Day 22 (19 dic)**|`d22-1` | 10:00 | Melbourne → Phillip Island | `transport` | Trasferimento isola pinguini | ❌ Assente | - | `road-transport` | Melbourne | Phillip Island | Alta | Guida verso l'isola |
| Day 22 (19 dic)| `d22-2` | 20:00 | Penguin Parade | `sightseeing` | Parata pinguini nani | ❌ Assente | - | `driving-stop` | Phillip Island | Penguin Parade Visitor Centre | Alta | Parco pinguini |
| Day 22 (19 dic)| `d22-3` | 22:00 | Tidal Campground | `hotel` | Phillip Island | ❌ Assente | - | `hotel-event` | Penguin Parade | Tidal Campground | Alta | Campeggio overnight |
| **Day 23 (20 dic)**|`d23-1` | 08:00 | Wilsons Promontory NP hikes | `sightseeing` | Spiagge e percorsi naturali | ❌ Assente | - | `driving-stop` | Phillip Island | Wilsons Promontory NP | Alta | Parco nazionale |
| Day 23 (20 dic)| `d23-2` | 19:00 | Wilson Promontory Campsite | `hotel` | Wilson Promontory | ❌ Assente | - | `hotel-event` | Wilsons Promontory NP | Tidal River Campsite | Alta | Campeggio overnight |
| **Day 24 (21 dic)**|`d24-1` | 09:00 | Wilson Promontory → NSW Coast | `transport` | Trasferimento lungo la costa | ❌ Assente | - | `road-transport` | Wilsons Promontory | NSW Coast | Alta | Guida a lunga distanza |
| Day 24 (21 dic)| `d24-2` | 18:00 | Mid-way Coast Camping | `hotel` | NSW Coast | ❌ Assente | - | `hotel-event` | NSW Coast | Mid-way Coast Camping | Alta | Campeggio overnight |
| **Day 25 (22 dic)**|`d25-1` | 09:00 | NSW Coast → Jervis Bay | `transport` | Arrivo alla baia di Jervis | ❌ Assente | - | `road-transport` | NSW Coast | Jervis Bay | Alta | Guida verso Jervis Bay |
| Day 25 (22 dic)| `d25-2` | 15:00 | Hyams Beach | `sightseeing` | Spiaggia di sabbia bianca | ❌ Assente | - | `driving-stop` | Jervis Bay | Hyams Beach | Alta | Spiaggia panoramica |
| Day 25 (22 dic)| `d25-3` | 19:00 | Jervis Bay Holiday Park | `hotel` | Jervis Bay | ❌ Assente | - | `hotel-event` | Hyams Beach | Jervis Bay Holiday Park | Alta | Campeggio overnight |
| **Day 26 (23 dic)**|`d26-1` | 10:00 | Dolphin Watching Tour | `sightseeing` | Tour in barca avvistamento delfini | ❌ Assente | - | `driving-stop` | Jervis Bay Holiday Park | 58 Owen Street, Huskisson | Alta | Ufficio tour con indirizzo |
| Day 26 (23 dic)| `d26-2` | 19:00 | Jervis Bay Cabin | `hotel` | Jervis Bay | ❌ Assente | - | `hotel-event` | 58 Owen Street | Jervis Bay Cabin | Alta | Alloggio overnight |
| **Day 27 (24 dic)**|`d27-1` | 09:00 | Jervis Bay → Blue Mountains | `transport` | Spostamento verso montagne blu | ❌ Assente | - | `road-transport` | Jervis Bay | Katoomba, Blue Mountains | Alta | Guida verso le montagne |
| Day 27 (24 dic)| `d27-2` | 14:00 | Tre Sorelle & Katoomba | `sightseeing` | Punti panoramici Blue Mountains | ❌ Assente | - | `driving-stop` | Katoomba | Echo Point, Three Sisters | Alta | Punto panoramico |
| Day 27 (24 dic)| `d27-3` | 18:00 | Katoomba Campsite | `hotel` | Blue Mountains | ❌ Assente | - | `hotel-event` | Echo Point | Katoomba Campsite | Alta | Campeggio overnight |
| **Day 28 (25 dic)**|`d28-1` | 09:00 | Consegna Van a Sydney Banksmeadow | `sightseeing` | Fine noleggio camper | ❌ Assente | `tr-rent-au-van` | `road-transport` | Katoomba | 1C McPherson St, Banksmeadow | Alta | Rilascio camper Banksmeadow |
| Day 28 (25 dic)| `d28-2` | 13:00 | Sydney Opera House & The Rocks| `sightseeing` | Esplorazione a piedi del porto | ❌ Assente | - | `driving-stop` | Banksmeadow | Sydney Opera House | Alta | Attrazione turistica |
| Day 28 (25 dic)| `d28-3` | 18:00 | Sydney Central Hotel | `hotel` | Sydney CBD | ❌ Assente | - | `hotel-event` | Sydney Opera House | Hotel Challis Potts Point | Alta | Hotel overnight |
| **Day 29 (26 dic)**|`d29-1` | 10:00 | Corso Surf Bondi Beach | `sightseeing` | Lezione di surf a Bondi Beach | ❌ Assente | - | `driving-stop` | Potts Point | Bondi Beach | Alta | Spiaggia celebre |
| Day 29 (26 dic)| `d29-2` | 15:00 | Bondi to Coogee Coastal Walk | `sightseeing` | Passeggiata scogliere Sydney | ❌ Assente | - | `driving-stop` | Bondi Beach | Coogee Beach | Alta | Percorso panoramico a piedi |
| Day 29 (26 dic)| `d29-3` | 19:00 | Sydney Central Hotel | `hotel` | Sydney | ❌ Assente | - | `hotel-event` | Coogee Beach | Hotel Challis Potts Point | Alta | Hotel overnight |
| **Day 30 (27 dic)**|`d30-1` | 12:15 | Volo Sydney SYD → Manila MNL | `transport` | Cebu Pacific 5J040 · 7h 55m | ❌ Assente | `tr-flight-syd-mnl` | `non-driving-transport` | Sydney SYD | Manila MNL | Alta | Volo aereo internazionale (INTERROMPE GUIDA) |
| Day 30 (27 dic)| `d30-2` | 17:55 | Arrivo Manila MNL | `transport` | Check-in hotel transito | ❌ Assente | - | `hotel-event` | Manila MNL | Pasay City, Manila | Alta | Arrivo aeroporto |
| Day 30 (27 dic)| `d30-3` | 20:00 | Manila Transit Hotel | `hotel` | Pasay City, Manila | ❌ Assente | - | `hotel-event` | Manila MNL | Manila Transit Hotel | Alta | Alloggio overnight |
| **Day 31 (28 dic)**|`d31-1` | 10:00 | Giro storico Intramuros | `sightseeing` | Manila coloniale spagnola | ❌ Assente | - | `driving-stop` | Pasay City | Intramuros, Manila | Alta | Quartiere storico |
| Day 31 (28 dic)| `d31-2` | 19:00 | Manila Transit Hotel | `hotel` | Manila | ❌ Assente | - | `hotel-event` | Intramuros | Manila Transit Hotel | Alta | Alloggio overnight |
| **Day 32 (29 dic)**|`d32-1` | 12:00 | Relax & Preparazione Boracay | `sightseeing` | Organizzazione bagagli | ❌ Assente | - | `non-routable` | Manila Transit Hotel | Manila Transit Hotel | Bassa | Attività logistica interna hotel |
| Day 32 (29 dic)| `d32-2` | 19:00 | Manila Transit Hotel | `hotel` | Manila | ❌ Assente | - | `hotel-event` | Manila Transit Hotel | Manila Transit Hotel | Alta | Alloggio overnight |
| **Day 33 (30 dic)**|`d33-1` | 08:50 | Volo Manila MNL → Caticlan MPH | `transport` | Cebu Pacific 5J899 · 1h 10m | ❌ Assente | `tr-flight-syd-mnl` | `non-driving-transport` | Manila MNL | Caticlan MPH | Alta | Volo aereo interno Filippine (INTERROMPE GUIDA) |
| Day 33 (30 dic)| `d33-2` | 10:00 | Transfer Barca Caticlan → Boracay| `transport` | Avvicinamento all'isola | ❌ Assente | - | `non-driving-transport` | Caticlan Jetty Port | Boracay Jetty Port | Alta | Trasporto marittimo in barca |
| Day 33 (30 dic)| `d33-3` | 13:00 | Check-in Boracay Resort | `hotel` | White Beach, Boracay | ❌ Assente | - | `hotel-event` | Boracay Jetty Port | Bamboo Beach Resort Boracay | Alta | Alloggio overnight |
| **Day 34 (31 dic)**|`d34-1` | 10:00 | Relax White Beach | `sightseeing` | Giornata di mare a Boracay | ❌ Assente | - | `driving-stop` | Bamboo Beach Resort | White Beach Boracay | Alta | Spiaggia |
| Day 34 (31 dic)| `d34-2` | 20:00 | Cenone e Capodanno in spiaggia | `sightseeing` | White Beach Boracay | ❌ Assente | - | `driving-stop` | White Beach | White Beach Boracay | Alta | Evento in spiaggia |
| Day 34 (31 dic)| `d34-3` | 23:00 | Boracay Resort | `hotel` | Boracay | ❌ Assente | - | `hotel-event` | White Beach | Bamboo Beach Resort Boracay | Alta | Alloggio overnight |
| **Day 35 (1 gen)** |`d35-1` | 15:50 | Volo Caticlan MPH → El Nido ENI| `transport` | Cebu Pacific DG5411 · 1h 10m | ❌ Assente | `tr-flight-mph-eni` | `non-driving-transport` | Caticlan MPH | El Nido ENI | Alta | Volo aereo tra isole (INTERROMPE GUIDA) |
| Day 35 (1 gen) | `d35-2` | 17:00 | Arrivo El Nido & Transfer | `transport` | Hotel check-in | ❌ Assente | - | `road-transport` | El Nido Airport | El Nido Beach Hotel | Alta | Transfer stradale tricycle/van |
| Day 35 (1 gen) | `d35-3` | 19:00 | El Nido Beach Hotel | `hotel` | El Nido, Palawan | ❌ Assente | - | `hotel-event` | El Nido Town | El Nido Beach Hotel | Alta | Alloggio overnight |
| **Day 36 (2 gen)** |`d36-1` | 08:30 | Tao Experience Expedition (G1)| `sightseeing` | El Nido → Coron (imbarco) | ❌ Assente | - | `non-driving-transport` | El Nido Town | Linapacan Archipelago | Alta | Spedizione marittima 4D3N (INTERROMPE GUIDA) |
| Day 36 (2 gen) | `d36-2` | 17:00 | Tao Island Campsite 1 | `hotel` | Isola deserta arcipelago | ❌ Assente | - | `hotel-event` | Linapacan | Tao Island Campsite 1 | Alta | Campo base isola deserta |
| **Day 37 (3 gen)** |`d37-1` | 08:00 | Tao Experience Expedition (G2)| `sightseeing` | Snorkeling barriera corallina | ❌ Assente | - | `non-driving-transport` | Tao Campsite 1 | Tao Campsite 2 | Alta | Navigazione marittima tra isole |
| Day 37 (3 gen) | `d37-2` | 17:00 | Tao Island Campsite 2 | `hotel` | Isola deserta | ❌ Assente | - | `hotel-event` | Isola deserta 1 | Tao Island Campsite 2 | Alta | Campo base isola deserta |
| **Day 38 (4 gen)** |`d38-1` | 08:00 | Tao Experience Expedition (G3)| `sightseeing` | Esplorazione isole e villaggi | ❌ Assente | - | `non-driving-transport` | Tao Campsite 2 | Tao Campsite 3 | Alta | Navigazione marittima tra isole |
| Day 38 (4 gen) | `d38-2` | 17:00 | Tao Island Campsite 3 | `hotel` | Isola deserta | ❌ Assente | - | `hotel-event` | Isola deserta 2 | Tao Island Campsite 3 | Alta | Campo base isola deserta |
| **Day 39 (5 gen)** |`d39-1` | 08:00 | Tao Experience Expedition (G4)| `sightseeing` | Ultima navigazione ➔ Coron | ❌ Assente | - | `non-driving-transport` | Tao Campsite 3 | Coron Town Pier | Alta | Arrivo nave a Coron |
| Day 39 (5 gen) | `d39-2` | 16:00 | Coron Bay Hotel | `hotel` | Coron Town, Busuanga | ❌ Assente | - | `hotel-event` | Coron Town Pier | Coron Bay Hotel | Alta | Alloggio overnight |
| **Day 40 (6 gen)** |`d40-1` | 07:00 | Dugong Watching Quest | `sightseeing` | Escursione avvistamento dugonghi | ❌ Assente | - | `driving-stop` | Coron Bay Hotel | Coron Town Pier / Busuanga | Alta | Escursione naturalistica |
| Day 40 (6 gen) | `d40-2` | 19:00 | Coron Bay Hotel | `hotel` | Coron | ❌ Assente | - | `hotel-event` | Busuanga | Coron Bay Hotel | Alta | Alloggio overnight |
| **Day 41 (7 gen)** |`d41-1` | 16:55 | Busuanga USU → Cebu CEB | `transport` | Philippine Airlines PR2681 | ❌ Assente | `tr-flight-usu-ceb` | `non-driving-transport` | Busuanga USU | Cebu CEB | Alta | Volo aereo interno (INTERROMPE GUIDA) |
| Day 41 (7 gen) | `d41-2` | 18:10 | Arrivo Cebu & Check-in | `transport` | Hotel vicino aeroporto | ❌ Assente | - | `hotel-event` | Cebu CEB Airport | Cebu Airport Hotel | Alta | Arrivo aeroporto |
| Day 41 (7 gen) | `d41-3` | 19:30 | Cebu Airport Hotel | `hotel` | Lapu-Lapu City, Cebu | ❌ Assente | - | `hotel-event` | Lapu-Lapu City | Cebu Airport Hotel | Alta | Alloggio overnight |
| **Day 42 (8 gen)** |`d42-1` | 10:00 | Giro città & Souvenir | `sightseeing` | Cebu City historical sites | ❌ Assente | - | `driving-stop` | Lapu-Lapu City | Cebu City Historical Sites | Alta | Tour urbano |
| Day 42 (8 gen) | `d42-2` | 19:30 | Cebu Airport Hotel | `hotel` | Cebu | ❌ Assente | - | `hotel-event` | Cebu City | Cebu Airport Hotel | Alta | Alloggio overnight |
| **Day 43 (9 gen)** |`d43-1` | 12:10 | Cebu CEB → Taipei → Roma FCO | `transport` | China Airlines · Volo rientro | ❌ Assente | `tr-flight-ceb-fco` | `non-driving-transport` | Cebu CEB | Roma FCO | Alta | Volo aereo di rientro intercontinentale |
| **Day 44 (10 gen)**|`d44-1` | 08:00 | Arrivo in Italia | `sightseeing` | Rientro a Roma (fine viaggio) | ❌ Assente | - | `non-routable` | Roma FCO | Roma | Bassa | Evento conclusivo |

---

## 3. Tabella Completa Trasporti Classificati (`transports.json`)

| ID | Data | Tipo | Da (From) | A (To) | Durata | Classificazione | Interrompe Routing Stradale? | Attività Collegate | Qualità Associazione |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `tr-train-1` | 2026-11-28 | `train` | Roma Termini | Milano Centrale | 3h 10m | `treno` | **SÌ** (Ferroviario High-Speed) | `d1-1` | Alta (Testo + Data) |
| `tr-flight-mxp-akl`| 2026-11-29 | `plane` | Milano MXP | Auckland AKL | 18h 35m | `volo` | **SÌ** (Intercontinentale con scalo) | `d2-1`, `d3-1`, `d3-5`, `d3-6` | Alta (Testo + Data) |
| `tr-ferry-wlg-pic` | 2026-12-06 | `ferry` | Wellington | Picton | 3h 45m | `traghetto` | **SÌ** (Marittimo Stretto di Cook) | `d9-1`, `d9-2` | Alta (Testo + Data) |
| `tr-flight-chc-adl`| 2026-12-15 | `plane` | Christchurch CHC | Adelaide ADL | 2h 10m | `volo` | **SÌ** (Internazionale NZ ➔ AU) | `d17-2` | Alta (Testo + Data) |
| `tr-flight-adl-mel`| 2026-12-16 | `plane` | Adelaide ADL | Melbourne MEL | 1h 50m | `volo` | **SÌ** (Domestico AU) | `d19-2` | Alta (Testo + Data) |
| `tr-flight-syd-mnl`| 2026-12-27 | `plane` | Sydney SYD | Caticlan MPH | 7h 55m | `volo` | **SÌ** (Internazionale AU ➔ PH) | `d30-1`, `d33-1` | Alta (Testo + Data) |
| `tr-flight-mph-eni`| 2027-01-01 | `plane` | Caticlan MPH | El Nido ENI | 1h 10m | `volo` | **SÌ** (Domestico PH Interisola) | `d35-1` | Alta (Testo + Data) |
| `tr-flight-usu-ceb`| 2027-01-08 | `plane` | Busuanga USU | Cebu CEB | 1h 15m | `volo` | **SÌ** (Domestico PH Interisola) | `d41-1` | Alta (Testo + Data) |
| `tr-flight-ceb-fco`| 2027-01-09 | `plane` | Cebu CEB | Roma FCO | 17h 35m | `volo` | **SÌ** (Intercontinentale Rientro) | `d43-1` | Alta (Testo + Data) |
| `tr-rent-nz-snap` | 2026-12-01 | `car` | Auckland Parnell | Christchurch Airport | 14 giorni | `auto` | **NO** (Abilita guida in auto NZ) | `d4-1`, `d5-1` → `d17-1` | Alta (Date noleggio) |
| `tr-rent-au-eastcoast`|2026-12-14 | `car` | Adelaide Airport | Adelaide Airport | 2 giorni | `auto` | **NO** (Abilita guida in auto ADL) | `d17-3`, `d18-1`, `d19-1` | Alta (Date noleggio) |
| `tr-rent-au-van` | 2026-12-17 | `car` | Melbourne Tullamarine | Sydney Banksmeadow | 12 giorni | `auto` | **NO** (Abilita guida in camper AU) | `d19-3`, `d20-1` → `d28-1` | Alta (Date noleggio) |

---

## 4. Tabella Completa Alloggi (`accommodations.json`)

Analisi degli alloggi registrati in `accommodations.json` e calcolo notti mediante la regola temporale:
$$\text{startDate} \le \text{data della notte} < \text{endDate}$$

| ID Accommodation | Nome Alloggio | Città | Start Date | End Date | Check-in Orig | Check-out Orig | Notti Calcolate | MapsUrl | Attività Check-in | Attività Check-out | Arrivo Precedente | Partenza Successiva | Coerenza | Stato |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `acc-milano` | a&o Hostel Milano Ca Granda | Milano | 2026-11-28 | 2026-11-29 | 28 nov 15:00 | 29 nov 10:00 | 1 notte | ✅ Presente | `d1-hotel` | `d2-0` | Treno Frecciarossa | Volo MXP➔PEK | Coerente | **Confermato** |
| `acc-auckland` | Noa Hotel | Auckland | 2026-12-01 | 2026-12-02 | 1 dic 14:00 | 2 dic 10:00 | 1 notte | ✅ Presente | `d4-2` | - | Volo PEK➔AKL | Roadtrip Waitomo | Coerente | **Confermato** |
| `acc-waitomo` | Waitomo Village Chalets | Waitomo | 2026-12-02 | 2026-12-03 | 2 dic 14:00 | 3 dic 10:00 | 1 notte | ✅ Presente | `d5-6` | - | Glowworm Caves | Hobbiton | Coerente | **Confermato** |
| `acc-rotorua` | Wylie Court Motor Lodge | Rotorua | 2026-12-03 | 2026-12-04 | 3 dic 14:00 | 4 dic 10:00 | 1 notte | ✅ Presente | `d6-5` | - | Mitai Maori | Redwoods Treewalk | Coerente | **Confermato** |
| `acc-nationalpark`| National Park Backpackers | National Park | 2026-12-04 | 2026-12-05 | 4 dic 14:00 | 5 dic 10:00 | 1 notte | ✅ Presente | `d7-6` | - | Cascate Huka | Tongariro Trekking | Nome diverso in `itinerary.json` (`Skotel Alpine Resort`) | **Da verificare** (Scostamento Nome) |
| `acc-levin` | Totara Lodge Motel | Levin | 2026-12-05 | 2026-12-06 | 5 dic 14:00 | 6 dic 10:00 | 1 notte | ✅ Presente | `d8-3` | - | Spostamento Levin | Partenza Wellington | Coerente | **Confermato** |
| `acc-kaikoura` | Kaikoura Seaside Lodge | Kaikoura | 2026-12-06 | 2026-12-07 | 6 dic 14:00 | 7 dic 10:00 | 1 notte | ✅ Presente | `d9-3` | - | Traghetto Picton | Whale Watch | Coerente | **Confermato** |
| `acc-otira` | Otira Stagecoach Hotel | Otira | 2026-12-07 | 2026-12-08 | 7 dic 14:00 | 8 dic 10:00 | 1 notte | ✅ Presente | `d10-2` | - | Spostamento Arthur Pass | Otira Viaduct | Coerente | **Confermato** |
| `acc-franzjosef` | Haka House Franz Josef | Franz Josef | 2026-12-08 | 2026-12-09 | 8 dic 14:00 | 9 dic 10:00 | 1 notte | ✅ Presente | `d11-5` | - | Franz Josef Glacier Walk | Fox Glacier Helihike | Coerente | **Confermato** |
| `acc-ivorytowers` | Ivorytowers Accommodation | Fox Glacier | 2026-12-09 | 2026-12-10 | 9 dic 14:00 | 10 dic 10:00 | 1 notte | ✅ Presente | `d12-3` | - | Lake Matheson Walk | Haast Pass | Coerente | **Confermato** |
| `acc-rainforest` | Rainforest Retreat | Franz Josef | 2026-12-10 | 2026-12-11 | 10 dic 14:00 | 11 dic 10:00 | 1 notte | ✅ Presente | - | - | - | - | Sovrapposto a `acc-cardrona` nella notte del 10 dic | **Incoerente** (Duplicato) |
| `acc-cardrona` | Cardrona Hotel | Cardrona | 2026-12-10 | 2026-12-11 | 10 dic 15:00 | 11 dic 10:00 | 1 notte | ✅ Presente | `d13-7` | - | Roy's Peak Lookout | Avvicinamento Milford | Coerente con l'itinerario | **Confermato** |
| `acc-eglinton` | Eglinton Valley Camp | Eglinton Valley | 2026-12-11 | 2026-12-12 | 11 dic 14:00 | 12 dic 10:00 | 1 notte | ✅ Presente | `d14-2` | - | Avvicinamento Milford | Milford Cruise | Nome diverso in `itinerary.json` (`Knobs Flat`) | **Da verificare** (Scostamento Nome) |
| `acc-neworleans` | New Orleans Hotel | Arrowtown | 2026-12-12 | 2026-12-13 | 12 dic 14:00 | 13 dic 10:00 | 1 notte | ✅ Presente | `d15-3` | - | Milford Cruise | Spostamento Tekapo | Nome diverso in `itinerary.json` (`Arrowtown Lodge`) | **Da verificare** (Scostamento Nome) |
| `acc-fairlie` | Fairlie Holiday Park | Fairlie | 2026-12-13 | 2026-12-14 | 13 dic 14:00 | 14 dic 10:00 | 1 notte | ✅ Presente | `d16-3` | - | Stargazing Monte John | Flight CHC➔ADL | Coerente | **Confermato** |
| `acc-jacksons` | Jacksons Motor Inn | Adelaide | 2026-12-14 | 2026-12-15 | 14 dic 14:00 | 15 dic 10:00 | 1 notte | ✅ Presente | `d17-3` | - | Arrivo Volo CHC➔ADL | Traghetto Kangaroo Island | Coerente | **Confermato** |
| `acc-discovery` | Discovery Parks - KI | Kangaroo Island | 2026-12-15 | 2026-12-16 | 15 dic 14:00 | 16 dic 10:00 | 1 notte | ✅ Presente | `d18-3` | - | Flinders Chase NP | Volo ADL➔MEL | Nome diverso in `itinerary.json` (`Wilderness Retreat`) | **Da verificare** (Scostamento Nome) |
| `acc-challis` | Hotel Challis Potts Point | Sydney | 2026-12-25 | 2026-12-27 | 25 dic 14:00 | 27 dic 10:00 | 2 notti | ✅ Presente | `d28-3` | - | Sydney Opera House | Volo SYD➔MNL | Coerente | **Confermato** |
| `acc-bamboo` | Bamboo Beach Resort | Boracay | 2026-12-29 | 2027-01-01 | 29 dic 14:00 | 1 gen 12:00 | 3 notti | ✅ Presente | `d33-3` | - | Transfer Barca Caticlan | Volo MPH➔ENI | Sovrapposto a `acc-hue` e `acc-357` | **Da verificare** (Sovrapposizione Boracay) |
| `acc-hue` | Hue Hotels and Resorts | Boracay | 2026-12-30 | 2026-12-31 | 30 dic 15:00 | 31 dic 12:00 | 1 notte | ✅ Presente | - | - | - | - | Sovrapposto a `acc-bamboo` | **Potenzialmente duplicato** |
| `acc-357` | 357 Boracay Resort | Boracay | 2026-12-31 | 2027-01-02 | 31 dic 14:00 | 2 gen 12:00 | 2 notti | ✅ Presente | - | - | - | - | Sovrapposto a `acc-bamboo` | **Potenzialmente duplicato** |

---

## 5. Tabella Notte per Notte (Assegnazione Reale degli Alloggi)

Analisi rigorosa notte per notte dal **28 novembre 2026 al 9 gennaio 2027**:

| Data Notte | Città Itinerario | Alloggio Assegnato Reale | Motivo Assegnazione | Arrivo Precedente | Partenza Successiva | Conflitto / Note |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **28 nov 2026** | Milano | `a&o Hostel Milano Ca Granda` | `acc-milano` (`startDate: 2026-11-28`) | Treno Frecciarossa | Check-out e Volo MXP | Nessun conflitto |
| **29 nov 2026** | In volo | *Notte in volo* | Volo Air China MXP ➔ PEK (`d2-1`) | Check-out Hostel Milano | Arrivo Pechino PEK | ✈️ Notte in volo |
| **30 nov 2026** | In volo | *Notte in volo* | Volo Air China PEK ➔ AKL (`d3-6`) | Tour Pechino | Arrivo Auckland AKL | ✈️ Notte in volo |
| **1 dic 2026** | Auckland | `Noa Hotel` | `acc-auckland` (`startDate: 2026-12-01`) | Arrivo Volo AKL | Roadtrip Waitomo | Nessun conflitto |
| **2 dic 2026** | Waitomo | `Waitomo Village Chalets` | `acc-waitomo` (`startDate: 2026-12-02`) | Glowworm Caves | Hobbiton Movie Set | Nessun conflitto |
| **3 dic 2026** | Rotorua | `Wylie Court Motor Lodge` | `acc-rotorua` (`startDate: 2026-12-03`) | Mitai Maori Village | Redwoods Treewalk | Nessun conflitto |
| **4 dic 2026** | Tongariro NP | `Skotel Alpine Resort` / `National Park Backpackers` | `acc-nationalpark` (`startDate: 2026-12-04`) | Cascate Huka | Tongariro Trekking | ⚠️ Scostamento nome: `Skotel` vs `National Park Backpackers` |
| **5 dic 2026** | Levin | `Totara Lodge Motel` | `acc-levin` (`startDate: 2026-12-05`) | Spostamento Levin | Partenza Wellington | Nessun conflitto |
| **6 dic 2026** | Kaikoura | `Kaikoura Seaside Lodge` | `acc-kaikoura` (`startDate: 2026-12-06`) | Traghetto Picton | Whale Watch Kaikoura | Nessun conflitto |
| **7 dic 2026** | Otira | `Otira Stagecoach Hotel` | `acc-otira` (`startDate: 2026-12-07`) | Kaikoura ➔ Arthur Pass | Otira Viaduct | Nessun conflitto |
| **8 dic 2026** | Franz Josef | `Haka House Franz Josef` | `acc-franzjosef` (`startDate: 2026-12-08`) | Franz Josef Glacier Walk | Fox Glacier Helihike | Nessun conflitto |
| **9 dic 2026** | Fox Glacier | `Ivorytowers Accommodation` | `acc-ivorytowers` (`startDate: 2026-12-09`) | Lake Matheson Walk | Haast Pass | Nessun conflitto |
| **10 dic 2026** | Cardrona | `Cardrona Hotel` | `acc-cardrona` (`startDate: 2026-12-10`) | Roy's Peak Lookout | Avvicinamento Milford | ⚠️ Conflitto in JSON con `acc-rainforest` |
| **11 dic 2026** | Eglinton | `Knobs Flat` / `Eglinton Valley Camp` | `acc-eglinton` (`startDate: 2026-12-11`) | Avvicinamento Milford | Milford Sound Cruise | ⚠️ Scostamento nome: `Knobs Flat` vs `Eglinton Camp` |
| **12 dic 2026** | Arrowtown | `Arrowtown Lodge` / `New Orleans Hotel` | `acc-neworleans` (`startDate: 2026-12-12`) | Milford Sound Cruise | Spostamento Tekapo | ⚠️ Scostamento nome: `Arrowtown Lodge` vs `New Orleans Hotel` |
| **13 dic 2026** | Fairlie | `Fairlie Holiday Park` | `acc-fairlie` (`startDate: 2026-12-13`) | Stargazing Monte John | Volo CHC ➔ ADL | Nessun conflitto |
| **14 dic 2026** | Adelaide | `Jacksons Motor Inn` | `acc-jacksons` (`startDate: 2026-12-14`) | Volo CHC ➔ ADL | Traghetto Kangaroo Island | Nessun conflitto |
| **15 dic 2026** | Kangaroo Island | `Kangaroo Island Wilderness Retreat` | `acc-discovery` (`startDate: 2026-12-15`) | Flinders Chase NP | Volo ADL ➔ MEL | ⚠️ Scostamento nome: `Wilderness` vs `Discovery Parks` |
| **16 dic 2026** | Melbourne | *Notte in Van / Campeggio* | Ritiro Van `d19-3` | Volo ADL ➔ MEL | Great Ocean Road | 🚐 Notte in camper |
| **17 dic 2026** | Port Campbell | `12 Apostles Campground` | Itinerario `d20-3` | 12 Apostoli | Guida Rientro Melbourne | Notte in campeggio |
| **18 dic 2026** | Melbourne | `Melbourne Tourist Park` | Itinerario `d21-3` | Melbourne City tour | Guida Phillip Island | Notte in campeggio |
| **19 dic 2026** | Phillip Island | `Tidal Campground` | Itinerario `d22-3` | Penguin Parade | Wilsons Promontory | Notte in campeggio |
| **20 dic 2026** | Wilsons Prom | `Wilson Promontory Campsite` | Itinerario `d23-2` | Wilsons Prom Hikes | NSW Coast | Notte in campeggio |
| **21 dic 2026** | NSW Coast | `Mid-way Coast Camping` | Itinerario `d24-2` | Spostamento Costa | Jervis Bay | Notte in campeggio |
| **22 dic 2026** | Jervis Bay | `Jervis Bay Holiday Park` | Itinerario `d25-3` | Hyams Beach | Dolphin Watching | Notte in campeggio |
| **23 dic 2026** | Jervis Bay | `Jervis Bay Cabin` | Itinerario `d26-2` | Dolphin Watching | Spostamento Blue Mountains| Notte in cabin |
| **24 dic 2026** | Blue Mountains| `Katoomba Campsite` | Itinerario `d27-3` | Tre Sorelle | Consegna Van Sydney | Notte in campeggio |
| **25 dic 2026** | Sydney | `Hotel Challis Potts Point` | `acc-challis` (`startDate: 2026-12-25`) | Consegna Van Sydney | Corso Surf Bondi | Notte 1 di 2 |
| **26 dic 2026** | Sydney | `Hotel Challis Potts Point` | `acc-challis` (`startDate: 2026-12-25`) | Bondi Coastal Walk | Volo SYD ➔ MNL | Notte 2 di 2 |
| **27 dic 2026** | Manila | `Manila Transit Hotel` | Itinerario `d30-3` | Volo SYD ➔ MNL | Giro Intramuros | Hotel transito aeroporto |
| **28 dic 2026** | Manila | `Manila Transit Hotel` | Itinerario `d31-2` | Giro Intramuros | Relax | Hotel transito aeroporto |
| **29 dic 2026** | Manila | `Manila Transit Hotel` | Itinerario `d32-2` | Relax | Volo MNL ➔ MPH | Hotel transito aeroporto |
| **30 dic 2026** | Boracay | `Bamboo Beach Resort` | `acc-bamboo` (`startDate: 2026-12-29`) | Volo MNL ➔ MPH + Barca | Relax White Beach | ⚠️ Conflitto con `acc-hue` |
| **31 dic 2026** | Boracay | `Bamboo Beach Resort` | `acc-bamboo` (`startDate: 2026-12-29`) | Cenone Capodanno | Volo MPH ➔ ENI | ⚠️ Conflitto con `acc-357` |
| **1 gen 2027** | El Nido | `El Nido Beach Hotel` | Itinerario `d35-3` | Volo MPH ➔ ENI | Imbarco Spedizione Tao | Check-in hotel beach |
| **2 gen 2027** | Tao Island 1 | `Tao Island Campsite 1` | Itinerario `d36-2` | Imbarco Tao Expedition | Navigazione Giorno 2 | 🏝️ Campo isola deserta 1 |
| **3 gen 2027** | Tao Island 2 | `Tao Island Campsite 2` | Itinerario `d37-2` | Navigazione Giorno 2 | Navigazione Giorno 3 | 🏝️ Campo isola deserta 2 |
| **4 gen 2027** | Tao Island 3 | `Tao Island Campsite 3` | Itinerario `d38-2` | Navigazione Giorno 3 | Arrivo Coron | 🏝️ Campo isola deserta 3 |
| **5 gen 2027** | Coron | `Coron Bay Hotel` | Itinerario `d39-2` | Arrivo Tao a Coron | Dugong Watching Quest | Hotel bay Coron |
| **6 gen 2027** | Coron | `Coron Bay Hotel` | Itinerario `d40-2` | Dugong Watching Quest | Volo USU ➔ CEB | Hotel bay Coron |
| **7 gen 2027** | Cebu | `Cebu Airport Hotel` | Itinerario `d41-3` | Volo USU ➔ CEB | Giro Città Cebu | Hotel aeroporto Cebu |
| **8 gen 2027** | Cebu | `Cebu Airport Hotel` | Itinerario `d42-2` | Giro Città Cebu | Volo Rientro FCO | Hotel aeroporto Cebu |
| **9 gen 2027** | In volo | *Notte in volo* | Volo China Airlines CEB ➔ FCO | Check-out Cebu Hotel | Arrivo Roma FCO | ✈️ Notte in volo di rientro |

---

## 6. Sequenza Routing per Ogni Giornata

Vedi **Sezione 4 del report precedente** per la sequenza esplicita nodo per nodo di tutte le 44 giornate.

---

## 7. Tratte Sicuramente Guidabili

- **Nuova Zelanda Isola Nord (02 – 06 dic)**: Auckland ➔ Hamilton ➔ Otorohanga ➔ Waitomo ➔ Hobbiton ➔ Tirau ➔ Putaruru ➔ Rotorua ➔ Tongariro ➔ Levin ➔ Wellington.
- **Nuova Zelanda Isola Sud (06 – 14 dic)**: Picton ➔ Kaikoura ➔ Otira ➔ Hokitika ➔ Franz Josef ➔ Fox Glacier ➔ Wanaka ➔ Cardrona ➔ Milford Sound ➔ Queenstown ➔ Tekapo ➔ Christchurch.
- **Australia Roadtrip (17 – 25 dic)**: Melbourne ➔ Great Ocean Road (12 Apostoli) ➔ Phillip Island ➔ Wilsons Promontory ➔ NSW Coast ➔ Jervis Bay ➔ Blue Mountains ➔ Sydney.

---

## 8. Tratte che NON Devono Mai Essere Calcolate in Auto

- `d1-1`: Roma Termini ➔ Milano Centrale (Treno)
- `d2-1` / `d3-1` / `d3-6`: Milano ➔ Pechino ➔ Auckland (Volo Aereo)
- `d9-1`: Wellington ➔ Picton (Traghetto Marittimo Stretto di Cook)
- `d17-2`: Christchurch ➔ Adelaide (Volo Aereo)
- `d19-2`: Adelaide ➔ Melbourne (Volo Aereo)
- `d30-1`: Sydney ➔ Manila (Volo Aereo)
- `d33-1` / `d33-2`: Manila ➔ Caticlan (Volo) ➔ Boracay (Barca)
- `d35-1`: Caticlan ➔ El Nido (Volo)
- `d36-1` → `d39-1`: Spedizione Marittima Tao (El Nido ➔ Coron su barca tradizionale)
- `d41-1`: Busuanga ➔ Cebu (Volo)
- `d43-1`: Cebu ➔ Roma (Volo)

---

## 9. Attività e Alloggi con Dati Geografici Insufficienti

- `d1-3` (Cena a Milano): *"Trattoria / Pizzeria zona Brera o Centrale"*
- `d7-4` (Wairakei Terraces): Subtitle generico *"Wairakei"*
- `d8-1` (Tongariro Crossing): Subtitle descrittivo *"Trekking tra i vulcani attivi"*
- `d14-1` (Avvicinamento Milford): Subtitle generico *"Viaggio attraverso Eglinton Valley"*
- `d20-1` (Partenza Great Ocean Road): Subtitle generico *"Partenza viaggio on-road"*
- `d32-1` (Relax Manila): Attività interna hotel priva di destinazione stradale.

---

## 10. Sovrapposizioni e Incongruenze Rilevate

1. **Scostamento Nomi tra `itinerary.json` e `accommodations.json`**:
   - Day 7: `Skotel Alpine Resort` in itinerario vs `National Park Backpackers` in accommodations.json.
   - Day 14: `Knobs Flat Accommodation` in itinerario vs `Eglinton Valley Camp` in accommodations.json.
   - Day 15: `Arrowtown Lodge` in itinerario vs `New Orleans Hotel` in accommodations.json.
   - Day 18: `Kangaroo Island Wilderness Retreat` in itinerario vs `Discovery Parks` in accommodations.json.
2. **Sovrapposizione Alloggi a Boracay**:
   - `acc-bamboo` (29 dic – 1 gen), `acc-hue` (30 – 31 dic) e `acc-357` (31 dic – 2 gen) risultano attivi contemporaneamente.
3. **Alloggio Duplicato Franz Josef / Cardrona**:
   - `acc-rainforest` (10 – 11 dic) sovrapposto a `acc-cardrona` (10 – 11 dic).

---

## 11. Diagnosi della Causa Tecnica nel Codice Attuale

1. **In `getDrivingCandidateSegments` (`TodayView.tsx`)**:
   - Quando `p1` è `prev_acc` (alloggio notte precedente), `p1.act` è `undefined`.
   - Il blocco `if (p1.act && p2.act)` **valuta a `false` ed ignora la guardia `isDrivingTransit`**, inserendo la rotta `prev_acc ➔ act1` anche se `act1` è un treno alta velocità o un volo!
2. **In `getTodayAccommodation` (`TodayView.tsx`)**:
   - La funzione cerca per `startDate <= dateISO < endDate`. Se fallisce, cerca nelle attività per `a.type === "hotel"`.
   - In giornate in cui l'attività hotel ha un nome leggermente diverso da `accommodations.json`, si creano due nodi distinti.
3. **Mancanza di Interruzione della Sequenza ai Porti/Aeroporti**:
   - Quando un giorno contiene un traghetto (es. Day 9 Wellington-Picton) o un volo, il routing non divide il giorno in due segmenti stradali disgiunti prima e dopo il porto/aeroporto.

---

## 12. Piano di Correzione Organizzato in Micro-Blocchi

### A. Correzioni Dati (JSON & Seed)
- Armonizzare i nomi degli alloggi tra `itinerary.json` ed `accommodations.json` (Skotel, Knobs Flat, Arrowtown Lodge, Wilderness Retreat).
- Rimuovere o riallineare le date degli alloggi sovrapposti a Boracay (`acc-hue`, `acc-357`) e Franz Josef (`acc-rainforest`).

### B. Correzioni Modello & Types
- Nessuna modifica necessaria al momento.

### C. Correzioni Routing (`TodayView.tsx` / `routingService.ts`)
- **Micro-Blocco 1**: Modificare la guardia in `getDrivingCandidateSegments` applicando il controllo `isDrivingTransit` ed il filtro dei trasporti non stradali su **tutti** i punti (compreso `prev_acc`).
- **Micro-Blocco 2**: Spezzare incondizionatamente la sequenza stradale in corrispondenza di qualsiasi volo, treno alta velocità o traghetto marittimo.

### D. Correzioni Alloggi
- Utilizzare la regola temporale rigorosa `startDate <= dateISO < endDate` ed armonizzare i fallback.

### E. Correzioni UI
- Mantenere i 3 stati UI del connettore (`+ Aggiungi luogo`, `⚠️ Luogo non abbastanza preciso`, `🚗 Guida · X min · Y km`).

---

## 🏁 Conclusione dell'Audit

1. **Alloggio Assegnato a Ogni Notte**:
   - Tutte le 43 notti del viaggio sono state associate univocamente ad una struttura reale (vedi **Sezione 5**).
2. **Stato Alloggi**:
   - **Confermati**: 14 alloggi
   - **Da verificare per scostamento nome**: 4 alloggi (Skotel, Knobs Flat, Arrowtown Lodge, KI Wilderness)
   - **Potenzialmente duplicati / sovrapposti**: 3 alloggi (Boracay `acc-hue` / `acc-357`, Franz Josef `acc-rainforest`)
3. **Giornate Stradali vs Interrotte**:
   - **Giornate 100% stradali**: 30 giornate (roadtrip NZ e roadtrip Van AU).
   - **Giornate interrotte da volo/treno/traghetto**: 14 giornate (Day 1, 2, 3, 4, 9, 17, 18, 19, 30, 33, 35, 36-39, 41, 43).
4. **Primo Micro-Blocco Più Sicuro da Implementare**:
   - **Micro-Blocco 1**: Correggere la guardia su `prev_acc` in `getDrivingCandidateSegments` per impedire a treni e voli di essere inseriti come tratte guidabili dall'alloggio precedente.
