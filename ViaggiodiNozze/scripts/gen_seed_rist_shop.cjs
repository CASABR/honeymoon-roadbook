const fs = require('fs');

const rawRistoranti = `
1. Starita Milano
- date: '2026-11-28'
- mealType: 'cena'
- address: 'Via Gherardini 1, 20154 Milano, Italia'
- cost: '35.00'
- status: 'da_saldare'
- noteCopilota: 'Pizza napoletana tradizionale prima della passeggiata serale sui Navigli.'

2. Siji Minfu (四季民福烤鸭店)
- date: '2026-11-30'
- mealType: 'pranzo'
- address: '32 Dengshikou West Street, Dongcheng District, Pechino, Cina'
- cost: '45.00'
- status: 'da_saldare'
- noteCopilota: 'Celebre anatra laccata pechinese. SALTARE LA CODA: prendere numero virtuale ("取号") su mini-programma WeChat o app Dianping 60-90 min prima, oppure pranzare in fascia 14:00-16:30.'

3. Mamaku Blue Blueberry Experience
- date: '2026-12-03'
- mealType: 'snack'
- address: '311 Maraeroa Road, Mamaku, Rotorua 3072, Nuova Zelanda'
- cost: '15.00'
- status: 'da_saldare'
- noteCopilota: 'Sosta merenda pomeridiana post-Hobbiton a base di mirtilli freschi e dolci artigianali.'

4. The Station Cafe & Restaurant
- date: '2026-12-04'
- mealType: 'cena'
- address: 'Findlay Street, National Park Village 3994, Nuova Zelanda'
- cost: '40.00'
- status: 'da_saldare'
- noteCopilota: 'Cena sostanziosa pre-trekking all interno della storica stazione ferroviaria.'

5. Kaikoura Seafood BBQ Kiosk
- date: '2026-12-07'
- mealType: 'pranzo'
- address: '55 Fyffe Quay, Kaikoura 7300, Nuova Zelanda'
- cost: '35.00'
- status: 'da_saldare'
- noteCopilota: 'Chiosco all aperto sulla spiaggia subito dopo il Whale Watch: gamberi di mare (crayfish), capesante e fish chowder.'

6. Arthur's Pass Café
- date: '2026-12-07'
- mealType: 'snack'
- address: 'State Highway 73, Arthur s Pass Village 7654, Nuova Zelanda'
- cost: '15.00'
- status: 'da_saldare'
- noteCopilota: 'Sosta calda caffè e torta durante la traversata del valico alpino.'

7. Cook Saddle Cafe & Saloon
- date: '2026-12-09'
- mealType: 'cena'
- address: 'State Highway 6, Fox Glacier 7886, Nuova Zelanda'
- cost: '45.00'
- status: 'da_saldare'
- noteCopilota: 'Atmosfera western rustica con camino a legna dopo l helihike sul ghiacciaio.'

8. Fergburger Queenstown
- date: '2026-12-11'
- mealType: 'pranzo'
- address: '42 Shotover Street, Queenstown 9300, Nuova Zelanda'
- cost: '30.00'
- status: 'da_saldare'
- noteCopilota: 'Iconico hamburger gourmet. NOTA COPILOTA: Ordinare online su fergburger.com con 30-40 min di anticipo per ritirare al banco ed evitare 1 ora di coda sul marciapiede.'

9. Miles Better Pies
- date: '2026-12-12'
- mealType: 'pranzo'
- address: '2 Milford Crescent, Te Anau 9600, Nuova Zelanda'
- cost: '18.00'
- status: 'da_saldare'
- noteCopilota: 'Pasticci di carne e torte salate calde artigianali al rientro dalla crociera di Milford Sound.'

10. Mount Cook Alpine Salmon Shop
- date: '2026-12-13'
- mealType: 'pranzo'
- address: 'State Highway 8, Lake Pukaki 7999, Nuova Zelanda'
- cost: '25.00'
- status: 'da_saldare'
- noteCopilota: 'Sashimi freschissimo di salmone reale d alpeggio con vista sulle acque glaciali di Lake Pukaki.'

11. Fairlie Bakehouse
- date: '2026-12-14'
- mealType: 'colazione'
- address: '74 Main Street, Fairlie 7925, Nuova Zelanda'
- cost: '20.00'
- status: 'da_saldare'
- noteCopilota: 'La panetteria più famosa dell Isola del Sud: colazione con la premiata pie al maiale sfilacciato e mela o al salmone.'

12. Vivonne Bay General Store
- date: '2026-12-16'
- mealType: 'pranzo'
- address: 'South Coast Road, Vivonne Bay SA 5223, Australia'
- cost: '30.00'
- status: 'da_saldare'
- noteCopilota: 'Tappa gastronomica obbligata su Kangaroo Island per il celebre King George Whiting Burger.'

13. Yankalilla Bakery
- date: '2026-12-17'
- mealType: 'pranzo'
- address: '105 Main South Road, Yankalilla SA 5203, Australia'
- cost: '18.00'
- status: 'da_saldare'
- noteCopilota: 'Sosta veloce per pie e dolci durante la risalita da Cape Jervis verso Adelaide.'

14. Marlo Ocean View Takeaway & Kiosk
- date: '2026-12-22'
- mealType: 'pranzo'
- address: '1 Argyll Street, Marlo VIC 3888, Australia'
- cost: '25.00'
- status: 'da_saldare'
- noteCopilota: 'Fish and chips affacciati sull estuario dello Snowy River.'

15. Merimbula Aquarium & Wharf Restaurant
- date: '2026-12-22'
- mealType: 'cena'
- address: 'Lake Street, Merimbula NSW 2548, Australia'
- cost: '55.00'
- status: 'da_saldare'
- noteCopilota: 'Cena a base di pesce fresco sul pontile storico con vista oceano.'

16. Huskisson Hotel
- date: '2026-12-23'
- mealType: 'cena'
- address: '75 Owen Street, Huskisson NSW 2540, Australia'
- cost: '50.00'
- status: 'da_saldare'
- noteCopilota: 'Pub panoramico fronte oceano affacciato sulle acque di Jervis Bay.'

17. Huskisson Bakery & Cafe
- date: '2026-12-24'
- mealType: 'colazione'
- address: '11 Currambene Street, Huskisson NSW 2540, Australia'
- cost: '18.00'
- status: 'da_saldare'
- noteCopilota: 'Colazione con caffè espresso e lievitati prima della Dolphin Cruise.'

18. Wentworth Falls Lookout Picnic Area (Barbecue di Natale)
- date: '2026-12-25'
- mealType: 'pranzo'
- address: 'Sir H Burrell Drive, Wentworth Falls NSW 2782, Australia'
- cost: '0.00'
- status: 'saldato'
- noteCopilota: 'Pranzo di Natale: Barbecue autonomo sulle piastre elettriche gratuite del parco con la carne comprata la Vigilia.'

19. Opera Bar Sydney
- date: '2026-12-26'
- mealType: 'cena'
- address: 'Macquarie Street, Sydney NSW 2000, Australia'
- cost: '60.00'
- status: 'da_saldare'
- noteCopilota: 'Aperitivo e cena sul molo con vista diretta sull Harbour Bridge e sull Opera House illuminata.'

20. The Boathouse Shelly Beach
- date: '2026-12-27'
- mealType: 'pranzo'
- address: '1 Marine Parade, Manly NSW 2095, Australia'
- cost: '50.00'
- status: 'da_saldare'
- noteCopilota: 'Pranzo informale sulla sabbia di Shelly Beach dopo la traversata in traghetto da Circular Quay.'

21. BarLo Restaurant at Two Seasons
- date: '2026-12-29'
- mealType: 'pranzo'
- address: 'Station 1, Boracay Island, Malay, Aklan 5608, Filippine'
- cost: '25.00'
- status: 'da_saldare'
- noteCopilota: 'Famoso per la Four Cheese Pizza e il Four Cheese Sisig sul bagnasciuga di White Beach.'

22. Los Indios Bravos Boracay
- date: '2026-12-29'
- mealType: 'cena'
- address: 'White Beach Path, Station 1, Boracay, Filippine'
- cost: '35.00'
- status: 'da_saldare'
- noteCopilota: 'Gastropub artigianale con carni, frutti di mare e birre locali.'

23. Dos Mestizos Restaurant
- date: '2026-12-30'
- mealType: 'cena'
- address: 'Station 2, Main Road, Boracay, Filippine'
- cost: '40.00'
- status: 'da_saldare'
- noteCopilota: 'Cucina filippino-castigliana classica: imperdibile la Paella Negra con riso al nero di seppia.'

24. Dinibeach Bar & Restaurant
- date: '2026-12-31'
- mealType: 'pranzo'
- address: 'Diniwid Beach, Boracay, Filippine'
- cost: '30.00'
- status: 'da_saldare'
- noteCopilota: 'Pranzo fronte mare a base di carpaccio di tonno e pesce fresco nella baia di Diniwid.'

25. Cenone di Capodanno Boracay (Indigo o Ambassador in Paradise)
- date: '2026-12-31'
- mealType: 'cena'
- address: 'Station 1, White Beach, Boracay, Filippine'
- cost: '90.00'
- status: 'da_saldare'
- noteCopilota: 'Cenone di San Silvestro con tavolo sui teli di White Beach e vista sui fuochi artificiali.'

26. Subo Boracay
- date: '2027-01-01'
- mealType: 'cena'
- address: 'Calle Remedios, Station 3, Boracay, Filippine'
- cost: '35.00'
- status: 'da_saldare'
- noteCopilota: 'Ristorante tipico in legno e bambù con piatti della tradizione filippina serviti a lume di candela.'

27. Big Bad Thai El Nido
- date: '2027-01-02'
- mealType: 'cena'
- address: 'Calle Hama, Brgy. Buena Suerte, El Nido, Palawan, Filippine'
- cost: '25.00'
- status: 'da_saldare'
- noteCopilota: 'Cena sul balcone vista baia dopo il briefing obbligatorio della spedizione TAO.'
`;

const parseData = (raw, type) => {
    const lines = raw.trim().split('\n');
    const results = [];
    let current = null;

    for (const line of lines) {
        if (line.match(/^\d+\./)) {
            if (current) results.push(current);
            current = { name: line.replace(/^\d+\.\s*/, '').trim() };
        } else if (line.startsWith('- date:')) {
            current.date = line.replace('- date:', '').replace(/'/g, '').trim();
        } else if (line.startsWith('- mealType:')) {
            current.mealType = line.replace('- mealType:', '').replace(/'/g, '').trim();
        } else if (line.startsWith('- category:')) {
            current.category = line.replace('- category:', '').replace(/'/g, '').trim();
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
    return results;
};

const ristData = parseData(rawRistoranti);

const ristContent = "import type { Ristorante } from '../types';\n\n" +
"export const SEED_RISTORANTI: Omit<Ristorante, 'createdAt' | 'updatedAt'>[] = [\n" +
ristData.map((r, i) => {
    const id = (i + 1).toString().padStart(2, '0');
    return "  {\n" +
    "    id: 'rist_" + id + "',\n" +
    "    nome: `" + (r.name || '').replace(/`/g, "\\`") + "`,\n" +
    "    date: `" + r.date + "`,\n" +
    "    dayId: 'day_" + r.date + "',\n" +
    "    sottocategoria: '" + r.mealType + "',\n" +
    "    indirizzo: `" + (r.address || '').replace(/`/g, "\\`") + "`,\n" +
    "    budget: `" + r.cost + "`,\n" +
    "    status: '" + (r.status || 'da_saldare') + "',\n" +
    "    noteCopilota: `" + (r.noteCopilota || '').replace(/`/g, "\\`") + "`\n" +
    "  }";
}).join(',\n') +
"\n];\n";

fs.writeFileSync('src/storage/seedRistoranti.ts', ristContent, 'utf8');

const rawShopping = `
1. PAK'nSAVE Mt Albert / Auckland
- date: '2026-12-02'
- category: 'cambusa'
- address: '1167 New North Road, Mount Albert, Auckland 1025'
- cost: '60.00'
- noteCopilota: 'Prima grande spesa provviste (snack, acqua, frutta) subito dopo il ritiro auto a Snap Rentals.'

2. Four Square National Park
- date: '2026-12-04'
- category: 'cambusa'
- address: 'Buddo Street, National Park Village 3994'
- cost: '30.00'
- noteCopilota: 'SPESA TASSATIVA: comprare pane, frutta secca, cioccolata e almeno 4L d acqua per il pranzo al sacco del Tongariro Alpine Crossing.'

3. FreshChoice Te Anau
- date: '2026-12-11'
- category: 'cambusa'
- address: '5 Milford Crescent, Te Anau 9600'
- cost: '40.00'
- noteCopilota: 'ULTIMO SUPERMERCATO: rifornire viveri per cena e colazione prima di entrare nel parco isolato verso Eglinton Camp e Milford Sound.'

4. Pompa Benzina Allied Te Anau
- date: '2026-12-11'
- category: 'rifornimento'
- address: 'Te Anau-Milford Highway, Te Anau 9600'
- cost: '0.00'
- noteCopilota: 'PIENO ASSOLUTO OBBLIGATORIO: nessun distributore per i successivi 120 km fino a Milford Sound. Scaricare anche mappe offline.'

5. Penneshaw IGA
- date: '2026-12-16'
- category: 'cambusa'
- address: '9 Nat Thomas Street, Penneshaw SA 5222'
- cost: '40.00'
- noteCopilota: 'Spesa alimentari e acqua per Kangaroo Island appena sbarcati dal traghetto SeaLink.'

6. Rifornimento Richmond Rd (Bargain Car Rentals Return)
- date: '2026-12-17'
- category: 'rifornimento'
- address: '191-195 Richmond Road, Richmond SA 5033'
- cost: '0.00'
- noteCopilota: 'Pieno carburante prima di riconsegnare la vettura MG3 al deposito di Marleston entro le 17:30.'

7. ALDI Geelong (Torquay Rd)
- date: '2026-12-18'
- category: 'cambusa'
- address: '142 Torquay Road, Grovedale VIC 3216'
- cost: '120.00'
- noteCopilota: 'MAXI-SPESA CAMPERVAN: riempire la dispensa del Budgie Van (pasta, condimenti, acqua, colazioni) prima di imboccare la Great Ocean Road.'

8. Rifornimento Batemans Bay
- date: '2026-12-23'
- category: 'rifornimento'
- address: 'Princes Highway, Batemans Bay NSW 2536'
- cost: '0.00'
- noteCopilota: 'Rifornimento van lungo la salita costiera della South Coast verso Jervis Bay.'

9. Vincentia Marketplace (Woolworths)
- date: '2026-12-24'
- category: 'cambusa'
- address: '8 Moona Creek Drive, Vincentia NSW 2540'
- cost: '70.00'
- noteCopilota: 'SPESA TASSATIVA VIGILIA E NATALE: comprare la carne per il barbecue del 25 dicembre alle Blue Mountains. Il 25 tutti i market australiani sono chiusi per legge.'

10. Newport Mall (Manila T3)
- date: '2026-12-28'
- category: 'varie'
- address: 'Newport Boulevard, Pasay, Metro Manila'
- cost: '15.00'
- noteCopilota: 'Acquisto bottiglie d acqua e beni di prima necessità prima della notte al Condotel e del volo per Boracay.'
`;

const shopData = parseData(rawShopping);

const shopContent = "import type { Shopping } from '../types';\n\n" +
"export const SEED_SHOPPING: Omit<Shopping, 'createdAt' | 'updatedAt'>[] = [\n" +
shopData.map((r, i) => {
    const id = (i + 1).toString().padStart(2, '0');
    return "  {\n" +
    "    id: 'shop_" + id + "',\n" +
    "    nome: `" + (r.name || '').replace(/`/g, "\\`") + "`,\n" +
    "    date: `" + r.date + "`,\n" +
    "    dayId: 'day_" + r.date + "',\n" +
    "    sottocategoria: '" + r.category + "',\n" +
    "    indirizzo: `" + (r.address || '').replace(/`/g, "\\`") + "`,\n" +
    "    budget: `" + r.cost + "`,\n" +
    "    noteCopilota: `" + (r.noteCopilota || '').replace(/`/g, "\\`") + "`\n" +
    "  }";
}).join(',\n') +
"\n];\n";

fs.writeFileSync('src/storage/seedShopping.ts', shopContent, 'utf8');

console.log("Seeds generated!");
