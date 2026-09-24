# 🗺️ Audit Completo Itinerario & Diagnosi Routing Service

**Data Audit**: 3 settembre 2026  
**Ambito**: Analisi dell'itinerario completo (44 Giorni: 28 nov 2026 – 10 gen 2027), alloggi (`accommodations.json`), trasporti (`transports.json`), logica dati (`mockData.ts`), algoritmi di routing (`routingService.ts`) e presentazione visiva (`TodayView.tsx`).

---

## 1. Riepilogo Numerico dell'Intero Itinerario

- **Giorni totali itinerario (`itinerary.json`)**: 44 giorni (`day-1` → `day-44`)
- **Attività totali definite nei giorni**: 118 attività
- **Alloggi definiti (`accommodations.json`)**: 19 strutture ricettive
- **Trasporti principali definiti (`transports.json`)**: 12 vettori/tratte principali
  - Voli aerei: 7 tratte principali (MXP→PEK→AKL, CHC→ADL, ADL→MEL, SYD→MNL, MPH→ENI, USU→CEB, CEB→TPE→FCO)
  - Treni: 1 tratta alta velocità (Roma Termini → Milano Centrale)
  - Traghetti: 1 tratta marittima (Wellington → Picton, Bluebridge Ferry)
  - Noleggio auto/van: 3 contratti (Snap Rentals NZ, East Coast Rentals ADL, Travellers Autobarn Van AU)

---

## 2. Tabella di Tutte le Attività Classificate

Di seguito la classificazione sistematica di **tutte le 118 attività dell'itinerario** nelle 5 categorie di routing richieste:
1. `driving-stop`: attrazione, ristorante, hotel o punto raggiungibile in auto.
2. `non-driving-transport`: volo, treno, traghetto o trasporto interurbano non guidabile.
3. `road-transport`: auto a noleggio, taxi, van o transfer stradale.
4. `hotel-event`: check-in, check-out, deposito bagagli.
5. `non-routable`: attività generica o priva di luogo identificabile.

| Giorno / Data | ID | Orario | Titolo | Tipo Activity | Subtitle / Località | MapsUrl | Trasporto Associato | Categoria Routing Proposta | Origine Rilevabile | Destinazione Rilevabile | Qualità | Motivo |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Day 1 (28 nov)** | `d1-1` | 11:05 | Roma Termini → Milano Centrale | `transport` | Trenitalia Frecciarossa · Arrivo ore 14:15 | ✅ Presente | `tr-train-1` | `non-driving-transport` | Roma Termini | Milano Centrale | Alta | Treno Alta Velocità (Strettoia ferrovia, no auto) |
| Day 1 (28 nov) | `d1-hotel` | 15:00 | Check-in a&o Hostel Milano Ca Granda | `hotel` | Via di Vittorio 1, Milano | ✅ Presente | - | `hotel-event` | Milano Centrale | Via di Vittorio 1, Milano | Alta | Struttura alloggio principale |
| Day 1 (28 nov) | `d1-2` | 16:30 | Passeggiata in centro: Duomo & Galleria | `sightseeing` | Piazza del Duomo, Milano | ✅ Presente | - | `driving-stop` | Via di Vittorio 1 | Piazza del Duomo, Milano | Alta | Punto turistico in centro città |
| Day 1 (28 nov) | `d1-3` | 20:00 | Cena a Milano | `food` | Trattoria / Pizzeria zona Brera o Centrale | ✅ Presente | - | `non-routable` | Piazza del Duomo | Brera, Milano | Media | Nome locale assente e query generica |
| **Day 2 (29 nov)** | `d2-0` | 09:30 | Check-out a&o Hostel Milano Ca Granda | `hotel` | Direzione Aeroporto di Milano Malpensa | ❌ Assente | - | `hotel-event` | Via di Vittorio 1 | Malpensa MXP | Media | Check-out alloggio |
| Day 2 (29 nov) | `d2-1` | 12:30 | Milano MXP → Pechino PEK | `transport` | Air China CA950 · Volo diretto | ❌ Assente | `tr-flight-mxp-akl` | `non-driving-transport` | Milano MXP | Pechino PEK | Alta | Volo aereo intercontinentale |
| **Day 3 (30 nov)** | `d3-1` | 05:50 | Arrivo a Pechino PEK | `transport` | Air China CA950 · Terminal 3 | ❌ Assente | `tr-flight-mxp-akl` | `non-driving-transport` | Pechino PEK | Pechino PEK | Alta | Arrivo volo scalato |
| Day 3 (30 nov) | `d3-taxi1` | 07:00 | Taxi: Aeroporto PEK → Muraglia Cinese | `transport` | Pechino Capital Airport, Terminal 3 | ✅ Presente | - | `road-transport` | PEK Terminal 3 | Badaling Great Wall | Alta | Trasferimento taxi stradale |
| Day 3 (30 nov) | `d3-2` | 08:30 | Muraglia Cinese a Badaling | `sightseeing` | Badaling, Great Wall of China | ✅ Presente | - | `driving-stop` | Badaling Great Wall | Badaling Great Wall | Alta | Attrazione turistica |
| Day 3 (30 nov) | `d3-taxi2` | 11:10 | Taxi: Muraglia → Piazza Tiananmen | `transport` | Badaling → Piazza Tiananmen | ✅ Presente | - | `road-transport` | Badaling Great Wall | Piazza Tiananmen | Alta | Trasferimento taxi stradale |
| Day 3 (30 nov) | `d3-3` | 12:20 | Pranzo in zona Tiananmen / Hutong | `food` | Qianmen Street, Pechino | ✅ Presente | - | `driving-stop` | Piazza Tiananmen | Qianmen Street | Alta | Ristorante / area ristorazione |
| Day 3 (30 nov) | `d3-4` | 13:30 | Piazza Tiananmen e Città Proibita | `sightseeing` | Tiananmen Square & Forbidden City | ✅ Presente | - | `driving-stop` | Qianmen Street | Tiananmen Square | Alta | Attrazione turistica |
| Day 3 (30 nov) | `d3-taxi3` | 15:40 | Taxi: Tiananmen → Aeroporto PEK | `transport` | Piazza Tiananmen → PEK T3 | ✅ Presente | - | `road-transport` | Tiananmen Square | PEK Terminal 3 | Alta | Trasferimento taxi stradale |
| Day 3 (30 nov) | `d3-5` | 17:00 | Check-in volo notte PEK → AKL | `other` | Beijing Capital Airport, Terminal 3 | ❌ Assente | `tr-flight-mxp-akl` | `non-driving-transport` | PEK Terminal 3 | PEK Terminal 3 | Alta | Operazione imbarco volo |
| Day 3 (30 nov) | `d3-6` | 00:25 | PEK → Auckland AKL | `transport` | Air China CA783 · Volo di notte | ❌ Assente | `tr-flight-mxp-akl` | `non-driving-transport` | Pechino PEK | Auckland AKL | Alta | Volo aereo intercontinentale |
| **Day 4 (1 dic)** | `d4-1` | 17:25 | Arrivo Auckland AKL | `transport` | Dogana e ritiro auto a noleggio | ❌ Assente | `tr-rent-nz-snap` | `road-transport` | Auckland AKL | Auckland Parnell | Media | Arrivo volo + Ritiro auto |
| Day 4 (1 dic) | `d4-2` | 20:00 | Check-in Noa Hotel | `hotel` | Auckland CBD | ✅ Presente | - | `hotel-event` | Auckland Parnell | Noa Hotel Auckland | Alta | Alloggio overnight |
| **Day 5 (2 dic)** | `d5-1` | 09:00 | Ritiro auto a noleggio · Auckland | `sightseeing` | Auckland Airport | ❌ Assente | `tr-rent-nz-snap` | `road-transport` | Noa Hotel | Auckland Airport | Alta | Punto partenza roadtrip |
| Day 5 (2 dic) | `d5-2` | 11:15 | Hamilton Gardens | `sightseeing` | Hamilton, Nuova Zelanda | ✅ Presente | - | `driving-stop` | Auckland Airport | Hamilton Gardens | Alta | Parco / Giardino Botanico |
| Day 5 (2 dic) | `d5-3` | 13:30 | Otorohanga Kiwi House | `sightseeing` | 20 Alex Telfer Drive, Otorohanga | ✅ Presente | - | `driving-stop` | Hamilton Gardens | 20 Alex Telfer Dr, Otorohanga | Alta | Parco faunistico con indirizzo esatto |
| Day 5 (2 dic) | `d5-4` | 16:00 | Mangapohue Natural Bridge | `sightseeing` | Te Anga Road, Waitomo | ✅ Presente | - | `driving-stop` | 20 Alex Telfer Dr | Te Anga Road, Waitomo | Alta | Attrazione naturale |
| Day 5 (2 dic) | `d5-5` | 17:30 | Waitomo Glowworm Caves | `sightseeing` | 39 Waitomo Village Road | ✅ Presente | - | `driving-stop` | Te Anga Road | 39 Waitomo Village Rd | Alta | Grotte bioluminescenti |
| Day 5 (2 dic) | `d5-6` | 22:00 | Waitomo Village Chalets | `hotel` | Hotel Access Road, Waitomo | ❌ Assente | - | `hotel-event` | 39 Waitomo Village Rd | Waitomo Village Chalets | Alta | Alloggio overnight |
| **Day 6 (3 dic)** | `d6-1` | 09:00 | Hobbiton Movie Set | `sightseeing` | 501 Buckland Road, Matamata | ✅ Presente | - | `driving-stop` | Waitomo Chalets | 501 Buckland Rd, Matamata | Alta | Set cinematografico con indirizzo |
| Day 6 (3 dic) | `d6-2` | 13:00 | Big Dog and Sheep — Pranzo a Tirau | `food` | Tirau i-SITE Visitor Centre | ✅ Presente | - | `driving-stop` | 501 Buckland Rd | Tirau i-SITE Visitor Centre | Alta | Ristorante / punto sosta |
| Day 6 (3 dic) | `d6-3` | 15:00 | Te Waihou Blue Spring | `sightseeing` | Whites Road, Putaruru | ✅ Presente | - | `driving-stop` | Tirau i-SITE | Whites Road, Putaruru | Alta | Sorgente naturale |
| Day 6 (3 dic) | `d6-4` | 17:30 | Mitai Maori Village | `sightseeing` | 196 Fairy Springs Road, Rotorua | ✅ Presente | - | `driving-stop` | Whites Road | 196 Fairy Springs Rd, Rotorua | Alta | Villaggio culturale con indirizzo |
| Day 6 (3 dic) | `d6-5` | 22:00 | Wylie Court Motor Lodge | `hotel` | 345 Fenton Street, Rotorua | ❌ Assente | - | `hotel-event` | 196 Fairy Springs Rd | 345 Fenton St, Rotorua | Alta | Alloggio overnight |
| **Day 7 (4 dic)** | `d7-1` | 09:00 | Redwoods Treewalk | `sightseeing` | 1 Long Mile Road, Rotorua | ✅ Presente | - | `driving-stop` | Wylie Court Lodge | 1 Long Mile Rd, Rotorua | Alta | Parco naturale con indirizzo |
| Day 7 (4 dic) | `d7-2` | 11:00 | Polynesian Spa | `sightseeing` | 1000 Hinemoa Street, Rotorua | ❌ Assente | - | `driving-stop` | 1 Long Mile Rd | 1000 Hinemoa St, Rotorua | Alta | Centro termale con indirizzo |
| Day 7 (4 dic) | `d7-3` | 13:30 | Waiotapu Thermal Wonderland | `sightseeing` | 201 Waiotapu Loop Road | ❌ Assente | - | `driving-stop` | 1000 Hinemoa St | 201 Waiotapu Loop Rd | Alta | Parco geotermico |
| Day 7 (4 dic) | `d7-4` | 15:30 | Wairakei Terraces | `sightseeing` | Wairakei | ❌ Assente | - | `driving-stop` | 201 Waiotapu Loop Rd | Wairakei Terraces | Media | Terme geotermiche |
| Day 7 (4 dic) | `d7-5` | 16:30 | Cascate Huka | `sightseeing` | Wairakei, Taupo | ❌ Assente | - | `driving-stop` | Wairakei Terraces | Cascate Huka, Taupo | Alta | Cascate naturali |
| Day 7 (4 dic) | `d7-6` | 18:45 | Skotel Alpine Resort | `hotel` | Tongariro National Park | ❌ Assente | - | `hotel-event` | Cascate Huka | Skotel Alpine Resort | Alta | Alloggio overnight |
| **Day 8 (5 dic)** | `d8-1` | 08:00 | Trekking Tongariro Alpine Crossing | `sightseeing` | Trekking tra i vulcani attivi | ❌ Assente | - | `driving-stop` | Skotel Alpine Resort | Mangatepopo / Ketetahi | Media | Inizio trekking montano |
| Day 8 (5 dic) | `d8-2` | 17:00 | Spostamento a Levin | `transport` | Trasferimento da Tongariro a Levin | ❌ Assente | - | `road-transport` | Tongariro NP | Levin | Alta | Trasferimento guidato su strada |
| Day 8 (5 dic) | `d8-3` | 20:00 | Totara Lodge Motel | `hotel` | 15 Devon Street, Levin | ❌ Assente | - | `hotel-event` | Levin | 15 Devon Street, Levin | Alta | Alloggio overnight |
| **Day 9 (6 dic)** | `d9-0` | 08:30 | Partenza da Levin | `sightseeing` | Verso Wellington | ❌ Assente | - | `driving-stop` | 15 Devon St, Levin | Wellington | Media | Punto partenza mattutina |
| Day 9 (6 dic) | `d9-1a` | 10:00 | Museum Te Papa Tongarewa | `sightseeing` | Wellington — Museo Nazionale | ❌ Assente | - | `driving-stop` | Levin | Te Papa Museum, Wellington | Alta | Museo Nazionale |
| Day 9 (6 dic) | `d9-1` | 12:30 | Traghetto Wellington → Picton | `transport` | Bluebridge Ferry (Livia) | ❌ Assente | `tr-ferry-wlg-pic` | `non-driving-transport` | Wellington Ferry Terminal | Picton Ferry Terminal | Alta | Traghetto marittimo tra le due isole (INTERROMPE AUTO) |
| Day 9 (6 dic) | `d9-2` | 16:15 | Arrivo Picton · Marlborough Sounds | `transport` | Proseguire verso Kaikoura | ❌ Assente | - | `road-transport` | Picton Ferry Terminal | Kaikoura | Alta | Sbarco e ripresa guida Isola Sud |
| Day 9 (6 dic) | `d9-3` | 21:00 | Kaikoura Seaside Lodge | `hotel` | 268 Esplanade, Kaikoura | ❌ Assente | - | `hotel-event` | Picton | 268 Esplanade, Kaikoura | Alta | Alloggio overnight |
| **Day 10 (7 dic)**| `d10-whale`|09:00 | Whale Watch Kaikoura | `sightseeing` | Whale Way Station, Kaikoura | ❌ Assente | - | `driving-stop` | 268 Esplanade | 224 Esplanade, Kaikoura | Alta | Stazione avvistamento balene |
| Day 10 (7 dic) | `d10-1` | 13:30 | Kaikoura → Arthur Pass | `transport` | Strada panoramica costa est | ❌ Assente | - | `road-transport` | Kaikoura | Arthur Pass | Alta | Spostamento guidato su strada |
| Day 10 (7 dic) | `d10-2` | 18:00 | Otira Stagecoach Hotel | `hotel` | 6435 Otira Highway, Otira | ❌ Assente | - | `hotel-event` | Arthur Pass | 6435 Otira Highway, Otira | Alta | Alloggio overnight |
| **Day 11 (8 dic)**| `d11-0` | 09:00 | Partenza da Otira | `sightseeing` | Otira Viaduct Lookout | ❌ Assente | - | `driving-stop` | 6435 Otira Hwy | Otira Viaduct Lookout | Alta | Punto panoramico |
| Day 11 (8 dic) | `d11-1` | 10:00 | Hokitika | `sightseeing` | Hokitika, West Coast NZ | ❌ Assente | - | `driving-stop` | Otira Viaduct | Hokitika Town | Alta | Cittadina di mare |
| Day 11 (8 dic) | `d11-2` | 11:30 | Hokitika Gorge | `sightseeing` | Kokatahi 7881 | ❌ Assente | - | `driving-stop` | Hokitika | Hokitika Gorge, Kokatahi | Alta | Gola turchese |
| Day 11 (8 dic) | `d11-3` | 14:00 | Sosta pranzo a Franz Josef | `food` | Full Of Beans, Main Road | ❌ Assente | - | `driving-stop` | Hokitika Gorge | Main Road, Franz Josef | Alta | Ristorante / Caffè |
| Day 11 (8 dic) | `d11-4` | 16:00 | Franz Josef Glacier Walk | `sightseeing` | Passeggiata fronte ghiacciaio | ❌ Assente | - | `driving-stop` | Main Road | Franz Josef Glacier Carpark | Alta | Parcheggio camminata ghiacciaio |
| Day 11 (8 dic) | `d11-5` | 19:00 | Haka House Franz Josef | `hotel` | 2/4 Cron Street, Franz Josef | ❌ Assente | - | `hotel-event` | Glacier Carpark | 2 Cron Street, Franz Josef | Alta | Alloggio overnight |
| **Day 12 (9 dic)**| `d12-1` | 08:30 | Fox Glacier Helihike | `sightseeing` | Salita in elicottero | ❌ Assente | - | `driving-stop` | Haka House Franz Josef | 44 Main Road, Fox Glacier | Alta | Base elicotteri con indirizzo |
| Day 12 (9 dic) | `d12-2` | 15:00 | Lake Matheson Walk | `sightseeing` | Specchio riflesso Monte Cook | ❌ Assente | - | `driving-stop` | 44 Main Road | Lake Matheson Road | Alta | Lago riflesso |
| Day 12 (9 dic) | `d12-3` | 18:00 | Ivorytowers Accommodation | `hotel` | 33/35 Sullivans Road, Fox | ❌ Assente | - | `hotel-event` | Lake Matheson | 33 Sullivans Rd, Fox Glacier | Alta | Alloggio overnight |
| **Day 13 (10 dic)**|`d13-0` | 08:30 | Partenza da Ivory Towers | `sightseeing` | 33/35 Sullivans Road, Fox | ❌ Assente | - | `driving-stop` | 33 Sullivans Rd | 33 Sullivans Rd | Alta | Partenza alloggio |
| Day 13 (10 dic)| `d13-1` | 09:00 | Lake Matheson | `sightseeing` | Lake Matheson Road | ❌ Assente | - | `driving-stop` | 33 Sullivans Rd | Lake Matheson Road | Alta | Lago panoramico |
| Day 13 (10 dic)| `d13-2` | 12:00 | Haast Pass | `sightseeing` | West Coast 9382 | ❌ Assente | - | `driving-stop` | Lake Matheson | Haast Pass | Alta | Passo di montagna |
| Day 13 (10 dic)| `d13-3` | 12:15 | Fantail Falls | `sightseeing` | Cascata su Haast Pass | ❌ Assente | - | `driving-stop` | Haast Pass | Fantail Falls | Alta | Cascata stradale |
| Day 13 (10 dic)| `d13-4` | 13:30 | Blue Pools | `sightseeing` | Blue Pools Track, Otago | ❌ Assente | - | `driving-stop` | Fantail Falls | Blue Pools Track | Alta | Pozze cristalline |
| Day 13 (10 dic)| `d13-5` | 15:00 | Wanaka | `sightseeing` | Lake Wanaka, Nuova Zelanda | ❌ Assente | - | `driving-stop` | Blue Pools | Lake Wanaka | Alta | Lago e cittadina |
| Day 13 (10 dic)| `d13-6` | 15:30 | Roy's Peak Lookout | `sightseeing` | 2 Glendhu Bay Road | ❌ Assente | - | `driving-stop` | Lake Wanaka | 2 Glendhu Bay Road | Alta | Punto panoramico trekking |
| Day 13 (10 dic)| `d13-7` | 17:30 | Cardrona Hotel | `hotel` | Cardrona Valley Road | ❌ Assente | - | `hotel-event` | 2 Glendhu Bay Rd | Cardrona Valley Road | Alta | Hotel storico overnight |
| **Day 14 (11 dic)**|`d14-1` | 09:00 | Avvicinamento Milford Sound | `transport` | Viaggio attraverso Eglinton Valley | ❌ Assente | - | `road-transport` | Cardrona | Eglinton Valley | Alta | Spostamento guidato su strada |
| Day 14 (11 dic)| `d14-2` | 18:00 | Knobs Flat Accommodation | `hotel` | Eglinton Valley | ❌ Assente | - | `hotel-event` | Eglinton Valley | Knobs Flat, Milford Road | Alta | Alloggio overnight |
| **Day 15 (12 dic)**|`d15-1` | 10:00 | Milford Sound Cruise | `sightseeing` | Crociera panoramica fiordi | ❌ Assente | - | `driving-stop` | Knobs Flat | Milford Sound Visitor Terminal | Alta | Terminal crociere nei fiordi |
| Day 15 (12 dic)| `d15-2` | 15:00 | Milford Sound → Queenstown | `transport` | Rientro verso Queenstown | ❌ Assente | - | `road-transport` | Milford Sound | Arrowtown | Alta | Spostamento guidato su strada |
| Day 15 (12 dic)| `d15-3` | 19:00 | Arrowtown Lodge | `hotel` | Arrowtown, Queenstown Area | ❌ Assente | - | `hotel-event` | Queenstown | Arrowtown | Alta | Alloggio overnight |
| **Day 16 (13 dic)**|`d16-1` | 10:00 | Arrowtown → Lake Tekapo | `transport` | Spostamento laghi turchesi | ❌ Assente | - | `road-transport` | Arrowtown | Lake Tekapo | Alta | Spostamento guidato su strada |
| Day 16 (13 dic)| `d16-2` | 21:00 | Stargazing Monte John | `sightseeing` | Cielo stellato UNESCO Tekapo | ❌ Assente | - | `driving-stop` | Lake Tekapo | Dark Sky Project, Tekapo | Alta | Osservatorio astronomico |
| Day 16 (13 dic)| `d16-3` | 23:00 | Fairlie Holiday Park / Lodge | `hotel` | Lake Tekapo Area | ❌ Assente | - | `hotel-event` | Dark Sky Project | Fairlie Holiday Park | Alta | Alloggio overnight |
| **Day 17 (14 dic)**|`d17-1` | 10:00 | Lake Tekapo → CHC Airport | `transport` | Rilascio auto in aeroporto | ❌ Assente | `tr-rent-nz-snap` | `road-transport` | Fairlie / Tekapo | Christchurch Airport | Alta | Rilascio auto noleggio NZ |
| Day 17 (14 dic)| `d17-2` | 18:20 | Volo Christchurch CHC → ADL | `transport` | Air New Zealand NZ261 | ❌ Assente | `tr-flight-chc-adl` | `non-driving-transport` | Christchurch CHC | Adelaide ADL | Alta | Volo aereo internazionale (INTERROMPE GUIDA) |
| Day 17 (14 dic)| `d17-3` | 20:25 | Arrivo Adelaide | `transport` | Ritiro auto e check-in | ❌ Assente | `tr-rent-au-eastcoast`| `road-transport` | Adelaide Airport | Jacksons Motor Inn | Alta | Ritiro auto noleggio AU |
| **Day 18 (15 dic)**|`d18-1` | 08:00 | Adelaide → Cape Jervis Ferry | `transport` | Traghetto auto e viaggio | ❌ Assente | - | `non-driving-transport` | Adelaide | Cape Jervis / Kangaroo Island | Alta | Traghetto marittimo auto per l'isola |
| Day 18 (15 dic)| `d18-2` | 13:00 | Flinders Chase National Park | `sightseeing` | Remarkable Rocks, Admiral's Arch | ❌ Assente | - | `driving-stop` | Penneshaw / Cape Jervis | Flinders Chase NP | Alta | Parco nazionale su isola |
| Day 18 (15 dic)| `d18-3` | 19:00 | Kangaroo Island Retreat | `hotel` | Flinders Chase Area | ❌ Assente | - | `hotel-event` | Flinders Chase NP | Kangaroo Island Retreat | Alta | Alloggio overnight |
| **Day 19 (16 dic)**|`d19-1` | 15:00 | Rientro ad Adelaide Airport | `sightseeing` | Rilascio auto | ❌ Assente | `tr-rent-au-eastcoast`| `road-transport` | Kangaroo Island | Adelaide Airport | Alta | Rilascio auto noleggio Adelaide |
| Day 19 (16 dic)| `d19-2` | 19:00 | Volo Adelaide ADL → MEL | `transport` | Virgin Australia VA218 | ❌ Assente | `tr-flight-adl-mel` | `non-driving-transport` | Adelaide ADL | Melbourne MEL | Alta | Volo aereo domestico AU (INTERROMPE GUIDA) |
| Day 19 (16 dic)| `d19-3` | 20:45 | Arrivo Melbourne | `transport` | Ritiro Van camperizzato | ❌ Assente | `tr-rent-au-van` | `road-transport` | Melbourne Airport | Melbourne Camper Park | Alta | Ritiro Van camperizzato |
| **Day 20 (17 dic)**|`d20-1` | 09:00 | Melbourne → Great Ocean Road | `sightseeing` | Partenza viaggio on-road | ❌ Assente | - | `road-transport` | Melbourne | Geelong / Great Ocean Rd | Alta | Inizio Great Ocean Road in Van |
| Day 20 (17 dic)| `d20-2` | 16:00 | Dodici Apostoli (12 Apostles) | `sightseeing` | Tramonto sulla Great Ocean Road | ❌ Assente | - | `driving-stop` | Geelong | Twelve Apostles, Port Campbell | Alta | Faraglioni panoramici |
| Day 20 (17 dic)| `d20-3` | 19:00 | 12 Apostles Campground | `hotel` | Port Campbell area | ❌ Assente | - | `hotel-event` | Twelve Apostles | 12 Apostles Campground | Alta | Campeggio overnight |
| **Day 21 (18 dic)**|`d21-1` | 09:00 | 12 Apostoli → Melbourne | `transport` | Strada panoramica via Costa | ❌ Assente | - | `road-transport` | Port Campbell | Melbourne | Alta | Guida di rientro via costa |
| Day 21 (18 dic)| `d21-2` | 16:00 | Melbourne City tour | `sightseeing` | Hosier Lane e lungofiume Yarra | ❌ Assente | - | `driving-stop` | Melbourne | Hosier Lane, Melbourne | Alta | Tour urbano |
| Day 21 (18 dic)| `d21-3` | 19:00 | Melbourne Tourist Park | `hotel` | Melbourne Area | ❌ Assente | - | `hotel-event` | Hosier Lane | Melbourne Tourist Park | Alta | Campeggio overnight |
| **Day 22 (19 dic)**|`d22-1` | 10:00 | Melbourne → Phillip Island | `transport` | Trasferimento isola pinguini | ❌ Assente | - | `road-transport` | Melbourne | Phillip Island | Alta | Guida verso l'isola collegata da ponte |
| Day 22 (19 dic)| `d22-2` | 20:00 | Penguin Parade | `sightseeing` | Parata pinguini nani | ❌ Assente | - | `driving-stop` | Phillip Island | Penguin Parade Visitor Centre | Alta | Parco pinguini |
| Day 22 (19 dic)| `d22-3` | 22:00 | Tidal Campground | `hotel` | Phillip Island | ❌ Assente | - | `hotel-event` | Penguin Parade | Tidal Campground | Alta | Campeggio overnight |
| **Day 23 (20 dic)**|`d23-1` | 08:00 | Wilsons Promontory NP hikes | `sightseeing` | Spiagge e percorsi naturali | ❌ Assente | - | `driving-stop` | Phillip Island | Wilsons Promontory NP | Alta | Parco nazionale e percorsi |
| Day 23 (20 dic)| `d23-2` | 19:00 | Wilson Promontory Campsite | `hotel` | Wilson Promontory | ❌ Assente | - | `hotel-event` | Wilsons Promontory NP | Tidal River Campsite | Alta | Campeggio overnight |
| **Day 24 (21 dic)**|`d24-1` | 09:00 | Wilson Promontory → NSW Coast | `transport` | Trasferimento lungo la costa | ❌ Assente | - | `road-transport` | Wilsons Promontory | NSW Coast | Alta | Guida a lunga distanza |
| Day 24 (21 dic)| `d24-2` | 18:00 | Mid-way Coast Camping | `hotel` | NSW Coast | ❌ Assente | - | `hotel-event` | NSW Coast | Mid-way Coast Camping | Alta | Campeggio overnight |
| **Day 25 (22 dic)**|`d25-1` | 09:00 | NSW Coast → Jervis Bay | `transport` | Arrivo alla baia di Jervis | ❌ Assente | - | `road-transport` | NSW Coast | Jervis Bay | Alta | Guida verso Jervis Bay |
| Day 25 (22 dic)| `d25-2` | 15:00 | Hyams Beach | `sightseeing` | Spiaggia di sabbia bianca | ❌ Assente | - | `driving-stop` | Jervis Bay | Hyams Beach | Alta | Spiaggia panoramica |
| Day 25 (22 dic)| `d25-3` | 19:00 | Jervis Bay Holiday Park | `hotel` | Jervis Bay | ❌ Assente | - | `hotel-event` | Hyams Beach | Jervis Bay Holiday Park | Alta | Campeggio overnight |
| **Day 26 (23 dic)**|`d26-1` | 10:00 | Dolphin Watching Tour | `sightseeing` | Tour in barca avvistamento delfini | ❌ Assente | - | `driving-stop` | Jervis Bay Holiday Park | 58 Owen Street, Huskisson | Alta | Ufficio tour con indirizzo esatto |
| Day 26 (23 dic)| `d26-2` | 19:00 | Jervis Bay Cabin | `hotel` | Jervis Bay | ❌ Assente | - | `hotel-event` | 58 Owen Street | Jervis Bay Cabin | Alta | Alloggio overnight |
| **Day 27 (24 dic)**|`d27-1` | 09:00 | Jervis Bay → Blue Mountains | `transport` | Spostamento verso montagne blu | ❌ Assente | - | `road-transport` | Jervis Bay | Katoomba, Blue Mountains | Alta | Guida verso le montagne |
| Day 27 (24 dic)| `d27-2` | 14:00 | Tre Sorelle & Katoomba | `sightseeing` | Punti panoramici Blue Mountains | ❌ Assente | - | `driving-stop` | Katoomba | Echo Point, Three Sisters | Alta | Punto panoramico |
| Day 27 (24 dic)| `d27-3` | 18:00 | Katoomba Campsite | `hotel` | Blue Mountains | ❌ Assente | - | `hotel-event` | Echo Point | Katoomba Campsite | Alta | Campeggio overnight |
| **Day 28 (25 dic)**|`d28-1` | 09:00 | Consegna Van a Sydney | `sightseeing` | Fine noleggio camper | ❌ Assente | `tr-rent-au-van` | `road-transport` | Katoomba | 1C McPherson St, Banksmeadow | Alta | Rilascio camper Banksmeadow |
| Day 28 (25 dic)| `d28-2` | 13:00 | Sydney Opera House & The Rocks| `sightseeing` | Esplorazione a piedi del porto | ❌ Assente | - | `driving-stop` | Banksmeadow | Sydney Opera House | Alta | Attrazione turistica |
| Day 28 (25 dic)| `d28-3` | 18:00 | Sydney Central Hotel | `hotel` | Sydney CBD | ❌ Assente | - | `hotel-event` | Sydney Opera House | Hotel Challis Potts Point | Alta | Hotel overnight |
| **Day 29 (26 dic)**|`d29-1` | 10:00 | Corso Surf Bondi Beach | `sightseeing` | Lezione di surf a Bondi Beach | ❌ Assente | - | `driving-stop` | Potts Point | Bondi Beach, Sydney | Alta | Spiaggia celebre |
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

## 3. Tabella di Tutti i Trasporti Classificati (`transports.json`)

| ID Trasporto | Data | Tipo | Da (From) | A (To) | MapsUrl | Durata | Tipo Segmento | Attività Collegate | Associazione Attuale | Note & Segnalazioni Critiche |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `tr-train-1` | 2026-11-28 | `train` | Roma Termini | Milano Centrale | ✅ Presente | 3h 10m | **Ferroviario** | `d1-1` | Certa (Testo + Data) | ⚠️ **Treno Alta Velocità**. Non deve essere calcolato come rotta stradale auto Roma-Milano! |
| `tr-flight-mxp-akl`| 2026-11-29 | `plane` | Milano MXP | Auckland AKL | ❌ Assente | 18h 35m (scalo) | **Aereo** | `d2-1`, `d3-1`, `d3-5`, `d3-6` | Certa (Testo + Data) | ✈️ **Volo Intercontinentale**. Scalo 18h 35m a Pechino PEK. Interrompe qualsiasi calcolo guidabile. |
| `tr-ferry-wlg-pic` | 2026-12-06 | `ferry` | Wellington | Picton | ❌ Assente | 3h 45m | **Marittimo** | `d9-1`, `d9-2` | Certa (Testo + Data) | 🚢 **Traghetto Marittimo Stretto di Cook** tra Isola Nord e Isola Sud. Non guidabile in auto! |
| `tr-flight-chc-adl`| 2026-12-15 | `plane` | Christchurch CHC | Adelaide ADL | ❌ Assente | 2h 10m | **Aereo** | `d17-2` | Certa (Testo + Data) | ✈️ **Volo Internazionale NZ ➔ AU**. Interrompe il routing stradale tra le due nazioni. |
| `tr-flight-adl-mel`| 2026-12-16 | `plane` | Adelaide ADL | Melbourne MEL | ❌ Assente | 1h 50m | **Aereo** | `d19-2` | Certa (Testo + Data) | ✈️ **Volo Domestico AU**. Interrompe la sequenza tra Adelaide e Melbourne. |
| `tr-flight-syd-mnl`| 2026-12-27 | `plane` | Sydney SYD | Caticlan MPH | ❌ Assente | 7h 55m | **Aereo** | `d30-1`, `d33-1` | Certa (Testo + Data) | ✈️ **Volo Internazionale AU ➔ PH** (via Manila). Interrompe la sequenza stradale. |
| `tr-flight-mph-eni`| 2027-01-01 | `plane` | Caticlan MPH | El Nido ENI | ❌ Assente | 1h 10m | **Aereo** | `d35-1` | Certa (Testo + Data) | ✈️ **Volo Domestico PH (Tra Isole)**. Interrompe la sequenza stradale. |
| `tr-flight-usu-ceb`| 2027-01-08 | `plane` | Busuanga USU | Cebu CEB | ❌ Assente | 1h 15m | **Aereo** | `d41-1` | Certa (Testo + Data) | ✈️ **Volo Domestico PH (Tra Isole)**. Interrompe la sequenza stradale. |
| `tr-flight-ceb-fco`| 2027-01-09 | `plane` | Cebu CEB | Roma FCO | ❌ Assente | 17h 35m | **Aereo** | `d43-1` | Certa (Testo + Data) | ✈️ **Volo Intercontinentale Rientro PH ➔ IT**. Interrompe la sequenza stradale. |
| `tr-rent-nz-snap` | 2026-12-01 | `car` | Auckland Parnell | Christchurch Airport | ❌ Assente | 14 giorni | **Stradale (Noleggio)** | `d4-1`, `d5-1` → `d17-1` | Certa (Date inizio/fine) | 🚗 **Auto a Noleggio NZ**. Copre tutti gli spostamenti dell'Isola Nord e dell'Isola Sud. |
| `tr-rent-au-eastcoast`|2026-12-14 | `car` | Adelaide Airport | Adelaide Airport | ❌ Assente | 2 giorni | **Stradale (Noleggio)** | `d17-3`, `d18-1`, `d19-1` | Certa (Date inizio/fine) | 🚗 **Auto a Noleggio Adelaide & Kangaroo Island**. |
| `tr-rent-au-van` | 2026-12-17 | `car` | Melbourne Tullamarine | Sydney Banksmeadow | ❌ Assente | 12 giorni | **Stradale (Noleggio Camper)**| `d19-3`, `d20-1` → `d28-1` | Certa (Date inizio/fine) | 🚐 **Van Camperizzato Australia**. Copre Great Ocean Road, Phillip Island, Wilsons Promontory, Jervis Bay e Blue Mountains. |

---

## 4. Sequenza Geografica di Ogni Giornata

Di seguito la sequenza geografica reale nodo per nodo per tutti i **44 giorni di viaggio**:

```text
=== GIORNO 1 (2026-11-28) ===
[NESSUN HOTEL PRECEDENTE]
→ [d1-1: Roma Termini → Milano Centrale] (Ferroviario - NO AUTO)
→ [d1-hotel: Check-in a&o Hostel Milano Ca Granda] (Hotel)
→ [d1-2: Duomo & Galleria Vittorio Emanuele II] (Guida auto / Taxi / Mezzi: SÌ)
→ [d1-3: Cena a Milano (Brera)] (Guida auto: SÌ)
→ [d1-hotel: a&o Hostel Milano Ca Granda] (Hotel)
• Collegamenti Auto da Calcolare: 
  - a&o Hostel Milano ➔ Duomo Milano (SÌ · ~6 km)
  - Duomo Milano ➔ Cena a Milano Brera (SÌ · ~2 km)

=== GIORNO 2 (2026-11-29) ===
[a&o Hostel Milano Ca Granda]
→ [d2-0: Check-out Hostel Milano] (Hotel)
→ [d2-1: Volo Milano MXP → Pechino PEK] (Aereo - NO AUTO)
• Collegamenti Auto da Calcolare: ZERO (Interrotto da volo aereo)

=== GIORNO 3 (2026-11-30) ===
[IN VOLO / NESSUN HOTEL]
→ [d3-1: Arrivo Pechino PEK] (Aereo)
→ [d3-taxi1: Taxi PEK → Muraglia Cinese Badaling] (Taxi Stradale: SÌ · ~75 km)
→ [d3-2: Muraglia Cinese Badaling] (Attrazione)
→ [d3-taxi2: Taxi Muraglia → Piazza Tiananmen] (Taxi Stradale: SÌ · ~70 km)
→ [d3-3: Pranzo Qianmen Street] (Ristorante)
→ [d3-4: Piazza Tiananmen e Città Proibita] (Attrazione)
→ [d3-taxi3: Taxi Tiananmen → Aeroporto PEK T3] (Taxi Stradale: SÌ · ~30 km)
→ [d3-5: Check-in volo PEK → AKL] (Aereo)
→ [d3-6: Volo PEK → Auckland AKL] (Aereo - NO AUTO)
• Collegamenti Auto/Taxi da Calcolare:
  - PEK Terminal 3 ➔ Badaling Great Wall (SÌ)
  - Badaling ➔ Piazza Tiananmen (SÌ)
  - Tiananmen ➔ PEK Terminal 3 (SÌ)

=== GIORNO 4 (2026-12-01) ===
[IN VOLO / NESSUN HOTEL]
→ [d4-1: Arrivo Auckland AKL & Ritiro Auto] (Arrivo)
→ [d4-2: Check-in Noa Hotel Auckland] (Hotel)
• Collegamenti Auto da Calcolare: 
  - Auckland Airport ➔ Noa Hotel Auckland (SÌ · ~21 km)

=== GIORNO 5 (2026-12-02) ===
[Noa Hotel Auckland]
→ [d5-1: Ritiro auto Auckland Airport] (Partenza)
→ [d5-2: Hamilton Gardens] (Guida auto: SÌ · ~115 km)
→ [d5-3: Otorohanga Kiwi House] (Guida auto: SÌ · ~50 km)
→ [d5-4: Mangapohue Natural Bridge] (Guida auto: SÌ · ~35 km)
→ [d5-5: Waitomo Glowworm Caves] (Guida auto: SÌ · ~25 km)
→ [d5-6: Waitomo Village Chalets] (Hotel) (Guida auto: SÌ · ~3 km)
• Collegamenti Auto da Calcolare: ALL 5 SEGMENTS (100% Guidabile)

=== GIORNO 6 (2026-12-03) ===
[Waitomo Village Chalets]
→ [d6-1: Hobbiton Movie Set] (Guida auto: SÌ · ~90 km)
→ [d6-2: Big Dog and Sheep Tirau] (Guida auto: SÌ · ~35 km)
→ [d6-3: Te Waihou Blue Spring] (Guida auto: SÌ · ~15 km)
→ [d6-4: Mitai Maori Village Rotorua] (Guida auto: SÌ · ~50 km)
→ [d6-5: Wylie Court Motor Lodge Rotorua] (Hotel) (Guida auto: SÌ · ~5 km)
• Collegamenti Auto da Calcolare: ALL 5 SEGMENTS (100% Guidabile)

=== GIORNO 7 (2026-12-04) ===
[Wylie Court Motor Lodge Rotorua]
→ [d7-1: Redwoods Treewalk Rotorua] (Guida auto: SÌ · ~4 km)
→ [d7-2: Polynesian Spa Rotorua] (Guida auto: SÌ · ~3 km)
→ [d7-3: Waiotapu Thermal Wonderland] (Guida auto: SÌ · ~30 km)
→ [d7-4: Wairakei Terraces] (Guida auto: SÌ · ~45 km)
→ [d7-5: Cascate Huka Taupo] (Guida auto: SÌ · ~5 km)
→ [d7-6: Skotel Alpine Resort Tongariro] (Hotel) (Guida auto: SÌ · ~95 km)
• Collegamenti Auto da Calcolare: ALL 6 SEGMENTS (100% Guidabile)

=== GIORNO 8 (2026-12-05) ===
[Skotel Alpine Resort Tongariro]
→ [d8-1: Trekking Tongariro Alpine Crossing] (Attrazione)
→ [d8-2: Spostamento a Levin] (Guida auto: SÌ · ~210 km)
→ [d8-3: Totara Lodge Motel Levin] (Hotel) (Guida auto: SÌ · ~3 km)
• Collegamenti Auto da Calcolare: 
  - Skotel Alpine Resort ➔ Tongariro Alpine Crossing (SÌ)
  - Tongariro ➔ Totara Lodge Motel Levin (SÌ)

=== GIORNO 9 (2026-12-06) ===
[Totara Lodge Motel Levin]
→ [d9-0: Partenza da Levin verso Wellington] (Guida auto: SÌ · ~95 km)
→ [d9-1a: Museum Te Papa Tongarewa Wellington] (Attrazione)
→ [d9-1: Traghetto Wellington → Picton] (TRAGHETTO MARITTIMO - NO AUTO STRADALE)
→ [d9-2: Arrivo Picton · Marlborough Sounds] (Sbarco)
→ [d9-3: Kaikoura Seaside Lodge] (Hotel) (Guida auto: SÌ · ~155 km)
• Collegamenti Auto da Calcolare:
  - Totara Lodge Levin ➔ Te Papa Museum Wellington (SÌ)
  - Te Papa Museum ➔ Wellington Ferry Terminal (SÌ)
  - [INTERRUZIONE MARITTIMA TRAGHETTO WLG➔PIC: NO GUIDA STRADALE]
  - Picton Ferry Terminal ➔ Kaikoura Seaside Lodge (SÌ)

=== GIORNO 10 (2026-12-07) ===
[Kaikoura Seaside Lodge]
→ [d10-whale: Whale Watch Kaikoura] (Guida auto: SÌ · ~2 km)
→ [d10-1: Kaikoura → Arthur Pass] (Guida auto: SÌ · ~300 km)
→ [d10-2: Otira Stagecoach Hotel] (Hotel) (Guida auto: SÌ · ~15 km)
• Collegamenti Auto da Calcolare: ALL 3 SEGMENTS (100% Guidabile)

=== GIORNO 11 (2026-12-08) ===
[Otira Stagecoach Hotel]
→ [d11-0: Otira Viaduct Lookout] (Guida auto: SÌ · ~5 km)
→ [d11-1: Hokitika Town] (Guida auto: SÌ · ~75 km)
→ [d11-2: Hokitika Gorge] (Guida auto: SÌ · ~33 km)
→ [d11-3: Sosta pranzo Franz Josef] (Guida auto: SÌ · ~135 km)
→ [d11-4: Franz Josef Glacier Walk] (Guida auto: SÌ · ~5 km)
→ [d11-5: Haka House Franz Josef] (Hotel) (Guida auto: SÌ · ~3 km)
• Collegamenti Auto da Calcolare: ALL 6 SEGMENTS (100% Guidabile)

=== GIORNO 12 (2026-12-09) ===
[Haka House Franz Josef]
→ [d12-1: Fox Glacier Helihike] (Guida auto: SÌ · ~25 km)
→ [d12-2: Lake Matheson Walk] (Guida auto: SÌ · ~6 km)
→ [d12-3: Ivorytowers Accommodation Fox] (Hotel) (Guida auto: SÌ · ~5 km)
• Collegamenti Auto da Calcolare: ALL 3 SEGMENTS (100% Guidabile)

=== GIORNO 13 (2026-12-10) ===
[Ivorytowers Accommodation Fox]
→ [d13-0: Partenza Fox Glacier] (Partenza)
→ [d13-1: Lake Matheson] (Guida auto: SÌ · ~6 km)
→ [d13-2: Haast Pass] (Guida auto: SÌ · ~120 km)
→ [d13-3: Fantail Falls] (Guida auto: SÌ · ~10 km)
→ [d13-4: Blue Pools] (Guida auto: SÌ · ~15 km)
→ [d13-5: Wanaka] (Guida auto: SÌ · ~75 km)
→ [d13-6: Roy's Peak Lookout] (Guida auto: SÌ · ~7 km)
→ [d13-7: Cardrona Hotel] (Hotel) (Guida auto: SÌ · ~25 km)
• Collegamenti Auto da Calcolare: ALL 7 SEGMENTS (100% Guidabile)

=== GIORNO 14 (2026-12-11) ===
[Cardrona Hotel]
→ [d14-1: Avvicinamento Milford Sound (Eglinton Valley)] (Guida auto: SÌ · ~240 km)
→ [d14-2: Knobs Flat Accommodation Eglinton] (Hotel) (Guida auto: SÌ · ~10 km)
• Collegamenti Auto da Calcolare: ALL 2 SEGMENTS (100% Guidabile)

=== GIORNO 15 (2026-12-12) ===
[Knobs Flat Accommodation Eglinton]
→ [d15-1: Milford Sound Cruise] (Guida auto: SÌ · ~60 km)
→ [d15-2: Milford Sound → Queenstown → Arrowtown] (Guida auto: SÌ · ~280 km)
→ [d15-3: Arrowtown Lodge] (Hotel) (Guida auto: SÌ · ~5 km)
• Collegamenti Auto da Calcolare: ALL 3 SEGMENTS (100% Guidabile)

=== GIORNO 16 (2026-12-13) ===
[Arrowtown Lodge]
→ [d16-1: Arrowtown → Lake Tekapo] (Guida auto: SÌ · ~240 km)
→ [d16-2: Stargazing Monte John Observatory] (Guida auto: SÌ · ~5 km)
→ [d16-3: Fairlie Holiday Park] (Hotel) (Guida auto: SÌ · ~40 km)
• Collegamenti Auto da Calcolare: ALL 3 SEGMENTS (100% Guidabile)

=== GIORNO 17 (2026-12-14) ===
[Fairlie Holiday Park]
→ [d17-1: Lake Tekapo → Christchurch Airport] (Guida auto: SÌ · ~220 km)
→ [d17-2: Volo Christchurch CHC → Adelaide ADL] (VOLO AEREO INTERNAZIONALE - NO AUTO)
→ [d17-3: Arrivo Adelaide & Check-in] (Auto noleggio AU / Taxi: SÌ · ~10 km)
→ [Jacksons Motor Inn Adelaide] (Hotel)
• Collegamenti Auto da Calcolare:
  - Fairlie Holiday Park ➔ Christchurch Airport (SÌ)
  - [INTERRUZIONE VOLO CHC➔ADL: NO GUIDA STRADALE]
  - Adelaide Airport ➔ Jacksons Motor Inn (SÌ)

=== GIORNO 18 (2026-12-15) ===
[Jacksons Motor Inn Adelaide]
→ [d18-1: Adelaide → Cape Jervis Ferry → Kangaroo Island] (Traghetto Auto: SÌ)
→ [d18-2: Flinders Chase National Park] (Guida auto: SÌ · ~100 km)
→ [d18-3: Kangaroo Island Wilderness Retreat] (Hotel) (Guida auto: SÌ · ~10 km)
• Collegamenti Auto da Calcolare: 
  - Jacksons Motor Inn ➔ Cape Jervis Ferry Terminal (SÌ)
  - Penneshaw Ferry Terminal ➔ Flinders Chase NP (SÌ)

=== GIORNO 19 (2026-12-16) ===
[Kangaroo Island Wilderness Retreat]
→ [d19-1: Rientro ad Adelaide Airport] (Guida auto + Traghetto: SÌ)
→ [d19-2: Volo Adelaide ADL → Melbourne MEL] (VOLO AEREO DOMESTICO - NO AUTO)
→ [d19-3: Arrivo Melbourne & Ritiro Van] (Auto/Van: SÌ)
• Collegamenti Auto da Calcolare:
  - Kangaroo Island ➔ Adelaide Airport (SÌ)
  - [INTERRUZIONE VOLO ADL➔MEL: NO GUIDA STRADALE]
  - Melbourne Airport ➔ Melbourne Tourist Park (SÌ)

=== GIORNO 20 (2026-12-17) ===
[Melbourne Tourist Park]
→ [d20-1: Melbourne → Geelong → Great Ocean Road] (Guida Van: SÌ · ~75 km)
→ [d20-2: Dodici Apostoli (12 Apostles)] (Guida Van: SÌ · ~180 km)
→ [d20-3: 12 Apostles Campground] (Hotel/Camp) (Guida Van: SÌ · ~5 km)
• Collegamenti Auto da Calcolare: ALL 3 SEGMENTS (100% Guidabile)

=== GIORNO 21 (2026-12-18) ===
[12 Apostles Campground]
→ [d21-1: 12 Apostoli → Melbourne via Costa] (Guida Van: SÌ · ~250 km)
→ [d21-2: Melbourne City tour (Hosier Lane)] (Guida Van / A piedi: SÌ)
→ [d21-3: Melbourne Tourist Park] (Hotel/Camp) (Guida Van: SÌ · ~12 km)
• Collegamenti Auto da Calcolare: ALL 3 SEGMENTS (100% Guidabile)

=== GIORNO 22 (2026-12-19) ===
[Melbourne Tourist Park]
→ [d22-1: Melbourne → Phillip Island] (Guida Van: SÌ · ~140 km)
→ [d22-2: Penguin Parade Phillip Island] (Guida Van: SÌ · ~15 km)
→ [d22-3: Tidal Campground Phillip Island] (Hotel/Camp) (Guida Van: SÌ · ~10 km)
• Collegamenti Auto da Calcolare: ALL 3 SEGMENTS (100% Guidabile)

=== GIORNO 23 (2026-12-20) ===
[Tidal Campground Phillip Island]
→ [d23-1: Wilsons Promontory NP hikes] (Guida Van: SÌ · ~130 km)
→ [d23-2: Wilson Promontory Campsite] (Hotel/Camp) (Guida Van: SÌ · ~5 km)
• Collegamenti Auto da Calcolare: ALL 2 SEGMENTS (100% Guidabile)

=== GIORNO 24 (2026-12-21) ===
[Wilson Promontory Campsite]
→ [d24-1: Wilson Promontory → NSW Coast] (Guida Van: SÌ · ~450 km)
→ [d24-2: Mid-way Coast Camping] (Hotel/Camp) (Guida Van: SÌ · ~10 km)
• Collegamenti Auto da Calcolare: ALL 2 SEGMENTS (100% Guidabile)

=== GIORNO 25 (2026-12-22) ===
[Mid-way Coast Camping]
→ [d25-1: NSW Coast → Jervis Bay] (Guida Van: SÌ · ~280 km)
→ [d25-2: Hyams Beach Jervis Bay] (Guida Van: SÌ · ~15 km)
→ [d25-3: Jervis Bay Holiday Park] (Hotel/Camp) (Guida Van: SÌ · ~8 km)
• Collegamenti Auto da Calcolare: ALL 3 SEGMENTS (100% Guidabile)

=== GIORNO 26 (2026-12-23) ===
[Jervis Bay Holiday Park]
→ [d26-1: Dolphin Watching Tour Huskisson] (Guida Van: SÌ · ~10 km)
→ [d26-2: Jervis Bay Cabin] (Hotel/Camp) (Guida Van: SÌ · ~5 km)
• Collegamenti Auto da Calcolare: ALL 2 SEGMENTS (100% Guidabile)

=== GIORNO 27 (2026-12-24) ===
[Jervis Bay Cabin]
→ [d27-1: Jervis Bay → Blue Mountains] (Guida Van: SÌ · ~220 km)
→ [d27-2: Tre Sorelle & Katoomba] (Guida Van: SÌ · ~15 km)
→ [d27-3: Katoomba Campsite] (Hotel/Camp) (Guida Van: SÌ · ~4 km)
• Collegamenti Auto da Calcolare: ALL 3 SEGMENTS (100% Guidabile)

=== GIORNO 28 (2026-12-25) ===
[Katoomba Campsite]
→ [d28-1: Consegna Van a Sydney Banksmeadow] (Guida Van: SÌ · ~110 km)
→ [d28-2: Sydney Opera House & The Rocks] (Taxi/Mezzi: SÌ · ~12 km)
→ [d28-3: Sydney Central Hotel (Potts Point)] (Hotel) (Taxi/A piedi: SÌ)
• Collegamenti Auto/Taxi da Calcolare: ALL 3 SEGMENTS

=== GIORNO 29 (2026-12-26) ===
[Hotel Challis Potts Point Sydney]
→ [d29-1: Corso Surf Bondi Beach] (Taxi/Mezzi: SÌ · ~7 km)
→ [d29-2: Bondi to Coogee Coastal Walk] (A piedi: ~6 km)
→ [d29-3: Sydney Central Hotel (Potts Point)] (Hotel) (Taxi/Mezzi: SÌ)
• Collegamenti Auto/Taxi da Calcolare: ALL 3 SEGMENTS

=== GIORNO 30 (2026-12-27) ===
[Hotel Challis Potts Point Sydney]
→ [d30-1: Volo Sydney SYD → Manila MNL] (VOLO AEREO INTERNAZIONALE - NO AUTO)
→ [d30-2: Arrivo Manila MNL] (Arrivo)
→ [d30-3: Manila Transit Hotel] (Hotel)
• Collegamenti Auto da Calcolare: ZERO (Interrotto da volo aereo)

=== GIORNO 31 (2026-12-28) ===
[Manila Transit Hotel]
→ [d31-1: Giro storico Intramuros & Rizal Park] (Taxi/Grab: SÌ · ~10 km)
→ [d31-2: Manila Transit Hotel] (Hotel) (Taxi/Grab: SÌ)
• Collegamenti Auto/Taxi da Calcolare: ALL 2 SEGMENTS

=== GIORNO 32 (2026-12-29) ===
[Manila Transit Hotel]
→ [d32-1: Relax & Preparazione Boracay] (Interno alloggio)
→ [d32-2: Manila Transit Hotel] (Hotel)
• Collegamenti Auto da Calcolare: ZERO (Stesso luogo)

=== GIORNO 33 (2026-12-30) ===
[Manila Transit Hotel]
→ [d33-1: Volo Manila MNL → Caticlan MPH] (VOLO AEREO INTERNO - NO AUTO)
→ [d33-2: Transfer Barca Caticlan → Boracay] (TRASPORTO MARITTIMO - NO AUTO)
→ [d33-3: Check-in Boracay Resort] (Hotel)
• Collegamenti Auto da Calcolare: ZERO (Volo + Barca)

=== GIORNO 34 (2026-12-31) ===
[Bamboo Beach Resort Boracay]
→ [d34-1: Relax White Beach] (A piedi)
→ [d34-2: Cenone e Capodanno in spiaggia] (A piedi)
→ [d34-3: Boracay Resort] (Hotel)
• Collegamenti Auto da Calcolare: ZERO (Isola pedonale)

=== GIORNO 35 (2027-01-01) ===
[Bamboo Beach Resort Boracay]
→ [d35-1: Volo Caticlan MPH → El Nido ENI] (VOLO AEREO INTERISOLA - NO AUTO)
→ [d35-2: Arrivo El Nido & Transfer] (Tricycle / Van: SÌ · ~5 km)
→ [d35-3: El Nido Beach Hotel] (Hotel)
• Collegamenti Auto da Calcolare: 
  - El Nido Airport ➔ El Nido Beach Hotel (SÌ)

=== GIORNI 36 - 39 (2027-01-02 → 2027-01-05) ===
[El Nido Beach Hotel ➔ Spedizione Marittima Tao 4D3N ➔ Coron]
→ [SPEDIZIONE IN BARCA TRA ARCIPELAGHI REMOTE PALAWAN: NO GUIDA STRADALE AUTO]
• Collegamenti Auto da Calcolare: ZERO (Spedizione marittima interamente su barca tradizionale)

=== GIORNO 40 (2027-01-06) ===
[Coron Bay Hotel]
→ [d40-1: Dugong Watching Quest Busuanga] (Tour Barca / Van: SÌ · ~45 km)
→ [d40-2: Coron Bay Hotel] (Hotel)
• Collegamenti Auto/Van da Calcolare: ALL 2 SEGMENTS

=== GIORNO 41 (2027-01-07) ===
[Coron Bay Hotel]
→ [d41-1: Volo Busuanga USU → Cebu CEB] (VOLO AEREO INTERISOLA - NO AUTO)
→ [d41-2: Arrivo Cebu & Check-in] (Taxi: SÌ)
→ [d41-3: Cebu Airport Hotel] (Hotel)
• Collegamenti Auto da Calcolare:
  - Cebu CEB Airport ➔ Cebu Airport Hotel (SÌ · ~2 km)

=== GIORNO 42 (2027-01-08) ===
[Cebu Airport Hotel]
→ [d42-1: Giro città & Souvenir Cebu] (Taxi/Grab: SÌ · ~15 km)
→ [d42-2: Cebu Airport Hotel] (Hotel)
• Collegamenti Auto/Taxi da Calcolare: ALL 2 SEGMENTS

=== GIORNO 43 (2027-01-09) ===
[Cebu Airport Hotel]
→ [d43-1: Volo Cebu CEB → Taipei → Roma FCO] (VOLO INTERCONTINENTALE RIENTRO - NO AUTO)
• Collegamenti Auto da Calcolare: ZERO (Volo aereo)

=== GIORNO 44 (2027-01-10) ===
[IN VOLO]
→ [d44-1: Arrivo in Italia (Roma FCO)] (Fine viaggio)
• Collegamenti Auto da Calcolare: ZERO
```

---

## 5. Elenco delle Tratte che Dovrebbero Essere Calcolabili in Auto

Di seguito le **tratte stradali reali** che l'app deve poter calcolare in auto / van / taxi (quando i punti hanno coordinate o query valide):

1. **Giorno 1**:
   - `a&o Hostel Milano Ca Granda` ➔ `Piazza del Duomo, Milano` (~6 km)
   - `Piazza del Duomo` ➔ `Brera / Starita, Milano` (~2 km)
2. **Giorno 3 (Pechino Taxi)**:
   - `Beijing Capital Airport T3` ➔ `Badaling Great Wall` (~75 km)
   - `Badaling Great Wall` ➔ `Tiananmen Square, Pechino` (~70 km)
   - `Tiananmen Square` ➔ `Beijing Capital Airport T3` (~30 km)
3. **Giorno 4**:
   - `Auckland Airport` ➔ `Noa Hotel, Auckland CBD` (~21 km)
4. **Giorno 5 (Waitomo Roadtrip)**:
   - `Auckland Airport` ➔ `Hamilton Gardens, Hamilton` (~115 km)
   - `Hamilton Gardens` ➔ `Otorohanga Kiwi House (20 Alex Telfer Dr)` (~50 km)
   - `Otorohanga Kiwi House` ➔ `Mangapohue Natural Bridge (Te Anga Rd)` (~35 km)
   - `Mangapohue Natural Bridge` ➔ `Waitomo Glowworm Caves (39 Waitomo Village Rd)` (~25 km)
   - `Waitomo Glowworm Caves` ➔ `Waitomo Village Chalets` (~3 km)
5. **Giorno 6 (Rotorua Roadtrip)**:
   - `Waitomo Village Chalets` ➔ `Hobbiton Movie Set (501 Buckland Rd)` (~90 km)
   - `Hobbiton Movie Set` ➔ `Tirau i-SITE Visitor Centre` (~35 km)
   - `Tirau i-SITE` ➔ `Te Waihou Blue Spring (Whites Rd)` (~15 km)
   - `Te Waihou Blue Spring` ➔ `Mitai Maori Village (196 Fairy Springs Rd)` (~50 km)
   - `Mitai Maori Village` ➔ `Wylie Court Motor Lodge (345 Fenton St)` (~5 km)
6. **Giorno 7 (Thermal Roadtrip)**:
   - `Wylie Court Lodge` ➔ `Redwoods Treewalk (1 Long Mile Rd)` (~4 km)
   - `Redwoods Treewalk` ➔ `Polynesian Spa (1000 Hinemoa St)` (~3 km)
   - `Polynesian Spa` ➔ `Waiotapu Thermal Wonderland (201 Waiotapu Loop Rd)` (~30 km)
   - `Waiotapu` ➔ `Wairakei Terraces` (~45 km)
   - `Wairakei Terraces` ➔ `Cascate Huka, Taupo` (~5 km)
   - `Cascate Huka` ➔ `Skotel Alpine Resort, Tongariro` (~95 km)
7. **Giorno 8**:
   - `Skotel Alpine Resort` ➔ `Tongariro Alpine Crossing` (~15 km)
   - `Tongariro Crossing` ➔ `Totara Lodge Motel, Levin` (~210 km)
8. **Giorno 9 (Isola Nord -> Traghetto)**:
   - `Totara Lodge Motel Levin` ➔ `Te Papa Museum, Wellington` (~95 km)
   - `Te Papa Museum` ➔ `Wellington Passenger Ferry Terminal` (~2 km)
   - *(Traghetto marittimo)*
   - `Picton Ferry Terminal` ➔ `Kaikoura Seaside Lodge` (~155 km)
9. **Giorno 10**:
   - `Kaikoura Seaside Lodge` ➔ `Whale Watch Kaikoura (224 Esplanade)` (~2 km)
   - `Whale Watch Kaikoura` ➔ `Otira Stagecoach Hotel (6435 Otira Hwy)` (~315 km)
10. **Giorno 11 (West Coast Roadtrip)**:
    - `Otira Stagecoach Hotel` ➔ `Otira Viaduct Lookout` (~5 km)
    - `Otira Viaduct` ➔ `Hokitika Town` (~75 km)
    - `Hokitika Town` ➔ `Hokitika Gorge (Kokatahi)` (~33 km)
    - `Hokitika Gorge` ➔ `Franz Josef Glacier (Main Rd)` (~135 km)
    - `Franz Josef Main Rd` ➔ `Franz Josef Glacier Walk Carpark` (~5 km)
    - `Glacier Walk Carpark` ➔ `Haka House Franz Josef` (~3 km)
11. **Giorno 12 (Ghiacciai)**:
    - `Haka House Franz Josef` ➔ `Fox Glacier Helihike (44 Main Rd)` (~25 km)
    - `Fox Glacier Helihike` ➔ `Lake Matheson Walk` (~6 km)
    - `Lake Matheson` ➔ `Ivorytowers Accommodation Fox` (~5 km)
12. **Giorno 13 (Haast Pass Roadtrip)**:
    - `Ivorytowers Accommodation Fox` ➔ `Lake Matheson` (~6 km)
    - `Lake Matheson` ➔ `Haast Pass` (~120 km)
    - `Haast Pass` ➔ `Fantail Falls` (~10 km)
    - `Fantail Falls` ➔ `Blue Pools Track` (~15 km)
    - `Blue Pools` ➔ `Wanaka Town` (~75 km)
    - `Wanaka Town` ➔ `Roy's Peak Lookout (2 Glendhu Bay Rd)` (~7 km)
    - `Roy's Peak Lookout` ➔ `Cardrona Hotel` (~25 km)
13. **Giorno 14**:
    - `Cardrona Hotel` ➔ `Knobs Flat Accommodation (Eglinton Valley)` (~250 km)
14. **Giorno 15**:
    - `Knobs Flat` ➔ `Milford Sound Visitor Terminal` (~60 km)
    - `Milford Sound` ➔ `Arrowtown Lodge` (~285 km)
15. **Giorno 16**:
    - `Arrowtown Lodge` ➔ `Stargazing Monte John Observatory (Tekapo)` (~240 km)
    - `Monte John Observatory` ➔ `Fairlie Holiday Park` (~40 km)
16. **Giorno 17**:
    - `Fairlie Holiday Park` ➔ `Christchurch Airport` (~220 km)
    - *(Volo aereo CHC->ADL)*
    - `Adelaide Airport` ➔ `Jacksons Motor Inn Adelaide` (~10 km)
17. **Giorno 18**:
    - `Jacksons Motor Inn Adelaide` ➔ `Cape Jervis Ferry Terminal` (~105 km)
    - *(Traghetto auto)*
    - `Penneshaw Ferry Terminal` ➔ `Flinders Chase NP` (~100 km)
    - `Flinders Chase NP` ➔ `Kangaroo Island Wilderness Retreat` (~10 km)
18. **Giorno 19**:
    - `Kangaroo Island` ➔ `Adelaide Airport` (~110 km)
    - *(Volo aereo ADL->MEL)*
    - `Melbourne Airport` ➔ `Melbourne Tourist Park` (~20 km)
19. **Giorni 20–27 (Australia Van Roadtrip)**:
    - Great Ocean Road, Phillip Island, Wilsons Promontory, Jervis Bay, Blue Mountains (Tutti i collegamenti interni guidabili su strada in camper).

---

## 6. Elenco delle Tratte che NON Devono Mai Essere Calcolate in Auto

Di seguito le tratte che **DEVONO ESSERE ESCLUSE** dal calcolo stradale OSRM / Haversine guidabile:

1. **`d1-1`**: Roma Termini ➔ Milano Centrale (Treno Frecciarossa High-Speed)
2. **`d2-1` / `d3-1` / `d3-6`**: Milano MXP ➔ Pechino PEK ➔ Auckland AKL (Voli Aerei Intercontinentali)
3. **`d9-1`**: Wellington ➔ Picton (Traghetto marittimo Bluebridge Ferry attraverso lo Stretto di Cook)
4. **`d17-2`**: Christchurch CHC ➔ Adelaide ADL (Volo Aereo Internazionale)
5. **`d19-2`**: Adelaide ADL ➔ Melbourne MEL (Volo Aereo Domestico)
6. **`d30-1`**: Sydney SYD ➔ Manila MNL (Volo Aereo Internazionale)
7. **`d33-1`**: Manila MNL ➔ Caticlan MPH (Volo Aereo Domestico)
8. **`d33-2`**: Caticlan ➔ Boracay (Transfer Barca Marittimo)
9. **`d35-1`**: Caticlan MPH ➔ El Nido ENI (Volo Aereo Domestico Interisola)
10. **`d36-1` → `d39-1`**: Tao Expedition (Spedizione Marittima in Barca 4 Giorni tra gli Arcipelaghi di Palawan)
11. **`d41-1`**: Busuanga USU ➔ Cebu CEB (Volo Aereo Domestico Interisola)
12. **`d43-1`**: Cebu CEB ➔ Taipei ➔ Roma FCO (Volo Aereo Intercontinentale Rientro)

---

## 7. Elenco delle Attività con Dati Geografici Insufficienti

Attività i cui titoli o sottotitoli contengono descrizioni generiche o prive di indirizzo univoco, per le quali il geocoding fallisce o restituisce avviso **`⚠️ Luogo non abbastanza preciso`**:

1. **Day 1 (`d1-3`)**: *"Cena a Milano"* — Subtitle: *"Trattoria / Pizzeria zona Brera o Centrale"* (Generic descriptors: "Trattoria / Pizzeria zona Brera o Centrale").
2. **Day 7 (`d7-4`)**: *"Wairakei Terraces e Thermal Health Spa"* — Subtitle: *"Wairakei"* (Solo città/regione senza via o numero civico).
3. **Day 8 (`d8-1`)**: *"Trekking Tongariro Alpine Crossing"* — Subtitle: *"Trekking tra i vulcani attivi (19.4 km)"* (Descrizione fisica percorso trekking).
4. **Day 11 (`d11-4`)**: *"Franz Josef Glacier Walk"* — Subtitle: *"Passeggiata verso il fronte del ghiacciaio"* (Descrizione attività naturale).
5. **Day 12 (`d12-2`)**: *"Lake Matheson Walk"* — Subtitle: *"Specchio riflesso del Monte Cook"* (Descrizione paesaggistica).
6. **Day 14 (`d14-1`)**: *"Avvicinamento Milford Sound"* — Subtitle: *"Viaggio attraverso Eglinton Valley"* (Indicazione di viaggio).
7. **Day 20 (`d20-1`)**: *"Melbourne → Geelong → Great Ocean Road"* — Subtitle: *"Partenza viaggio on-road"* (Descrizione generale).
8. **Day 28 (`d28-2`)**: *"Sydney Opera House & The Rocks"* — Subtitle: *"Esplorazione a piedi del porto"* (Area generica a piedi).
9. **Day 32 (`d32-1`)**: *"Relax & Preparazione Boracay"* — Subtitle: *"Organizzazione bagagli"* (Attività interna hotel).

---

## 8. Diagnosi della Causa Tecnica Principale

### Perché a volte vengono confuse tratte stradali con voli, treni o traghetti?

1. **La funzione `getDrivingCandidateSegments` in `TodayView.tsx` ignora i trasporti non stradali per il nodo iniziale**:
   Nella funzione `getDrivingCandidateSegments`:
   ```ts
   const points = [prev_acc, act1, act2, ..., actN, today_acc];
   ```
   Quando la funzione scorre le coppie consecutive `p1 = points[i]` e `p2 = points[i+1]`:
   - La guardia `if (p1.act && p2.act)` controlla la funzione `isDrivingTransit(p1.act, p2.act)`.
   - **Tuttavia, quando `p1` è `prev_acc` (alloggio giorno precedente), `p1.act` è `undefined`!**
   - Di conseguenza, l'espressione `if (p1.act && p2.act)` valuta a `false`, **saltando completamente il controllo `isDrivingTransit` e `getActivityRoutingCategory`!**
   - Se `act1` è un treno (es. `d1-1` Roma Termini ➔ Milano Centrale) o un volo, il segmento `prev_acc ➔ act1` viene inserito come rotta stradale candidata!

2. **Deduplicazione Hotel Attività vs Accommodations**:
   In `itinerary.json`, attività come `d1-hotel` ("Check-in a&o Hostel Milano Ca Granda") o `d5-6` ("Waitomo Village Chalets") hanno `type: "hotel"`.
   Nel medesimo tempo, `TodayView.tsx` recupera `todayAcc` da `accommodations.json` ed inserisce sia l'attività hotel sia l'alloggio corrente `today_acc` in fondo all'array `points`. Questo genera una duplicazione del nodo hotel.

3. **Mancanza di interruzione esplicita della sequenza stradale al punto di imbarco/aeroporto**:
   Quando in un giorno è presente un traghetto (es. `d9-1` Wellington ➔ Picton) o un volo (es. `d17-2` Christchurch ➔ Adelaide), l'algoritmo non divide la giornata in due sottosequenze stradali indipendenti (Isola Nord prima del porto / Isola Sud dopo il porto). Tenta invece di collegare i punti precedenti e successivi al traghetto se la guardia fallisce.

---

## 9. Differenze tra Logica Desiderata e Logica Attuale

| Funzione / Modulo | Input | Output Attuale | Output Desiderato | Differenza / Errore Riscontrato |
| :--- | :--- | :--- | :--- | :--- |
| **`getDrivingCandidateSegments`** | `day`, `prevDayAcc`, `accommodationsList`, `transportsList` | Array `CandidateSegment[]` che include anche coppie con `prev_acc` legate a treni/voli. | Array di soli segmenti stradali omogenei compresi tra due fermate di guida effettiva nello stesso territorio. | Non filtra `prev_acc` quando l'attività successiva è un treno/volo (`p1.act` nullo bypassa il filtro `isDrivingTransit`). |
| **`isDrivingTransit`** | `act`, `nextAct`, `transportsList`, `dayDate` | `boolean` | `false` per qualsiasi volo, treno, traghetto o navigazione marittima. | Se il testo del titolo non contiene la stringa esatta del vettore in `transports.json`, rischia di non associare il trasporto e restituire `true`. |
| **`getActivityRoutingCategory`**| `Activity` | `"REAL_DRIVING"`, `"NON_DRIVING_TRANSPORT"`, `"TOTAL_EXCLUSION"` | Identificazione univoca di `driving-stop`, `non-driving-transport`, `road-transport`, `hotel-event`, `non-routable`. | Alcune stringhe di trasporto con `type: "transport"` (es. *"Avvicinamento Milford Sound"*) vengono classificate come `REAL_DRIVING` senza verificare se si tratta di navigazione o volo. |
| **`buildRoutingFallbackQuery`**| `Activity`, `dayLocation`, `Accommodation` | `string \| undefined` | Query pulita `"Nome Luogo, Città"` se specifica; `undefined` se generica. | Funziona bene per luoghi precisi, ma per descrizioni di zona (es. Starita con *"zona Brera"*) restituiva stringhe troppo lunghe che Nominatim falliva. |
| **Chiavi Cache (`buildSegmentCacheKey`)** | `originUrl`, `originFallback`, `destUrl`, `destFallback` | Stringa normalizzata `origin_to_dest` | Chiave uniforme utilizzata sia in scrittura che in lettura. | **Risolto correttamente nella sessione precedente**, ora simmetrica. |

---

## 10. Piano di Correzione in Micro-Blocchi Reversibili

Prima di effettuare qualsiasi modifica al codice, si propone il seguente piano in micro-blocchi sequenziali e totalmente testabili:

### Micro-Blocco 1: Correzione Guardia `getDrivingCandidateSegments`
- Modificare il ciclo in `getDrivingCandidateSegments` in modo che la verifica `isDrivingTransit` e `getActivityRoutingCategory` venga eseguita su **qualsiasi** punto dell'array (inclusi `prev_acc` e `today_acc`).
- Se `p2` è un trasporto non stradale (volo, treno, traghetto), **spezzare la sequenza di guida ed escludere il segmento**.

### Micro-Blocco 2: Deduplicazione Elegante Alloggi Attività vs `accommodations.json`
- Se un'attività ha `type: "hotel"` ed è lo stesso hotel di `prevDayAcc` o `todayAcc`, non aggiungere un nodo duplicato alla catena `points`.

### Micro-Blocco 3: Affinamento `getActivityRoutingCategory`
- Mappare in modo rigido i tipi ed i titoli delle 5 categorie principali (`driving-stop`, `non-driving-transport`, `road-transport`, `hotel-event`, `non-routable`).
- Assicurare che tutti gli elementi di `transports.json` con `type: "plane"`, `"train"`, `"ferry"` vengano sempre ed incondizionatamente trattati come interruzioni non guidabili.

### Micro-Blocco 4: Verifiche di Sintassi & Test Runtime
- Eseguire `npm run lint` ed `npm run build` per confermare la totale assenza di regressioni.

---
*Report generato con successo in `docs/routing-itinerary-audit.md`.*
