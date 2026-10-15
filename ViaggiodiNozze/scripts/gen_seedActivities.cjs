const fs = require('fs');

const data = `
1. Museo del Novecento
- date: '2026-11-28'
- time: '14:00'
- duration: '1h 30m'
- address: 'Piazza del Duomo 8, 20123 Milano, Italia'
- cost: '20.00'
- status: 'da_saldare'
- noteCopilota: 'Ultimo ingresso ore 18:30, chiusura ore 19:30. Biglietto da fare sul posto o online (10 € a persona).'

2. Escursione alla Grande Muraglia Cinese (Mutianyu)
- date: '2026-11-30'
- time: '07:30'
- duration: '4h 00m'
- address: 'Mutianyu Great Wall, Huairou District, Pechino, Cina'
- cost: '0.00'
- status: 'da_saldare'
- noteCopilota: 'Scalo a Pechino (18h 35m). Salita in funivia e discesa in toboggan da pagare in loco. Ottimizzare i tempi per il centro.'

3. Piazza Tienanmen e Centro Storico di Pechino
- date: '2026-11-30'
- time: '13:00'
- duration: '2h 00m'
- address: 'Piazza Tienanmen, Dongcheng District, Pechino, Cina'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Accesso pedonale con controllo passaporto. Spostamento a piedi verso Siji Minfu (Wangfujing) per il pranzo.'

4. Passeggiata Centro Auckland & Waterfront
- date: '2026-12-01'
- time: '19:30'
- duration: '1h 30m'
- address: 'Queen Street & Viaduct Harbour, Auckland CBD 1010, Nuova Zelanda'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Passeggiata serale di ambientamento post-volo dopo il check-in al Noa Hotel.'

5. Waitomo Caves (Glowworm Caves Tour)
- date: '2026-12-02'
- time: '14:50'
- duration: '1h 00m'
- address: '39 Waitomo Village Road, Waitomo Caves 3981, Nuova Zelanda'
- cost: '84.58'
- status: 'saldato'
- noteCopilota: 'Prenotato su GetYourGuide. Tour in barca sotterranea con larve luminose. Temperatura 12-14 °C (felpa consigliata). Divieto di foto.'

6. Hobbiton Movie Set Tour
- date: '2026-12-03'
- time: '11:00'
- duration: '3h 00m'
- address: 'The Shires Rest, 501 Buckland Road, Hinuera, Matamata 3472, Nuova Zelanda'
- cost: '129.36'
- status: 'saldato'
- noteCopilota: 'Prenotato su GetYourGuide. Partenza da Waitomo ore 08:30 max. Presentarsi alle 10:45. Bevanda inclusa al Green Dragon Inn.'

7. Esperienza Culturale Maori Te Pā Tū con Cena
- date: '2026-12-03'
- time: '17:00'
- duration: '3h 30m'
- address: '1220 State Highway 5, Tumunui, Rotorua 3073, Nuova Zelanda'
- cost: '288.58'
- status: 'saldato'
- noteCopilota: 'Prenotato su GetYourGuide (Ref: 3KQIPMAAZJD6CHQ8VYDBGVT1FDXMDDCF). Include cerimoniale maori e cena tradizionale Hāngi. Termine ore 20:30.'

8. Polynesian Spa (Relax Termale Serale)
- date: '2026-12-03'
- time: '21:00'
- duration: '1h 30m'
- address: '1000 Hinemoa Street, Rotorua 3010, Nuova Zelanda'
- cost: '40.00'
- status: 'da_saldare'
- noteCopilota: 'Piscine termali minerali sul lago Rotorua. Ingresso serale da fare sul posto dopo Te Pā Tū.'

9. Wai-O-Tapu Thermal Wonderland & Lady Knox Geyser
- date: '2026-12-04'
- time: '10:15'
- duration: '2h 00m'
- address: '201 Waiotapu Loop Road, Rotorua 3073, Nuova Zelanda'
- cost: '40.00'
- status: 'da_saldare'
- noteCopilota: 'Partenza da Rotorua ore 09:15. Eruzione guidata Lady Knox Geyser ore 10:15 tassative. A seguire Champagne Pool.'

10. Trekking Tongariro Alpine Crossing
- date: '2026-12-05'
- time: '06:30'
- duration: '7h 30m'
- address: 'Mangatepopo Road End, Tongariro National Park 3989, Nuova Zelanda'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Trekking impegnativo di 19,4 km. Registrare pass su doc.govt.nz. Portare cibo, giacca a vento e 2L d acqua. All arrivo docce calde al Kiwi Camp.'

11. Kaikoura Whale Watch
- date: '2026-12-07'
- time: '08:30'
- duration: '3h 30m'
- address: 'Whaleway Station Road, Kaikoura 7300, Nuova Zelanda'
- cost: '174.14'
- status: 'saldato'
- noteCopilota: 'Prenotato su GetYourGuide. Presentarsi ore 08:10 per check-in. Pastiglia per mal di mare consigliata 30 min prima.'

12. Hokitika Gorge Walk
- date: '2026-12-08'
- time: '11:30'
- duration: '1h 15m'
- address: 'Kokatahi 7881, West Coast, Nuova Zelanda'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Ponte sospeso sulle acque turchesi delle gole glaciali.'

13. Franz Josef Glacier Walk (Sentiero Fondovalle)
- date: '2026-12-08'
- time: '16:00'
- duration: '1h 30m'
- address: 'Franz Josef Glacier Access Road, Franz Josef 7886, Nuova Zelanda'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Passeggiata pianeggiante sul letto ghiaioso fino al belvedere di sicurezza sul fronte del ghiacciaio.'

14. Fox Glacier Heli-Hike (Escursione sul Ghiacciaio con Elicottero)
- date: '2026-12-09'
- time: '08:50'
- duration: '3h 00m'
- address: 'Fox Glacier Guiding Base, 44 Main Road, Fox Glacier 7886, Nuova Zelanda'
- cost: '852.82'
- status: 'saldato'
- noteCopilota: 'Prenotato su Headout. Include volo in elicottero e guida su ghiaccio. Controllare stato meteo la mattina stessa alle 07:30.'

15. Fox Glacier Glow Worm Forest Walk
- date: '2026-12-09'
- time: '21:30'
- duration: '0h 45m'
- address: 'Minnehaha Walk, State Highway 6, Fox Glacier 7886, Nuova Zelanda'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Sentiero notturno gratuito nella foresta pluviale. Spegnere le torce per vedere le larve luminose.'

16. Lake Matheson Jetty Viewpoint Walk
- date: '2026-12-10'
- time: '08:00'
- duration: '0h 45m'
- address: 'Lake Matheson Road, Fox Glacier 7886, Nuova Zelanda'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Mattina presto con acqua piatta per il riflesso di Mount Cook e Mount Tasman sul lago.'

17. Crociera Milford Sound (Cruise Milford NZ)
- date: '2026-12-12'
- time: '09:45'
- duration: '2h 00m'
- address: 'Milford Sound Visitor Terminal, Milford Sound Hwy 1, Fiordland 9679, Nuova Zelanda'
- cost: '154.08'
- status: 'saldato'
- noteCopilota: 'Prenotata su Booking. Banco Cruise Milford (secondo a sinistra). Parcheggio a pagamento a 10 min a piedi dal molo.'

18. Opuke Thermal Pools & Spa
- date: '2026-12-14'
- time: '10:30'
- duration: '2h 00m'
- address: '47 Mount Hutt Station Road, Methven 7730, Nuova Zelanda'
- cost: '55.00'
- status: 'da_saldare'
- noteCopilota: 'Piscine termali alimentate a energia solare con vista alpina lungo la rotta Fairlie -> Christchurch.'

19. Tour a Piedi di Christchurch Centro
- date: '2026-12-14'
- time: '15:30'
- duration: '2h 30m'
- address: 'Cathedral Square, Christchurch Central City 8011, Nuova Zelanda'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Giro a piedi: Riverside Market, Bridge of Remembrance, fiume Avon, Cardboard Cathedral e New Regent Street.'

20. Seal Bay Conservation Park (Leoni Marini)
- date: '2026-12-16'
- time: '11:30'
- duration: '1h 30m'
- address: 'Seal Bay Road, Kangaroo Island SA 5221, Australia'
- cost: '50.00'
- status: 'da_saldare'
- noteCopilota: 'Visita guidata con ranger sulla spiaggia a pochi metri dalla colonia protetta di leoni marini.'

21. Flinders Chase National Park: Remarkable Rocks & Admirals Arch
- date: '2026-12-16'
- time: '15:00'
- duration: '3h 00m'
- address: 'Cape du Couedic Road, Flinders Chase SA 5223, Australia'
- cost: '0.00'
- status: 'da_saldare'
- noteCopilota: 'Sculture di granito e arco naturale con otarie della Nuova Zelanda. Accesso con pass parco Kangaroo Island.'

22. Hanson Bay Wildlife Sanctuary (Koala Walk)
- date: '2026-12-17'
- time: '09:00'
- duration: '1h 30m'
- address: '7797 South Coast Road, Karatta SA 5223, Australia'
- cost: '30.00'
- status: 'da_saldare'
- noteCopilota: 'Passeggiata tra eucalipti per avvistamento koala ed echidne prima di raggiungere il traghetto a Penneshaw.'

23. Maits Rest Rainforest Walk (Great Ocean Road)
- date: '2026-12-19'
- time: '11:00'
- duration: '0h 30m'
- address: 'Great Ocean Road, Cape Otway VIC 3233, Australia'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Passerella in legno tra felci arborescenti secolari lungo la Great Ocean Road.'

24. Dodici Apostoli, Gibson Steps & Loch Ard Gorge (Tramonto)
- date: '2026-12-19'
- time: '18:30'
- duration: '2h 30m'
- address: 'Great Ocean Road, Princetown VIC 3269, Australia'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Discesa a Gibson Steps sulla battigia, visita a Loch Ard Gorge e tramonto panoramico sui 12 Apostoli.'

25. Tour a Piedi Melbourne Centro & Vicoli Street Art
- date: '2026-12-20'
- time: '11:00'
- duration: '3h 00m'
- address: 'Flinders Street Station / Hosier Lane, Melbourne VIC 3000, Australia'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Van parcheggiato al Queen Victoria Market. Tour per Degraves St, Federation Square e Hosier Lane.'

26. Trekking Vetta Mount Oberon (Wilsons Promontory)
- date: '2026-12-21'
- time: '09:30'
- duration: '2h 30m'
- address: 'Telegraph Saddle Car Park, Wilsons Promontory VIC 3960, Australia'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Salita di 3,4 km a/r con vista panoramica a 360° su Tidal River e le baie del parco.'

27. Prom Wildlife Walk (Avvistamento Vombati e Canguri)
- date: '2026-12-21'
- time: '15:30'
- duration: '0h 45m'
- address: 'Prom Wildlife Walk, Wilsons Promontory VIC 3960, Australia'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Passeggiata in pianura con altissima concentrazione di vombati selvatici al pascolo pomeridiano.'

28. Dolphin Cruise Jervis Bay
- date: '2026-12-24'
- time: '10:00'
- duration: '1h 30m'
- address: '50 Owen Street, Huskisson NSW 2540, Australia'
- cost: '70.00'
- status: 'da_saldare'
- noteCopilota: 'Crociera avvistamento branchi di delfini residenti a Jervis Bay. Da confermare/saldare sul posto.'

29. Booderee National Park: Snorkeling e Spiagge (Green Patch & Murrays Beach)
- date: '2026-12-24'
- time: '13:00'
- duration: '4h 00m'
- address: 'Jervis Bay Territory 2540, Australia'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Spiagge bianche con canguri sulla sabbia a Green Patch. Ingresso parco auto ~13 AUD.'

30. Wentworth Falls Track (Blue Mountains)
- date: '2026-12-25'
- time: '14:00'
- duration: '0h 45m'
- address: 'Sir H Burrell Drive, Wentworth Falls NSW 2782, Australia'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Giorno di Natale: dopo barbecue picnic all aperto, passeggiata panoramica sul bordo della scarpata Jamison Valley.'

31. Echo Point (Three Sisters) & Katoomba Falls Walk
- date: '2026-12-25'
- time: '16:30'
- duration: '1h 30m'
- address: 'Echo Point Road, Katoomba NSW 2780, Australia'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Punto iconico delle Three Sisters nel tardo pomeriggio con luce calda.'

32. Sydney Centro: Opera House, The Rocks & Botanic Gardens
- date: '2026-12-26'
- time: '14:00'
- duration: '3h 30m'
- address: 'Circular Quay & Bennelong Point, Sydney NSW 2000, Australia'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Passeggiata: The Rocks Market, Opera House, Royal Botanic Garden e Mrs Macquarie s Chair.'

33. Manly Beach & Shelly Beach Walk (Snorkeling & Relax)
- date: '2026-12-27'
- time: '11:00'
- duration: '3h 00m'
- address: 'Marine Parade, Manly NSW 2095, Australia'
- cost: '0.00'
- status: 'gratuito'
- noteCopilota: 'Arrivo con traghetto da Circular Quay. Riserva marina protetta ideale per relax e snorkeling.'

34. Tour Privato in Barca Boracay (Island Hopping, Snorkeling & Grotte)
- date: '2026-12-30'
- time: '09:00'
- duration: '5h 00m'
- address: 'White Beach Station 2, Boracay Island, Malay, Aklan 5608, Filippine'
- cost: '60.00'
- status: 'da_saldare'
- noteCopilota: 'Barca locale privata concordata la mattina su White Beach. Tappe: Crocodile Island e Crystal Cove.'

35. Paraw Sunset Sailing (Vela Tradizionale al Tramonto)
- date: '2026-12-30'
- time: '16:45'
- duration: '1h 00m'
- address: 'White Beach Station 1/2, Boracay Island, Filippine'
- cost: '35.00'
- status: 'da_saldare'
- noteCopilota: 'Uscita a bordo di barca a vela tradizionale con bilancieri al calar del sole.'

36. Helmet Diving Experience (Passeggiata Subacquea)
- date: '2027-01-01'
- time: '14:30'
- duration: '1h 00m'
- address: 'White Beach Activity Float, Boracay, Filippine'
- cost: '50.00'
- status: 'da_saldare'
- noteCopilota: 'Camminata sul fondale marino a 3 metri di profondità con casco ossigenato.'

37. Briefing Obbligatorio Spedizione TAO Philippines
- date: '2027-01-02'
- time: '17:30'
- duration: '1h 30m'
- address: 'Ufficio TAO Philippines, El Nido Town Proper, Palawan 5313, Filippine'
- cost: '0.00'
- status: 'saldato'
- noteCopilota: 'Presenza obbligatoria subito dopo il volo per ritiro sacche stagne e istruzioni di navigazione.'

38. Spedizione Avventura TAO Philippines (El Nido -> Coron)
- date: '2027-01-03'
- time: '08:30'
- duration: '4 giorni'
- address: 'Molo di El Nido Town, Palawan, Filippine'
- cost: '0.00'
- status: 'saldato'
- noteCopilota: 'Costo 1.410,65 € già computato nel modulo trasporti. Navigazione tra Linapacan e Culion con campi base su isole remote.'
`;

const lines = data.trim().split('\n');
const results = [];
let current = null;

for (const line of lines) {
    if (line.match(/^\d+\./)) {
        if (current) results.push(current);
        const title = line.replace(/^\d+\.\s*/, '').trim();
        current = { title };
    } else if (line.startsWith('- date:')) {
        current.date = line.replace('- date:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- time:')) {
        current.time = line.replace('- time:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- duration:')) {
        current.duration = line.replace('- duration:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- address:')) {
        current.address = line.replace('- address:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- cost:')) {
        current.cost = line.replace('- cost:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- status:')) {
        current.status = line.replace('- status:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- noteCopilota:')) {
        current.noteCopilota = line.replace('- noteCopilota:', '').replace(/'/g, '').trim();
    }
}
if (current) results.push(current);

const fileContent = "import type { Attivita } from '../types';\n\n" +
"export const REAL_ACTIVITIES: Omit<Attivita, 'createdAt' | 'updatedAt'>[] = [\n" +
results.map((r, i) => {
    const id = (i + 1).toString().padStart(2, '0');
    // Note: status from user is 'saldato', 'da_saldare' or 'gratuito'.
    // paymentStatus expects 'saldato' | 'da_saldare'.
    let payStatus = r.status === 'gratuito' ? 'saldato' : r.status;
    let actStatus = 'prenotato'; // default required by interface is StatoAttivita ('prenotato' | 'da_valutare' | 'non_bloccato' | 'libero')
    if (r.status === 'gratuito') actStatus = 'libero';
    
    return "  {\n" +
    "    id: 'att_" + id + "',\n" +
    "    dayId: 'day_" + r.date + "',\n" +
    "    date: `" + r.date + "`,\n" +
    "    title: `" + r.title + "`,\n" +
    "    time: `" + r.time + "`,\n" +
    "    duration: `" + r.duration + "`,\n" +
    "    address: `" + r.address + "`,\n" +
    "    location: `" + r.address + "`,\n" + // required by interface
    "    cost: `" + r.cost + "`,\n" +
    "    paymentStatus: `" + payStatus + "`,\n" +
    "    status: `" + actStatus + "`,\n" +
    "    category: 'altro',\n" + // required by interface
    "    noteCopilota: `" + r.noteCopilota + "`\n" +
    "  }";
}).join(',\n') +
"\n];\n";

fs.writeFileSync('src/storage/seedActivities.ts', fileContent, 'utf8');
console.log("seedActivities.ts generated!");
