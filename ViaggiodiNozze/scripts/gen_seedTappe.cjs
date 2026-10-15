const fs = require('fs');

const rawData = `
--- GIORNO 1 (2026-11-28) ---
1. Navigli Milano
- date: '2026-11-28'
- order: 1
- title: 'Navigli Milano'
- location: 'Navigli, Milano'
- mapUrl: 'https://maps.app.goo.gl/ci59PTXCYAoBwCFY7'
- noteCopilota: 'Passeggiata serale lungo i canali dopo la cena da Starita.'

--- GIORNO 2 (2026-11-29) ---
2. Aeroporto Milano Malpensa T1
- date: '2026-11-29'
- order: 1
- title: 'Aeroporto Milano Malpensa T1'
- location: 'Malpensa Terminal 1, Ferno (VA)'
- noteCopilota: 'Arrivo tassativo entro le 08:30 per check-in e varchi volo Air China CA950 delle 12:30.'

--- GIORNO 3 (2026-11-30) ---
3. Arrivo Scalo Pechino (PEK)
- date: '2026-11-30'
- order: 1
- title: 'Arrivo Scalo Pechino (PEK)'
- location: 'Beijing Capital International Airport (PEK)'
- noteCopilota: 'Atterraggio 05:40. Uscita visti 24/144 ore per tour diurno muraglia e centro.'

4. Piazza Tienanmen e Centro
- date: '2026-11-30'
- order: 2
- title: 'Piazza Tienanmen e Centro'
- location: 'Dongcheng District, Pechino'
- noteCopilota: 'Controlli sicurezza passaporto. Spostamento a piedi verso Siji Minfu (prendere numero virtuale prima).'

--- GIORNO 4 (2026-12-01) ---
5. Giro Centro Auckland & Waterfront
- date: '2026-12-01'
- order: 1
- title: 'Giro Centro Auckland & Waterfront'
- location: 'Queen Street & Viaduct Harbour, Auckland CBD'
- noteCopilota: 'Passeggiata post-volo dopo il check-in al Noa Hotel.'

--- GIORNO 5 (2026-12-02) ---
6. Mount Eden
- date: '2026-12-02'
- order: 1
- title: 'Mount Eden'
- location: 'Mount Eden, Auckland'
- noteCopilota: 'Punto panoramico sul cratere vulcanico e la baia prima di uscire da Auckland.'

7. Marokopa Falls
- date: '2026-12-02'
- order: 2
- title: 'Cascate Marokopa Falls'
- location: 'Te Anga, Waikato'
- noteCopilota: 'Breve camminata dal parcheggio al belvedere sulla cascata.'

8. Mangapohue Natural Bridge
- date: '2026-12-02'
- order: 3
- title: 'Mangapohue Natural Bridge'
- location: 'Waitomo Caves Area'
- noteCopilota: 'Passerella su gola rocciosa e arco naturale di calcare fossile.'

9. Ruakuri Bushwalk
- date: '2026-12-02'
- order: 4
- title: 'Ruakuri Bushwalk'
- location: 'Ruakuri Reserve, Waitomo'
- noteCopilota: 'Sentiero tra gole calcaree, ponti e gallerie scavate dal fiume.'

--- GIORNO 6 (2026-12-03) ---
10. Big Dog and Sheep
- date: '2026-12-03'
- order: 1
- title: 'Big Dog and Sheep Buildings'
- location: 'State Highway 1, Tirau'
- noteCopilota: 'Sosta fotografica davanti ai famosi edifici giganti in lamiera ondulata.'

11. Te Waihou Blue Spring
- date: '2026-12-03'
- order: 2
- title: 'Te Waihou Blue Spring'
- location: 'Leslie Road, Putaruru'
- noteCopilota: 'Camminata lungo il fiume con una delle acque più limpide e azzurre al mondo.'

--- GIORNO 7 (2026-12-04) ---
12. Cascate Huka (Huka Falls)
- date: '2026-12-04'
- order: 1
- title: 'Cascate Huka (Huka Falls)'
- location: 'Huka Falls Rd, Taupo'
- noteCopilota: 'Belvedere sulla portata d acqua turchese del fiume Waikato.'

13. Tawhai Falls (Gollum's Pool)
- date: '2026-12-04'
- order: 2
- title: 'Tawhai Falls (Gollum's Pool)'
- location: 'Bruce Road, Tongariro NP'
- noteCopilota: 'Location de Il Signore degli Anelli (10 min dal parcheggio).'

14. Tongariro NP Visitor Centre
- date: '2026-12-04'
- order: 3
- title: 'Tongariro NP Visitor Centre'
- location: 'Whakapapa Village'
- noteCopilota: 'Verifica bollettino meteo per il trekking dell indomani e pass DOC.'

--- GIORNO 8 (2026-12-05) ---
15. Kiwi Camp National Park (Docce)
- date: '2026-12-05'
- order: 1
- title: 'Kiwi Camp National Park (Docce)'
- location: 'National Park Village'
- noteCopilota: 'Sosta docce calde rigeneranti post-Tongariro prima di mettersi alla guida verso sud.'

--- GIORNO 9 (2026-12-06) ---
16. Cuba Street & Mt Victoria Lookout
- date: '2026-12-06'
- order: 1
- title: 'Cuba Street & Mt Victoria'
- location: 'Wellington CBD'
- mapUrl: 'https://maps.app.goo.gl/doNS86LJcB8zNVnq9'
- noteCopilota: 'Passeggiata mattutina e vista dall alto prima del check-in traghetto (ore 12:30 tassative).'

17. Ohau Point Lookout (Colonia Foche)
- date: '2026-12-06'
- order: 2
- title: 'Ohau Point Lookout (Colonia Foche)'
- location: 'Halfway Bay, Kaikoura'
- mapUrl: 'https://maps.app.goo.gl/doNS86LJcB8zNVnq9'
- noteCopilota: 'Belvedere lungo la SH1 dopo lo sbarco a Picton per ammirare le foche sulle rocce.'

--- GIORNO 10 (2026-12-07) ---
18. Kaikōura Peninsula Walkway
- date: '2026-12-07'
- order: 1
- title: 'Kaikōura Peninsula Walkway'
- location: 'Point Kean, Kaikoura'
- mapUrl: 'https://maps.app.goo.gl/8Paj3SF1L8ipHmQr7'
- noteCopilota: 'Sentiero panoramico scogliera (da valutare dopo il whale watching).'

19. Castle Hill (Kura Tawhiti)
- date: '2026-12-07'
- order: 2
- title: 'Castle Hill (Kura Tawhiti)'
- location: 'State Highway 73, Arthur's Pass'
- mapUrl: 'https://maps.app.goo.gl/8Paj3SF1L8ipHmQr7'
- noteCopilota: 'Labirinto di enormi massi calcarei erosi dal vento nel cuore delle Alpi del Sud.'

20. Otira Viaduct Lookout
- date: '2026-12-07'
- order: 3
- title: 'Otira Viaduct Lookout'
- location: 'Arthur's Pass National Park'
- mapUrl: 'https://maps.app.goo.gl/8Paj3SF1L8ipHmQr7'
- noteCopilota: 'Belvedere sul viadotto sospeso; frequenti incontri con i pappagalli kea.'

--- GIORNO 11 (2026-12-08) ---
21. Hokitika Beach (Scritta Legni)
- date: '2026-12-08'
- order: 1
- title: 'Hokitika Beach (Scritta Legni)'
- location: 'Beach Street, Hokitika'
- mapUrl: 'https://maps.app.goo.gl/C7k3PFM5VS2Qw5pcA'
- noteCopilota: 'Spiaggia di sabbia nera con la celebre scritta in legni spiaggiati.'

--- GIORNO 12 (2026-12-09) ---
22. Fox Glacier Guiding Base
- date: '2026-12-09'
- order: 1
- title: 'Fox Glacier Guiding Base'
- location: '44 Main Road, Fox Glacier'
- mapUrl: 'https://maps.app.goo.gl/DeYRM11N8gWP8B5B6'
- noteCopilota: 'Punto di ritrovo ore 08:50 per elicottero ed equipaggiamento.'

--- GIORNO 13 (2026-12-10) ---
23. Knights Point Lookout
- date: '2026-12-10'
- order: 1
- title: 'Knights Point Lookout'
- location: 'Haast Highway (SH6)'
- mapUrl: 'https://maps.app.goo.gl/2EE7wiE6cBPPhQR5A'
- noteCopilota: 'Scogliere a picco sul Mar di Tasman e colonia di foche.'

24. Wilson Creek Chasm (Haast Pass)
- date: '2026-12-10'
- order: 2
- title: 'Wilson Creek Chasm (Haast Pass)'
- location: 'Haast Pass Highway'
- mapUrl: 'https://maps.app.goo.gl/2EE7wiE6cBPPhQR5A'
- noteCopilota: 'Breve sosta fotografica tra le gole del valico alpino.'

25. That Wānaka Tree (Salice nel Lago)
- date: '2026-12-10'
- order: 3
- title: 'That Wānaka Tree'
- location: 'Roys Bay, Lake Wanaka'
- mapUrl: 'https://maps.app.goo.gl/2EE7wiE6cBPPhQR5A'
- noteCopilota: 'Il celebre albero solitario immerso nelle acque del lago Wanaka.'

--- GIORNO 14 (2026-12-11) ---
26. Crown Range Summit
- date: '2026-12-11'
- order: 1
- title: 'Crown Range Summit'
- location: 'Crown Range Road (1.076 m)'
- mapUrl: 'https://maps.app.goo.gl/ivqmKEUFBQFPC4qt8'
- noteCopilota: 'Passo stradale asfaltato più alto della Nuova Zelanda con vista mozzafiato.'

27. Arrowtown Storica
- date: '2026-12-11'
- order: 2
- title: 'Arrowtown Storica'
- location: 'Buckingham Street, Arrowtown'
- mapUrl: 'https://maps.app.goo.gl/ivqmKEUFBQFPC4qt8'
- noteCopilota: 'Borgo ottocentesco dei cercatori d oro ben conservato.'

28. Te Anau & Rifornimento Pompa Allied
- date: '2026-12-11'
- order: 3
- title: 'Te Anau & Rifornimento Allied'
- location: 'Allied Te Anau, Milford Crescent'
- mapUrl: 'https://maps.app.goo.gl/ivqmKEUFBQFPC4qt8'
- noteCopilota: 'PIENO ASSOLUTO: nessun distributore per i successivi 120 km. Scaricare mappe offline (zero segnale cellulare).'

29. Mirror Lakes
- date: '2026-12-11'
- order: 4
- title: 'Mirror Lakes'
- location: 'Milford Road (SH94)'
- mapUrl: 'https://maps.app.goo.gl/ivqmKEUFBQFPC4qt8'
- noteCopilota: 'Specchi d acqua con cartelli invertiti che riflettono le vette montuose.'

--- GIORNO 15 (2026-12-12) ---
30. The Chasm Walk
- date: '2026-12-12'
- order: 1
- title: 'The Chasm Walk'
- location: 'Milford Road'
- mapUrl: 'https://maps.app.goo.gl/mHrTZcy14jyCGpHQ8'
- noteCopilota: 'Camminata di 20 min tra rocce modellate dalla forza dell acqua.'

31. Pop's View Lookout
- date: '2026-12-12'
- order: 2
- title: 'Pop's View Lookout'
- location: 'Hollyford Valley Viewpoint'
- mapUrl: 'https://maps.app.goo.gl/mHrTZcy14jyCGpHQ8'
- noteCopilota: 'Belvedere panoramico sulla vallata glaciale lungo la via di rientro.'

--- GIORNO 16 (2026-12-13) ---
32. Kawarau Gorge Suspension Bridge
- date: '2026-12-13'
- order: 1
- title: 'Kawarau Gorge Bridge'
- location: 'Gibbston Valley'
- mapUrl: 'https://maps.app.goo.gl/kKdtuqnkakcvLaCH8'
- noteCopilota: 'Ponte storico sopra il fiume turchese, patria del bungy jumping.'

33. Lindis Pass Viewpoint
- date: '2026-12-13'
- order: 2
- title: 'Lindis Pass Viewpoint'
- location: 'State Highway 8'
- mapUrl: 'https://maps.app.goo.gl/kKdtuqnkakcvLaCH8'
- noteCopilota: 'Paesaggio collinare dorato con vegetazione a tussock.'

34. Lake Tekapo & Church of the Good Shepherd
- date: '2026-12-13'
- order: 3
- title: 'Lake Tekapo & Church'
- location: 'Lake Tekapo'
- mapUrl: 'https://maps.app.goo.gl/kKdtuqnkakcvLaCH8'
- noteCopilota: 'Iconica chiesetta in pietra affacciata sulle acque turchesi del lago.'

--- GIORNO 17 (2026-12-14) ---
35. Rakaia Gorge Walkway
- date: '2026-12-14'
- order: 1
- title: 'Rakaia Gorge'
- location: 'Rakaia Gorge Bridge'
- mapUrl: 'https://maps.app.goo.gl/Qg4r6TgDNjFiFMRT9'
- noteCopilota: 'Gole scavate dal fiume con vista sulle montagne innevate.'

36. Tour a Piedi Centro Christchurch
- date: '2026-12-14'
- order: 2
- title: 'Tour a Piedi Christchurch'
- location: 'Christchurch Central'
- mapUrl: 'https://maps.app.goo.gl/Qg4r6TgDNjFiFMRT9'
- noteCopilota: 'Riverside Market, Bridge of Remembrance, fiume Avon, Cardboard Cathedral e New Regent Street.'

--- GIORNO 18 (2026-12-15) ---
37. Aeroporto Christchurch (Riconsegna Auto)
- date: '2026-12-15'
- order: 1
- title: 'Aeroporto Christchurch (Riconsegna Auto)'
- location: 'Snap Rentals CHC Airport'
- mapUrl: 'https://maps.app.goo.gl/56kHRfnKkGVgET89A'
- noteCopilota: 'Fare il pieno prima alla pompa designata e consegnare auto entro le 12:00.'

38. Arrivo Fleurieu Peninsula (Wirrina Cove)
- date: '2026-12-15'
- order: 2
- title: 'Arrivo Fleurieu Peninsula'
- location: 'Wirrina Cove SA'
- mapUrl: 'https://maps.app.goo.gl/56kHRfnKkGVgET89A'
- noteCopilota: 'Dopo il ritiro auto a Marleston, guida verso sud vicino all imbarco per Kangaroo Island.'

--- GIORNO 19 (2026-12-16) ---
39. Imbarco Cape Jervis
- date: '2026-12-16'
- order: 1
- title: 'Imbarco Cape Jervis'
- location: 'Cape Jervis Ferry Terminal'
- mapUrl: 'https://maps.app.goo.gl/B8GHEo1fv52Rcm3R7'
- noteCopilota: 'Arrivare al molo tassativamente entro le 07:05 per imbarco SeaLink delle 07:40.'

40. Seal Bay
- date: '2026-12-16'
- order: 2
- title: 'Seal Bay'
- location: 'Seal Bay Road, Kangaroo Island'
- mapUrl: 'https://maps.app.goo.gl/B8GHEo1fv52Rcm3R7'
- noteCopilota: 'Colonia naturale di leoni marini sulla spiaggia.'

41. Vivonne Bay Beach
- date: '2026-12-16'
- order: 3
- title: 'Vivonne Bay Beach'
- location: 'Vivonne Bay'
- mapUrl: 'https://maps.app.goo.gl/B8GHEo1fv52Rcm3R7'
- noteCopilota: 'Spiaggia incontaminata e pranzo con Whiting Burger al general store.'

42. Remarkable Rocks
- date: '2026-12-16'
- order: 4
- title: 'Remarkable Rocks'
- location: 'Flinders Chase National Park'
- mapUrl: 'https://maps.app.goo.gl/B8GHEo1fv52Rcm3R7'
- noteCopilota: 'Enormi sculture di granito arancione erose sul mare.'

43. Admirals Arch
- date: '2026-12-16'
- order: 5
- title: 'Admirals Arch'
- location: 'Cape du Couedic'
- mapUrl: 'https://maps.app.goo.gl/B8GHEo1fv52Rcm3R7'
- noteCopilota: 'Arco roccioso con stalattiti e colonia di otarie orsine.'

--- GIORNO 20 (2026-12-17) ---
44. Hanson Bay & Baudin Beach
- date: '2026-12-17'
- order: 1
- title: 'Hanson Bay & Baudin Beach'
- location: 'Kangaroo Island'
- mapUrl: 'https://maps.app.goo.gl/Sekyp84wtxnHUvFy8'
- noteCopilota: 'Avvistamento koala la mattina presto e transito per la Playford Hwy.'

45. Molo di Penneshaw
- date: '2026-12-17'
- order: 2
- title: 'Molo di Penneshaw'
- location: 'Penneshaw Ferry Terminal'
- mapUrl: 'https://maps.app.goo.gl/Sekyp84wtxnHUvFy8'
- noteCopilota: 'Arrivare al molo entro le 11:30 (traghetto SeaLink ore 12:20).'

46. Riconsegna Marleston & McLaren Vale
- date: '2026-12-17'
- order: 3
- title: 'Riconsegna Marleston & McLaren Vale'
- location: '59 Galway Ave, Marleston SA'
- mapUrl: 'https://maps.app.goo.gl/Sekyp84wtxnHUvFy8'
- noteCopilota: 'Pieno benzina a Richmond Rd e riconsegna auto entro le 17:30. Shuttle verso aeroporto.'

47. Deposito Travellers Autobarn Tullamarine
- date: '2026-12-17'
- order: 4
- title: 'Ritiro Budgie Van (Tullamarine)'
- location: '5 Assembly Drive, Tullamarine VIC'
- mapUrl: 'https://maps.app.goo.gl/9QwoKaHEwzxsWZ83A'
- noteCopilota: 'Ritiro contactless da cassetta a combinazione. Video 360 al buio con torcia prima di partire.'

--- GIORNO 21 (2026-12-18) ---
48. Torquay & Bells Beach
- date: '2026-12-18'
- order: 1
- title: 'Torquay & Bells Beach'
- location: 'Torquay VIC'
- mapUrl: 'https://maps.app.goo.gl/UCgh22ZP6xh8Qd3Y6'
- noteCopilota: 'Spesa ad Aldi Geelong e inizio ufficiale della Great Ocean Road con sosta alla famosa spiaggia di surf.'

49. Anglesea Golf Club (Canguri)
- date: '2026-12-18'
- order: 2
- title: 'Anglesea Golf Club (Canguri)'
- location: 'Anglesea VIC'
- mapUrl: 'https://maps.app.goo.gl/UCgh22ZP6xh8Qd3Y6'
- noteCopilota: 'Colonia di canguri grigi orientali residenti sul prato da golf.'

50. Split Point & Teddy's Lookout
- date: '2026-12-18'
- order: 3
- title: 'Split Point & Teddy's Lookout'
- location: 'Aireys Inlet / Lorne'
- mapUrl: 'https://maps.app.goo.gl/UCgh22ZP6xh8Qd3Y6'
- noteCopilota: 'Faro bianco panoramico e belvedere sulla foce del fiume a Lorne.'

--- GIORNO 22 (2026-12-19) ---
51. Kennett River (Koala) & Apollo Bay
- date: '2026-12-19'
- order: 1
- title: 'Kennett River & Apollo Bay'
- location: 'Grey River Rd, Kennett River'
- mapUrl: 'https://maps.app.goo.gl/T53Uygmm4XTNmPoEA'
- noteCopilota: 'Koala selvatici sugli eucalipti lungo la strada sterrata e sosta balneare ad Apollo Bay.'

52. Cape Otway Lightstation
- date: '2026-12-19'
- order: 2
- title: 'Cape Otway Lightstation'
- location: 'Cape Otway'
- mapUrl: 'https://maps.app.goo.gl/T53Uygmm4XTNmPoEA'
- noteCopilota: 'Il faro più antico dell Australia continentale.'

53. Gibson Steps & Faraglioni
- date: '2026-12-19'
- order: 3
- title: 'Gibson Steps'
- location: 'Princetown'
- mapUrl: 'https://maps.app.goo.gl/T53Uygmm4XTNmPoEA'
- noteCopilota: 'Discesa degli 86 gradini scavati nella parete fino alla spiaggia sotto i giganti di pietra.'

54. Saddle Lookout (Tramonto 12 Apostoli)
- date: '2026-12-19'
- order: 4
- title: 'Saddle Lookout (12 Apostoli)'
- location: 'Twelve Apostles Visitor Centre'
- mapUrl: 'https://maps.app.goo.gl/T53Uygmm4XTNmPoEA'
- noteCopilota: 'Punto migliore per ammirare il tramonto sui faraglioni (arrivare verso le 20:30).'

55. Gola di Loch Ard (Loch Ard Gorge)
- date: '2026-12-19'
- order: 5
- title: 'Gola di Loch Ard'
- location: 'Port Campbell National Park'
- mapUrl: 'https://maps.app.goo.gl/T53Uygmm4XTNmPoEA'
- noteCopilota: 'Insenatura racchiusa tra falesie gialle (valutare se al tramonto o la mattina dopo).'

--- GIORNO 23 (2026-12-20) ---
56. Parcheggio Queen Victoria Market
- date: '2026-12-20'
- order: 1
- title: 'Parcheggio Queen Victoria Market'
- location: 'Melbourne CBD'
- mapUrl: 'https://maps.app.goo.gl/gckrJBY53KMrBU6R7'
- noteCopilota: 'Parcheggiare nell Open-Air Car Park all aperto per via dell altezza del van (1,9 m).'

57. Tour Vicoli Melbourne (Flinders, Degraves, Hosier)
- date: '2026-12-20'
- order: 2
- title: 'Tour Vicoli Melbourne'
- location: 'Flinders St, Degraves St, Hosier Ln'
- mapUrl: 'https://maps.app.goo.gl/GqQD8JNsSz9Lyu1A8'
- noteCopilota: 'Giro a piedi tra street art, caffè storici e Federation Square.'

58. St Kilda Pier (Pinguini Minori)
- date: '2026-12-20'
- order: 3
- title: 'St Kilda Pier (Pinguini Minori)'
- location: 'St Kilda, Melbourne'
- mapUrl: 'https://maps.app.goo.gl/GqQD8JNsSz9Lyu1A8'
- noteCopilota: 'Trovare parcheggio e camminare sul pontile al calar del sole per vedere i pinguini tra gli scogli.'

--- GIORNO 24 (2026-12-21) ---
59. Squeaky Beach & Tidal River
- date: '2026-12-21'
- order: 1
- title: 'Squeaky Beach & Tidal River'
- location: 'Wilsons Promontory National Park'
- mapUrl: 'https://maps.app.goo.gl/syjriZThWBpodVAi9'
- noteCopilota: 'Sabbia di quarzo che fischia al camminamento e sosta pranzo a Tidal River.'

--- GIORNO 25 (2026-12-22) ---
60. Cunninghame Arm & Orbost
- date: '2026-12-22'
- order: 1
- title: 'Cunninghame Arm & Orbost'
- location: 'Lakes Entrance / Orbost'
- mapUrl: 'https://maps.app.goo.gl/Bda9vhvq6smvxbAD8'
- noteCopilota: 'Ponte pedonale sulla laguna e passaggio per le foreste dell East Gippsland.'

61. Eden Lookout & Rotary Park
- date: '2026-12-22'
- order: 2
- title: 'Eden Lookout & Rotary Park'
- location: 'Eden, Twofold Bay (NSW)'
- mapUrl: 'https://maps.app.goo.gl/Bda9vhvq6smvxbAD8'
- noteCopilota: 'Belvedere sull oceano con vista sulla baia delle balene prima di arrivare al campeggio.'

--- GIORNO 26 (2026-12-23) ---
62. Central Tilba & Narooma
- date: '2026-12-23'
- order: 1
- title: 'Central Tilba & Narooma'
- location: 'Eurobodalla Coast (NSW)'
- mapUrl: 'https://maps.app.goo.gl/PdLvt3n3zp5XDD2o7'
- noteCopilota: 'Villaggio in legno protetto e Australia Rock a Bar Rock Lookout con foche.'

63. Batemans Bay & Pebbly Beach (Canguri)
- date: '2026-12-23'
- order: 2
- title: 'Batemans Bay & Pebbly Beach'
- location: 'Murramarang National Park'
- mapUrl: 'https://maps.app.goo.gl/PdLvt3n3zp5XDD2o7'
- noteCopilota: 'Rifornimento van a Batemans Bay e canguri che passeggiano sul bagnasciuga a Pebbly Beach.'

64. Hyams Beach (Jervis Bay)
- date: '2026-12-23'
- order: 3
- title: 'Hyams Beach (Jervis Bay)'
- location: 'Hyams Beach, Jervis Bay'
- mapUrl: 'https://maps.app.goo.gl/PdLvt3n3zp5XDD2o7'
- noteCopilota: 'Celebre spiaggia con sabbia tra le più bianche e fini al mondo.'

--- GIORNO 27 (2026-12-24) ---
65. Chinamans Beach (Tramonto)
- date: '2026-12-24'
- order: 1
- title: 'Chinamans Beach (Tramonto)'
- location: 'Jervis Bay'
- mapUrl: 'https://maps.app.goo.gl/WxHjQcyno5w4DAXY6'
- noteCopilota: 'Sosta serale prima del trasferimento al campeggio di Werri Beach.'

--- GIORNO 28 (2026-12-25) ---
66. Echo Point (Three Sisters) & Katoomba Falls
- date: '2026-12-25'
- order: 1
- title: 'Echo Point & Three Sisters'
- location: 'Katoomba, Blue Mountains'
- mapUrl: 'https://maps.app.goo.gl/89wG9p5TVMud18vG6'
- noteCopilota: 'Punto iconico delle Tre Sorelle e cascate nel tardo pomeriggio con luce calda.'

--- GIORNO 29 (2026-12-26) ---
67. Circular Quay & Teatro dell Opera
- date: '2026-12-26'
- order: 1
- title: 'Circular Quay & Opera House'
- location: 'Bennelong Point, Sydney'
- mapUrl: 'https://maps.app.goo.gl/EzGsb9jjSLTpP7Wh9'
- noteCopilota: 'Cuore pedonale della baia e architettura dell Opera.'

68. The Rocks, Dawes Point & Harbour Bridge
- date: '2026-12-26'
- order: 2
- title: 'The Rocks & Harbour Bridge'
- location: 'The Rocks, Sydney'
- mapUrl: 'https://maps.app.goo.gl/EzGsb9jjSLTpP7Wh9'
- noteCopilota: 'Quartiere storico in pietra e piloni dell Harbour Bridge.'

69. Royal Botanic Garden & Mrs Macquarie's Chair
- date: '2026-12-26'
- order: 3
- title: 'Mrs Macquarie's Chair'
- location: 'Mrs Macquaries Rd, Sydney'
- mapUrl: 'https://maps.app.goo.gl/EzGsb9jjSLTpP7Wh9'
- noteCopilota: 'Scorcio fotografico iconico con Opera House e Harbour Bridge allineati.'

--- GIORNO 30 (2026-12-27) ---
70. Manly Wharf & Shelly Beach
- date: '2026-12-27'
- order: 1
- title: 'Manly Wharf & Shelly Beach'
- location: 'Manly, Sydney'
- mapUrl: 'https://maps.app.goo.gl/kwXi25DHcWRRgqC19'
- noteCopilota: 'Sbarco col traghetto e passeggiata fino alla baia riparata di Shelly Beach.'

71. Barangaroo Reserve & Darling Harbour
- date: '2026-12-27'
- order: 2
- title: 'Barangaroo & Darling Harbour'
- location: 'Sydney Waterfront'
- mapUrl: 'https://maps.app.goo.gl/kwXi25DHcWRRgqC19'
- noteCopilota: 'Parco costiero moderno e passeggiata serale lungo il porto turistico.'

--- GIORNO 31 (2026-12-28) ---
72. Riconsegna Campervan Travellers Autobarn Sydney
- date: '2026-12-28'
- order: 1
- title: 'Riconsegna Van (Banksmeadow)'
- location: '1C McPherson St, Banksmeadow NSW 2019'
- noteCopilota: 'Partire dall hotel alle 07:30 max. Pieno fatto la sera prima. Presenza ai banchi T1 ore 09:15 tassative.'

--- GIORNO 32 (2026-12-29) ---
73. White Beach (Willy's Rock) & Kasbar
- date: '2026-12-29'
- order: 1
- title: 'White Beach (Willy's Rock) & Kasbar'
- location: 'Station 1, Boracay Island'
- noteCopilota: 'Iconico scoglio con statua sul mare e sosta tramonto al Kasbar con lanterne accese.'

--- GIORNO 34 (2026-12-31) ---
74. Diniwid Beach
- date: '2026-12-31'
- order: 1
- title: 'Diniwid Beach'
- location: 'Diniwid, Boracay'
- noteCopilota: 'Caletta riparata a nord di White Beach raggiungibile tramite sentiero scavato nella roccia.'

--- GIORNO 35 (2027-01-01) ---
75. Puka Shell Beach
- date: '2027-01-01'
- order: 1
- title: 'Puka Shell Beach'
- location: 'Nord Boracay'
- noteCopilota: 'Spiaggia selvaggia di conchiglie fossili, raggiungibile in e-trike.'
`;

const lines = rawData.trim().split('\n');
const results = [];
let current = null;

for (const line of lines) {
    if (line.match(/^\d+\./)) {
        if (current) results.push(current);
        current = {};
    } else if (line.startsWith('- date:')) {
        current.date = line.replace('- date:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- order:')) {
        current.order = parseInt(line.replace('- order:', '').trim());
    } else if (line.startsWith('- title:')) {
        current.title = line.replace('- title:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- location:')) {
        current.location = line.replace('- location:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- mapUrl:')) {
        current.mapUrl = line.replace('- mapUrl:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- noteCopilota:')) {
        current.noteCopilota = line.replace('- noteCopilota:', '').replace(/'/g, '').trim();
    }
}
if (current) results.push(current);

const fileContent = "import type { Tappa } from '../types';\n\n" +
"export const REAL_TAPPE: Omit<Tappa, 'createdAt' | 'updatedAt'>[] = [\n" +
results.map((r, i) => {
    const id = (i + 1).toString().padStart(2, '0');
    return "  {\n" +
    "    id: 'tappa_" + id + "',\n" +
    "    titolo: `" + (r.title || '').replace(/`/g, "\\`") + "`,\n" +
    "    date: `" + r.date + "`,\n" +
    "    dayId: 'day_" + r.date + "',\n" +
    "    order: " + (r.order || 1) + ",\n" +
    "    indirizzo: `" + (r.location || '').replace(/`/g, "\\`") + "`,\n" +
    "    mapsUrl: " + (r.mapUrl ? "`" + r.mapUrl + "`" : "undefined") + ",\n" +
    "    noteCopilota: `" + (r.noteCopilota || '').replace(/`/g, "\\`") + "`\n" +
    "  }";
}).join(',\n') +
"\n];\n";

fs.writeFileSync('src/storage/seedTappe.ts', fileContent, 'utf8');
console.log("seedTappe.ts generated!");
