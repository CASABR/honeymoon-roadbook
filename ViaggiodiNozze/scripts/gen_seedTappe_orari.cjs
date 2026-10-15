// Genera src/storage/seedTappe.ts dal dataset certificato (orari puntuali, ordine cronologico).
const fs = require('fs');

const M = {
  welli: 'https://maps.app.goo.gl/doNS86LJcB8zNVnq9',
  kaik: 'https://maps.app.goo.gl/8Paj3SF1L8ipHmQr7',
  hoki: 'https://maps.app.goo.gl/C7k3PFM5VS2Qw5pcA',
  fox: 'https://maps.app.goo.gl/DeYRM11N8gWP8B5B6',
  haast: 'https://maps.app.goo.gl/2EE7wiE6cBPPhQR5A',
  crown: 'https://maps.app.goo.gl/ivqmKEUFBQFPC4qt8',
  milf: 'https://maps.app.goo.gl/mHrTZcy14jyCGpHQ8',
  kawa: 'https://maps.app.goo.gl/kKdtuqnkakcvLaCH8',
  chc: 'https://maps.app.goo.gl/Qg4r6TgDNjFiFMRT9',
  ret: 'https://maps.app.goo.gl/56kHRfnKkGVgET89A',
  ki1: 'https://maps.app.goo.gl/B8GHEo1fv52Rcm3R7',
  ki2: 'https://maps.app.goo.gl/Sekyp84wtxnHUvFy8',
  budgie: 'https://maps.app.goo.gl/9QwoKaHEwzxsWZ83A',
  gor1: 'https://maps.app.goo.gl/UCgh22ZP6xh8Qd3Y6',
  gor2: 'https://maps.app.goo.gl/T53Uygmm4XTNmPoEA',
  qvm: 'https://maps.app.goo.gl/gckrJBY53KMrBU6R7',
  mel: 'https://maps.app.goo.gl/GqQD8JNsSz9Lyu1A8',
  wil: 'https://maps.app.goo.gl/syjriZThWBpodVAi9',
  eden: 'https://maps.app.goo.gl/Bda9vhvq6smvxbAD8',
  tilba: 'https://maps.app.goo.gl/PdLvt3n3zp5XDD2o7',
  china: 'https://maps.app.goo.gl/WxHjQcyno5w4DAXY6',
  blue: 'https://maps.app.goo.gl/89wG9p5TVMud18vG6',
  syd1: 'https://maps.app.goo.gl/EzGsb9jjSLTpP7Wh9',
  syd2: 'https://maps.app.goo.gl/kwXi25DHcWRRgqC19'
};

// [date, time, titolo, location, note, mapUrl?]
const D = [
  ['2026-11-28', '21:30', 'Navigli Milano', 'Navigli, Milano', 'Passeggiata serale lungo i canali dopo la cena da Starita.', 'https://maps.app.goo.gl/ci59PTXCYAoBwCFY7'],
  ['2026-11-29', '08:30', 'Aeroporto Malpensa T1', 'Malpensa T1', 'Presentarsi ai banchi entro le 08:30 per check-in volo CA950 delle 12:30.'],
  ['2026-11-30', '05:40', 'Arrivo Pechino (PEK)', 'Pechino Capital T3', 'Sbarco volo, visto 24/144h e uscita per escursione.'],
  ['2026-11-30', '07:30', 'Muraglia Cinese (Mutianyu)', 'Mutianyu', 'Escursione alla Muraglia con funivia e toboggan.'],
  ['2026-11-30', '13:00', 'Piazza Tienanmen e Centro', 'Tiananmen', 'Controlli sicurezza e camminata verso Siji Minfu (prendere numero virtuale prima).'],
  ['2026-12-01', '19:30', 'Giro Centro Auckland', 'Queen Street / Viaduct Harbour', 'Passeggiata serale post-volo dopo arrivo delle 17:34.'],
  ['2026-12-02', '09:00', 'Mount Eden', 'Mount Eden, Auckland', 'Cratere vulcanico panoramico.'],
  ['2026-12-02', '12:30', 'Marokopa Falls', 'Te Anga', 'Breve camminata per la cascata.'],
  ['2026-12-02', '13:30', 'Mangapohue Natural Bridge', 'Waitomo', 'Arco naturale di calcare fossile.'],
  ['2026-12-02', '16:00', 'Ruakuri Bushwalk', 'Waitomo Reserve', 'Sentiero tra gole calcaree dopo le grotte.'],
  ['2026-12-03', '08:30', 'Partenza Matamata', 'Verso Matamata', 'Partenza tassativa ore 08:30 per tour Hobbiton delle 11:00.'],
  ['2026-12-03', '14:30', 'Big Dog and Sheep', 'Tirau', 'Edifici iconici in lamiera ondulata.'],
  ['2026-12-03', '15:15', 'Te Waihou Blue Spring', 'Putaruru', "Sorgente d'acqua limpidissima."],
  ['2026-12-04', '12:30', 'Cascate Huka', 'Huka Falls, Taupo', "Portata d'acqua turchese."],
  ['2026-12-04', '14:30', 'Tawhai Falls (Gollum Pool)', 'Bruce Road, Tongariro', 'Cascata de Il Signore degli Anelli (10 min camminata).'],
  ['2026-12-04', '15:30', 'Tongariro Visitor Centre', 'Whakapapa Village', 'Controllo bollettino meteo per il trekking e pass DOC.'],
  ['2026-12-05', '15:00', 'Kiwi Camp National Park (Docce)', 'National Park Village', 'Docce calde rigeneranti post-trekking prima di guidare verso sud.'],
  ['2026-12-06', '09:30', 'Cuba Street', 'Wellington CBD', 'Passeggiata mattutina.', M.welli],
  ['2026-12-06', '11:00', 'Mount Victoria Lookout', 'Mount Victoria', 'Vista panoramica prima del traghetto Bluebridge (chiusura check-in 12:30 tassative).', M.welli],
  ['2026-12-06', '18:15', 'Ohau Point Lookout (Foche)', 'Kaikoura Coast', 'Colonia di foche sulle rocce dopo lo sbarco a Picton.', M.welli],
  ['2026-12-07', '12:30', 'Kaikoura Peninsula Walkway', 'Point Kean', 'Sentiero panoramico scogliera (da valutare).', M.kaik],
  ['2026-12-07', '15:30', 'Castle Hill', "Arthur's Pass (SH73)", 'Massi calcarei giganteschi.', M.kaik],
  ['2026-12-07', '17:30', 'Otira Viaduct Lookout', 'Otira Gorge', 'Belvedere viadotto alpino e pappagalli kea.', M.kaik],
  ['2026-12-08', '10:00', 'Hokitika Beach (Scritta Legni)', 'Hokitika', 'Spiaggia di sabbia nera.', M.hoki],
  ['2026-12-09', '08:50', 'Fox Glacier Guiding Base', 'Fox Glacier Base', 'Ritrovo per helihike su ghiacciaio.', M.fox],
  ['2026-12-10', '10:30', 'Knights Point Lookout', 'Haast Coast', 'Foche e scogliere a strapiombo.', M.haast],
  ['2026-12-10', '12:30', 'Wilson Creek Chasm', 'Haast Pass', 'Gola rocciosa sul passo.', M.haast],
  ['2026-12-10', '16:30', 'That Wanaka Tree', 'Lake Wanaka', "Salice solitario nell'acqua.", M.haast],
  ['2026-12-11', '09:30', 'Crown Range Summit', 'Crown Range Road', 'Passo asfaltato più alto della NZ (1.076 m).', M.crown],
  ['2026-12-11', '10:30', 'Arrowtown', 'Arrowtown', "Borgo storico cercatori d'oro.", M.crown],
  ['2026-12-11', '14:30', 'Sosta Te Anau Pompa Allied', 'Allied Te Anau', 'PIENO ASSOLUTO (zero pompe per 120 km) e scaricare mappe offline.', M.crown],
  ['2026-12-11', '16:00', 'Mirror Lakes', 'Milford Road', "Specchi d'acqua con riflesso monti.", M.crown],
  ['2026-12-12', '12:30', 'The Chasm', 'Milford Road', "Passeggiata 20 min tra rocce levigate dall'acqua.", M.milf],
  ['2026-12-12', '13:30', "Pop's View Lookout", 'Hollyford Valley', 'Belvedere sulla vallata glaciale.', M.milf],
  ['2026-12-13', '09:30', 'Kawarau Bridge', 'Gibbston', 'Ponte storico bungy jumping.', M.kawa],
  ['2026-12-13', '11:30', 'Lindis Pass Viewpoint', 'Lindis Pass', 'Panorama colline tussock.', M.kawa],
  ['2026-12-13', '16:00', 'Lake Tekapo & Church', 'Lake Tekapo', 'Church of the Good Shepherd sul lago turchese.', M.kawa],
  ['2026-12-14', '11:30', 'Rakaia Gorge', 'Rakaia Bridge', 'Gola del fiume alpino.', M.chc],
  ['2026-12-14', '15:30', 'Tour Centro Christchurch', 'Christchurch CBD', 'Riverside Market, Bridge of Remembrance, Cardboard Cathedral e New Regent St.', M.chc],
  ['2026-12-15', '11:30', 'Riconsegna Auto Christchurch', 'Snap Rentals CHC Airport', 'Fare il pieno prima e riconsegnare entro le 12:00.', M.ret],
  ['2026-12-15', '19:30', 'Arrivo Wirrina Cove', 'Fleurieu SA', 'Spostamento a sud verso Cape Jervis.', M.ret],
  ['2026-12-16', '07:05', 'Imbarco Cape Jervis', 'Cape Jervis Terminal', 'Presentarsi tassativamente entro le 07:05 per traghetto SeaLink delle 07:40.', M.ki1],
  ['2026-12-16', '13:00', 'Vivonne Bay Beach', 'Vivonne Bay', 'Spiaggia e Whiting burger.', M.ki1],
  ['2026-12-16', '15:00', 'Remarkable Rocks', 'Flinders Chase NP', 'Sculture di granito arancione.', M.ki1],
  ['2026-12-16', '16:30', 'Admirals Arch', 'Cape du Couedic', 'Arco naturale con otarie.', M.ki1],
  ['2026-12-17', '09:00', 'Hanson Bay & Baudin Beach', 'Kangaroo Island', 'Avvistamento koala e transito Playford Hwy.', M.ki2],
  ['2026-12-17', '11:30', 'Molo Penneshaw', 'Penneshaw Terminal', 'Arrivare entro le 11:30 per traghetto SeaLink delle 12:20.', M.ki2],
  ['2026-12-17', '16:30', 'Riconsegna Marleston', '59 Galway Ave, Marleston', 'Pieno benzina a Richmond Rd e riconsegna auto entro le 17:30.', M.ki2],
  ['2026-12-17', '22:15', 'Ritiro Budgie Van Tullamarine', '5 Assembly Dr, Tullamarine', 'Ritiro contactless da cassetta a codice. Video torcia 360.', M.budgie],
  ['2026-12-18', '11:00', 'Torquay & Bells Beach', 'Torquay VIC', 'Spiaggia di surf inizio Great Ocean Road.', M.gor1],
  ['2026-12-18', '13:00', 'Anglesea Golf Club', 'Anglesea', 'Canguri sul prato da golf.', M.gor1],
  ['2026-12-18', '15:30', "Split Point & Teddy's Lookout", 'Lorne', 'Faro bianco e vista foce del fiume.', M.gor1],
  ['2026-12-19', '09:30', 'Kennett River', 'Grey River Rd', 'Koala selvatici sugli eucalipti.', M.gor2],
  ['2026-12-19', '11:30', 'Apollo Bay', 'Apollo Bay', 'Sosta mare.', M.gor2],
  ['2026-12-19', '13:00', 'Cape Otway Lightstation', 'Cape Otway', 'Faro storico continentale.', M.gor2],
  ['2026-12-19', '17:30', 'Gibson Steps', 'Princetown', 'Discesa gradini sulla battigia.', M.gor2],
  ['2026-12-19', '20:00', 'Saddle Lookout (12 Apostoli)', 'Twelve Apostles', 'Tramonto sui faraglioni.', M.gor2],
  ['2026-12-19', '20:45', 'Loch Ard Gorge', 'Port Campbell NP', 'Insenatura tra le scogliere.', M.gor2],
  ['2026-12-20', '10:30', 'Parcheggio Queen Victoria Market', 'Melbourne CBD', "Parcheggio all'aperto per van alto 1,9 m.", M.qvm],
  ['2026-12-20', '11:30', 'Giro Centro Melbourne', 'Flinders St / Hosier Ln', 'Degraves St, street art e Federation Square.', M.mel],
  ['2026-12-20', '18:30', 'St Kilda Pier', 'St Kilda Pier', 'Avvistamento pinguini minori al tramonto.', M.mel],
  ['2026-12-21', '13:00', 'Squeaky Beach & Tidal River', 'Wilsons Promontory', 'Sabbia canterina e sosta pranzo.', M.wil],
  ['2026-12-22', '10:30', 'Cunninghame Arm & Orbost', 'Lakes Entrance', 'Ponte laguna e foreste.', M.eden],
  ['2026-12-22', '15:30', 'Eden Lookout & Rotary Park', 'Eden NSW', 'Belvedere oceano Twofold Bay.', M.eden],
  ['2026-12-23', '09:30', 'Central Tilba & Narooma', 'Eurobodalla', 'Borgo in legno e Australia Rock.', M.tilba],
  ['2026-12-23', '13:30', 'Pebbly Beach (Canguri)', 'Murramarang NP', 'Canguri sulla sabbia.', M.tilba],
  ['2026-12-23', '16:00', 'Hyams Beach', 'Jervis Bay', 'Sabbia bianca finissima.', M.tilba],
  ['2026-12-24', '18:30', 'Chinamans Beach (Tramonto)', 'Jervis Bay', 'Sosta serale prima di Werri Beach.', M.china],
  ['2026-12-25', '16:30', 'Echo Point & Three Sisters', 'Katoomba', 'Vista iconica Tre Sorelle e cascate.', M.blue],
  ['2026-12-26', '14:00', 'Circular Quay & Opera House', 'Sydney Cove', 'Cuore della baia.', M.syd1],
  ['2026-12-26', '15:30', 'The Rocks & Harbour Bridge', 'The Rocks', 'Quartiere storico.', M.syd1],
  ['2026-12-26', '17:30', "Mrs Macquarie's Chair", 'Botanic Gardens', 'Scorcio fotografico cartolina.', M.syd1],
  ['2026-12-27', '11:00', 'Manly Wharf & Shelly Beach', 'Manly', 'Sbarco traghetto e passeggiata.', M.syd2],
  ['2026-12-27', '17:00', 'Barangaroo & Darling Harbour', 'Sydney Waterfront', 'Passeggiata serale porto.', M.syd2],
  ['2026-12-28', '08:15', 'Riconsegna Van Banksmeadow', '1C McPherson St', 'Pieno sera prima. Ai banchi T1 entro 09:15.'],
  ['2026-12-29', '16:30', "White Beach (Willy's Rock) & Kasbar", 'Boracay Station 1', 'Scoglio con santuario e lanterne al tramonto.'],
  ['2026-12-31', '11:00', 'Diniwid Beach', 'Diniwid, Boracay', 'Caletta riparata raggiungibile via roccia.'],
  ['2027-01-01', '11:00', 'Puka Shell Beach', 'Nord Boracay', 'Spiaggia conchiglie in e-trike.']
];

// Ordine cronologico rigoroso (data, poi orario) e order progressivo per giornata
D.sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
const orderByDay = {};
const q = (s) => JSON.stringify(s);

const items = D.map(([date, time, titolo, location, note, mapUrl], i) => {
  orderByDay[date] = (orderByDay[date] || 0) + 1;
  const id = `tappa_${String(i + 1).padStart(2, '0')}`;
  return `  {
    id: ${q(id)},
    titolo: ${q(titolo)},
    date: ${q(date)},
    data: ${q(date)},
    dayId: ${q('day_' + date)},
    order: ${orderByDay[date]},
    orario: ${q(time)},
    indirizzo: ${q(location)},
    mapsUrl: ${mapUrl ? q(mapUrl) : 'undefined'},
    noteCopilota: ${q(note)}
  }`;
});

const out = `import type { Tappa } from '../types';

/**
 * Versione del dataset tappe. Cambiandola, al prossimo avvio le tappe certificate
 * vengono riscritte (orari inclusi) su tutti i dispositivi e sincronizzate sul cloud.
 */
export const SEED_TAPPE_VERSION = '2026-10-12-orari-v1';

/** Tappe on-the-road certificate: ordinate per data e orario. */
export const REAL_TAPPE: Omit<Tappa, 'createdAt' | 'updatedAt'>[] = [
${items.join(',\n')}
];
`;

fs.writeFileSync('c:/Users/CUSI/Documents/App-viaggio-di-nozze/ViaggiodiNozze/src/storage/seedTappe.ts', out, 'utf8');
console.log('Scritte', D.length, 'tappe');
