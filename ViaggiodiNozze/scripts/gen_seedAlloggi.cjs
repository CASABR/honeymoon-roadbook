const fs = require('fs');
const path = require('path');

const data = `
1. a&o Hostel Milano Ca Granda
- date: '2026-11-28'
- checkIn: '15:00'
- checkOut: '10:00'
- cost: '61.95'
- depositPaid: '61.95'
- status: 'saldato'
- address: 'Viale Fulvio Testi / Viale Suzzani 13/15, 20162 Milano, Italia'
- noteCopilota: 'Reception aperta 24h. Check-in dalle 15:00. Comodo per la metro Ca Granda e trasferimento a Malpensa la mattina del 29.'

2. Noa Hotel (Auckland)
- date: '2026-12-01'
- checkIn: '14:00 - 20:00'
- checkOut: '10:00'
- cost: '51.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '9 Manukau Road, Epsom, Auckland 1023, Nuova Zelanda'
- noteCopilota: 'Reception aperta fino alle 20:00. Atterrando alle 17:34, raggiungere subito l hotel per il check-in prima della chiusura. Saldo con carta in loco.'

3. Waitomo Village Chalets Home of Kiwipaka
- date: '2026-12-02'
- checkIn: '14:00 - 18:00'
- checkOut: '10:00'
- cost: '68.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '1227 Waitomo Valley Road / Hotel Access Rd, Waitomo Caves 3977, Nuova Zelanda'
- noteCopilota: 'Reception chiude alle 18:00. Se si arriva dopo la visita alle grotte (Waitomo tour ore 14:50), avvisare in anticipo per keybox.'

4. Wylie Court Motor Lodge (Rotorua)
- date: '2026-12-03'
- checkIn: '15:00 - 20:00'
- checkOut: '10:00'
- cost: '106.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '345 Fenton Street, Glenholme, Rotorua 3010, Nuova Zelanda'
- noteCopilota: 'CHECK-IN TASSATIVO ENTRO LE 20:00! Presentarsi entro le 16:30 per depositare i bagagli prima dello spettacolo Te Pa Tu delle 17:00.'

5. National Park Backpackers (Tongariro)
- date: '2026-12-04'
- checkIn: '14:00 - 20:00'
- checkOut: '10:00'
- cost: '47.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '4 Findlay Street, National Park Village 3994, Nuova Zelanda'
- noteCopilota: 'Base per il Tongariro Crossing. Reception chiude alle 20:00. Four Square a 2 minuti a piedi per spesa pranzo al sacco del trekking.'

6. Totara Lodge Motel (Hutt Valley / Levin)
- date: '2026-12-05'
- checkIn: '14:00 - 20:30'
- checkOut: '10:00'
- cost: '51.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '68 Ararino Street, Trentham, Upper Hutt 5018, Nuova Zelanda'
- noteCopilota: 'Tappa di riposo post-Tongariro. Comodo per raggiungere il terminal traghetti Bluebridge a Wellington la mattina dopo (30 min di auto).'

7. Kaikoura Seaside Lodge
- date: '2026-12-06'
- checkIn: '14:00 - 20:00'
- checkOut: '10:00'
- cost: '50.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '268 The Esplanade, Kaikoura 7300, Nuova Zelanda'
- noteCopilota: 'Sul lungomare. Arrivo previsto dopo le 19:00 dallo sbarco a Picton; avvisare la struttura se si tarda oltre le 20:00.'

8. Otira Stagecoach Hotel
- date: '2026-12-07'
- checkIn: '14:00 - 19:00'
- checkOut: '10:00'
- cost: '72.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '6435 Otira Highway (State Highway 73), Otira 7875, Nuova Zelanda'
- noteCopilota: 'Hotel d epoca isolato nel valico di Arthur s Pass. Arrivare entro le 19:00 per check-in e cena nel pub storico (non ci sono altri servizi vicini).'

9. Haka House Franz Josef
- date: '2026-12-08'
- checkIn: '14:00 - 20:00'
- checkOut: '10:00'
- cost: '68.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '2-4 Cron Street, Franz Josef Glacier 7856, Nuova Zelanda'
- noteCopilota: 'Base per l escursione al ghiacciaio e l helihike del mattino seguente.'

10. Ivorytowers Backpacker Lodge (Fox Glacier)
- date: '2026-12-09'
- checkIn: '14:00 - 20:00'
- checkOut: '10:00'
- cost: '49.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: 'Sullivan Road, Fox Glacier 7886, Nuova Zelanda'
- noteCopilota: 'Vicino alla Fox Glacier Glow Worm Forest (sentiero gratuito a piedi la sera per larve luminose).'

11. Cardrona Hotel
- date: '2026-12-10'
- checkIn: '15:00 - 21:00'
- checkOut: '10:00'
- cost: '79.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '2320 Cardrona Valley Road, Cardrona 9382, Nuova Zelanda'
- noteCopilota: 'Storico pub/hotel lungo la scenografica Crown Range Road verso Queenstown.'

12. Eglinton Valley Camp
- date: '2026-12-11'
- checkIn: '14:00 - 19:30'
- checkOut: '10:00'
- cost: '85.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: 'Milford Road (SH94), Knobs Flat, Fiordland National Park 9679, Nuova Zelanda'
- noteCopilota: 'Costo 150 NZD. Immerso nel parco verso Milford Sound. TOTALE ASSENZA DI SEGNALE CELLULARE E POMPE BENZINA: fare il pieno e scaricare mappe a Te Anau.'

13. New Orleans Hotel (Arrowtown)
- date: '2026-12-12'
- checkIn: '14:00 - 21:00'
- checkOut: '10:00'
- cost: '85.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '27 Buckingham Street, Arrowtown 9302, Nuova Zelanda'
- noteCopilota: 'Nel borgo dei cercatori d oro di Arrowtown, dopo la crociera a Milford Sound.'

14. Fairlie Holiday Park
- date: '2026-12-13'
- checkIn: '14:00 - 19:00'
- checkOut: '10:00'
- cost: '61.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '12 Allandale Road, Fairlie 7925, Nuova Zelanda'
- noteCopilota: 'Prenotazione #5240984461. Booking.com addebita automaticamente NZD 121,77 il 09/12/2026. Per late check-in contattare la struttura prima delle 19:00. Al mattino colazione imperdibile alla celebre Fairlie Bakehouse.'

15. MCM Motel Christchurch
- date: '2026-12-14'
- checkIn: '14:00 - 23:30'
- checkOut: '10:00'
- cost: '65.00'
- depositPaid: '65.00'
- status: 'saldato'
- address: '241 Bealey Ave Central, Edgeware, Christchurch 8014, Nuova Zelanda'
- noteCopilota: 'Prenotazione #6374734052, pagata con Booking.com (NZD 130,68). Check-in fino alle 23:30. Comodo per visitare il centro e vicino all aeroporto per riconsegna auto Snap Rentals entro le 12:00 del 15.'

16. BreakFree Wirrina Cove (Fleurieu / Adelaide)
- date: '2026-12-15'
- checkIn: '14:00 - 16:00'
- checkOut: '10:00'
- cost: '99.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '172 Paradise Drive, Wirrina Cove SA 5204, Australia'
- noteCopilota: 'Prenotazione #5520470035, PIN Booking 3589. Totale AUD 160 da saldare: Booking.com addebiterà la carta. Comunicare in anticipo l orario di arrivo: reception 07:00-16:00 dom-lun / fino alle 20:00 mer-sab. Deposito cauzionale AUD 100 con carta all arrivo. A 15 minuti dal molo di Cape Jervis per l imbarco mattutino verso Kangaroo Island (ore 07:05).'

17. Discovery Parks - Kangaroo Island
- date: '2026-12-16'
- checkIn: '14:00 - 18:00'
- checkOut: '10:00'
- cost: '123.00'
- depositPaid: '123.00'
- status: 'saldato'
- address: 'Coles Point Road, American River SA 5221, Australia'
- noteCopilota: 'Prenotazione #13830597 confermata. Rientro verso Penneshaw la mattina successiva per traghetto delle 12:20.'

18. Melbourne BIG4 Holiday Park (Tullamarine)
- date: '2026-12-17'
- checkIn: '14:00 - 23:00'
- checkOut: '10:00'
- cost: '44.93'
- depositPaid: '44.93'
- status: 'saldato'
- address: '265 Elizabeth Street, Coburg VIC 3058, Australia'
- noteCopilota: 'Piazzola van. Arrivo dopo il ritiro notturno del Budgie Van a Tullamarine. Seguire istruzioni late check-in se reception chiusa.'

19. Lorne Foreshore Caravan Park
- date: '2026-12-18'
- checkIn: '14:00 - 18:00'
- checkOut: '10:00'
- cost: '38.12'
- depositPaid: '38.12'
- status: 'saldato'
- address: '2 Great Ocean Road, Lorne VIC 3232, Australia'
- noteCopilota: 'Booking ID: 1267354 (Erskine River Park). Sosta con van lungo la Great Ocean Road.'

20. NRMA Port Campbell Holiday Park
- date: '2026-12-19'
- checkIn: '14:00 - 18:00'
- checkOut: '10:00'
- cost: '30.88'
- depositPaid: '30.88'
- status: 'saldato'
- address: '30 Morris Street, Port Campbell VIC 3269, Australia'
- noteCopilota: 'Confermato. A pochi minuti dai 12 Apostoli e Loch Ard Gorge per il tramonto.'

21. Seaspray Caravan Park (SICP)
- date: '2026-12-20'
- checkIn: '14:00 - 18:00'
- checkOut: '10:00'
- cost: '38.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: '1 Futcher Street, Seaspray VIC 3851, Australia'
- noteCopilota: 'Piazzola con corrente (62 AUD). CONFERMATO DA KAREN VIA EMAIL: DA PAGARE IN CONTANTI/CARTA ALL ARRIVO.'

22. Yarram Holiday Park
- date: '2026-12-21'
- checkIn: '14:00 - 18:00'
- checkOut: '10:00'
- cost: '28.46'
- depositPaid: '28.46'
- status: 'saldato'
- address: '375 Commercial Road, Yarram VIC 3971, Australia'
- noteCopilota: 'Prenotazione #965 confermata. Vicino a Wilsons Promontory.'

23. Hobart Beach Campground (Bournda / Ben Boyd NP)
- date: '2026-12-22'
- checkIn: '14:00 - 20:00'
- checkOut: '10:00'
- cost: '25.00'
- depositPaid: '25.00'
- status: 'saldato'
- address: 'Bournda National Park, Wallagoot NSW 2548, Australia'
- noteCopilota: 'Prenotazione NSW Parks #S7PT6N6H4Y confermata. Immerso nella natura vicino a Merimbula.'

24. Holiday Haven Huskisson Beach (Jervis Bay)
- date: '2026-12-23'
- checkIn: '14:00 - 17:00'
- checkOut: '10:00'
- cost: '74.00'
- depositPaid: '74.00'
- status: 'saldato'
- address: '17A Beach Street, Huskisson NSW 2540, Australia'
- noteCopilota: 'Prenotazione #436129 SALDATA ($120 AUD). Check-out il 24 mattina verso le spiagge di Jervis Bay.'

25. Werri Beach Holiday Park (Gerringong)
- date: '2026-12-24'
- checkIn: '14:00 - 18:00'
- checkOut: '10:00'
- cost: '48.00'
- depositPaid: '48.00'
- status: 'saldato'
- address: '1A Bridges Road, Gerringong NSW 2534, Australia'
- noteCopilota: 'Prenotazione #372403 (78 AUD). PAGAMENTO IN CORSO/effettuato. VIGILIA DI NATALE: Nessuna sbarra (boom gate), partenza libera all alba di Natale per le Blue Mountains.'

26. Grand View Hotel (Blue Mountains)
- date: '2026-12-25'
- checkIn: '14:00 - 20:00'
- checkOut: '10:00'
- cost: '98.00'
- depositPaid: '98.00'
- status: 'saldato'
- address: '174 Great Western Highway, Wentworth Falls NSW 2782, Australia'
- noteCopilota: 'Notte di Natale. Vicino a Echo Point e Wentworth Falls.'

27. Hotel St Leonards (Sydney - Notte 1/2)
- date: '2026-12-26'
- checkIn: '14:00 - 21:00'
- checkOut: '10:00'
- cost: '171.00'
- depositPaid: '171.00'
- status: 'saldato'
- address: '18 Albany Street, St Leonards, Sydney NSW 2065, Australia'
- noteCopilota: 'Costo 171 € copre le 2 notti (26-28 Dicembre). Comodo con la stazione treni di St Leonards per il centro.'

28. Hotel St Leonards (Sydney - Notte 2/2)
- date: '2026-12-27'
- checkIn: '14:00'
- checkOut: '10:00'
- cost: '0.00'
- depositPaid: '0.00'
- status: 'saldato'
- address: '18 Albany Street, St Leonards, Sydney NSW 2065, Australia'
- noteCopilota: 'Seconda notte inclusa nel saldo precedente. Partenza la mattina del 28 alle 07:30 per riconsegna van.'

29. Tess and Tessha Condotel (Manila T3)
- date: '2026-12-28'
- checkIn: '14:00 - 23:00'
- checkOut: '11:00'
- cost: '25.00'
- depositPaid: '25.00'
- status: 'saldato'
- address: 'Newport Boulevard, Newport City, Pasay, Metro Manila 1309, Filippine'
- noteCopilota: 'Sosta notturna pedonale dal Terminal 3 (Runway Manila). Volo per Boracay la mattina successiva alle 08:50.'

30. Poseidon Hotel Boracay (Notte 1/4)
- date: '2026-12-29'
- checkIn: '14:00 - 22:00'
- checkOut: '12:00'
- cost: '191.00'
- depositPaid: '191.00'
- status: 'saldato'
- address: 'Station 2, Balabag, Boracay Island, Malay, Aklan 5608, Filippine'
- noteCopilota: 'Costo 191 € copre le 4 notti (29 Dic - 02 Gen). Hotel accreditato DOT (necessario per accesso all isola al porto).'

31. Poseidon Hotel Boracay (Notte 2/4)
- date: '2026-12-30'
- checkIn: '14:00'
- checkOut: '12:00'
- cost: '0.00'
- depositPaid: '0.00'
- status: 'saldato'
- address: 'Station 2, Balabag, Boracay Island, Malay, Aklan 5608, Filippine'
- noteCopilota: 'Seconda notte Boracay. Island hopping e Paraw al tramonto.'

32. Poseidon Hotel Boracay (Notte 3/4)
- date: '2026-12-31'
- checkIn: '14:00'
- checkOut: '12:00'
- cost: '0.00'
- depositPaid: '0.00'
- status: 'saldato'
- address: 'Station 2, Balabag, Boracay Island, Malay, Aklan 5608, Filippine'
- noteCopilota: 'Notte di San Silvestro e Capodanno sulla White Beach.'

33. Poseidon Hotel Boracay (Notte 4/4)
- date: '2027-01-01'
- checkIn: '14:00'
- checkOut: '12:00'
- cost: '0.00'
- depositPaid: '0.00'
- status: 'saldato'
- address: 'Station 2, Balabag, Boracay Island, Malay, Aklan 5608, Filippine'
- noteCopilota: 'Ultima notte a Boracay. Relax e preparazione bagagli per volo su El Nido del 2 gennaio.'

34. Desert Rose Hotel (El Nido)
- date: '2027-01-02'
- checkIn: '14:00 - 20:00'
- checkOut: '11:00'
- cost: '53.00'
- depositPaid: '53.00'
- status: 'saldato'
- address: 'Corong Corong, El Nido, Palawan 5313, Filippine'
- noteCopilota: 'A Corong-Corong. Deposito bagagli e presenza obbligatoria al briefing pomeridiano della spedizione TAO.'

35. TAO Philippines Island Camps (Campi Base Spedizione - 4 Notti)
- date: '2027-01-03'
- checkIn: '08:30'
- checkOut: '12:00 (07 Gen)'
- cost: '0.00'
- depositPaid: '0.00'
- status: 'saldato'
- address: 'Isole remote Linapacan / Culion, Palawan, Filippine'
- noteCopilota: '4 notti nei campi base inclusi nel pacchetto TAO (1.410,65 € già a bilancio nei trasporti). Capanne Tuka, portare solo sacca stagna (Dry Bag).'

36. A&A Bed and Breakfast / Bayfront Inn (Coron)
- date: '2027-01-07'
- checkIn: '14:00 - 20:00'
- checkOut: '11:00'
- cost: '35.00'
- depositPaid: '0.00'
- status: 'da_saldare'
- address: 'National Highway, Coron Town Proper, Coron, Palawan 5316, Filippine'
- noteCopilota: 'Notte di decompressione a Coron dopo lo sbarco della spedizione marittima.'

37. Appleton Boutique Hotel (Cebu Mactan)
- date: '2027-01-08'
- checkIn: '14:00 - 23:59'
- checkOut: '12:00'
- cost: '37.66'
- depositPaid: '37.66'
- status: 'saldato'
- address: 'Maximo V. Patalinghug Jr. Avenue, Basak, Lapu-Lapu City, Cebu 6015, Filippine'
- noteCopilota: 'A 10 min dall aeroporto di Cebu Mactan (CEB). Ultima notte prima dei voli di rientro intercontinentali del 9 gennaio.'
`;

const lines = data.trim().split('\n');
const results = [];
let current = null;

const addDays = (dateStr, days) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
};

for (const line of lines) {
    if (line.match(/^\d+\./)) {
        if (current) results.push(current);
        const name = line.replace(/^\d+\.\s*/, '').trim();
        current = { name };
    } else if (line.startsWith('- date:')) {
        current.date = line.replace('- date:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- checkIn:')) {
        current.checkIn = line.replace('- checkIn:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- checkOut:')) {
        current.checkOut = line.replace('- checkOut:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- cost:')) {
        current.cost = line.replace('- cost:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- depositPaid:')) {
        current.depositPaid = line.replace('- depositPaid:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- status:')) {
        current.status = line.replace('- status:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- address:')) {
        current.address = line.replace('- address:', '').replace(/'/g, '').trim();
    } else if (line.startsWith('- noteCopilota:')) {
        current.noteCopilota = line.replace('- noteCopilota:', '').replace(/'/g, '').trim();
    }
}
if (current) results.push(current);

const fileContent = "import type { Alloggio, StatoAlloggio } from '../types';\n\n" +
"export const initialAlloggi: Omit<Alloggio, 'id' | 'updatedAt' | 'createdAt'>[] = [\n" +
results.map(r => {
    let checkOutDate = addDays(r.date, 1);
    
    if (r.name.includes("TAO Philippines")) {
        checkOutDate = '2027-01-07';
    } else if (r.name.includes("Hotel St Leonards (Sydney - Notte 1/2)")) {
        checkOutDate = '2026-12-27';
    } else if (r.name.includes("Poseidon Hotel Boracay (Notte 1/4)")) {
        checkOutDate = '2026-12-30';
    } else if (r.name.includes("Poseidon Hotel Boracay (Notte 2/4)")) {
        checkOutDate = '2026-12-31';
    } else if (r.name.includes("Poseidon Hotel Boracay (Notte 3/4)")) {
        checkOutDate = '2027-01-01';
    } else if (r.name.includes("Poseidon Hotel Boracay (Notte 4/4)")) {
        checkOutDate = '2027-01-02';
    }

    let cleanCheckOutTime = r.checkOut;
    if (cleanCheckOutTime.includes('(')) {
        cleanCheckOutTime = cleanCheckOutTime.split('(')[0].trim();
    }

    return "  {\n" +
    "    name: `" + r.name + "`,\n" +
    "    checkIn: `" + r.date + "`,\n" +
    "    checkInTime: `" + r.checkIn + "`,\n" +
    "    checkOut: `" + checkOutDate + "`,\n" +
    "    checkOutTime: `" + cleanCheckOutTime + "`,\n" +
    "    cost: `" + r.cost + "`,\n" +
    "    acconto: `" + r.depositPaid + "`,\n" +
    "    paymentStatus: `" + r.status + "`,\n" +
    "    status: 'completato',\n" +
    "    address: `" + r.address + "`,\n" +
    "    location: `" + r.address + "`,\n" +
    "    noteCopilota: `" + r.noteCopilota + "`\n" +
    "  }";
}).join(',\n') +
"\n];\n";

fs.writeFileSync('src/storage/seedAlloggi.ts', fileContent, 'utf8');
console.log("seedAlloggi.ts generated!");
