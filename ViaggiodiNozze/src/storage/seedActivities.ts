import type { Attivita } from '../types';

export const REAL_ACTIVITIES: Omit<Attivita, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'act_001', dayId: 'day_2026-11-28', date: '2026-11-28',
    title: 'Museo del Novecento', location: 'Piazza del Duomo, Milano',
    category: 'cultura', status: 'non_bloccato', cost: '0',
    platform: 'Sul posto / Online'
  },
  {
    id: 'act_002', dayId: 'day_2026-11-30', date: '2026-11-30',
    title: 'Escursione Muraglia Cinese (Mutianyu)', location: 'Pechino (dintorni)',
    category: 'natura', status: 'non_bloccato', cost: '0',
    notes: 'Scalo lungo 05:40 - 00:25, verificare driver/tour e visto transito 144h'
  },
  {
    id: 'act_003', dayId: 'day_2026-12-02', date: '2026-12-02',
    title: 'Waitomo Glowworm Caves', location: 'Waitomo Caves, Nuova Zelanda',
    category: 'natura', status: 'prenotato', cost: '84.58',
    platform: 'GetYourGuide', time: '14:50'
  },
  {
    id: 'act_004', dayId: 'day_2026-12-02', date: '2026-12-02',
    title: 'Ruakuri Bushwalk', location: 'Waitomo',
    category: 'natura', status: 'libero', cost: '0',
    notes: 'Passeggiata libera naturalistica'
  },
  {
    id: 'act_005', dayId: 'day_2026-12-03', date: '2026-12-03',
    title: 'Hobbiton Movie Set Tour', location: 'Matamata, Nuova Zelanda',
    category: 'visita', status: 'prenotato', cost: '129.36',
    platform: 'GetYourGuide', time: '11:00',
    notes: 'Durata 3h, partenza max ore 08:30'
  },
  {
    id: 'act_006', dayId: 'day_2026-12-03', date: '2026-12-03',
    title: 'Te Pā Tū (Esperienza Culturale Māori)', location: 'Rotorua',
    category: 'cultura', status: 'prenotato', cost: '288.58',
    time: '17:00', notes: 'Durata 3h30'
  },
  {
    id: 'act_007', dayId: 'day_2026-12-03', date: '2026-12-03',
    title: 'Polynesian Spa', location: 'Rotorua',
    category: 'relax', status: 'non_bloccato', cost: '0',
    time: '21:00', notes: 'Da improvvisare / sul posto'
  },
  {
    id: 'act_008', dayId: 'day_2026-12-04', date: '2026-12-04',
    title: 'Waiotapu Thermal Wonderland', location: 'Rotorua / Waiotapu',
    category: 'natura', status: 'non_bloccato', cost: '20.00',
    time: '10:15', notes: 'Geyser Lady Knox ore 10:15 - alternativa Orakei Korako'
  },
  {
    id: 'act_009', dayId: 'day_2026-12-05', date: '2026-12-05',
    title: 'Tongariro Alpine Crossing (Trekking)', location: 'Tongariro National Park',
    category: 'natura', status: 'prenotato', cost: '0',
    time: '07:00', notes: 'Navetta da attendere orario email. Pass gratuito DOC (doc.govt.nz) da compilare. 7-8 ore di cammino'
  },
  {
    id: 'act_010', dayId: 'day_2026-12-07', date: '2026-12-07',
    title: 'Kaikōura Whale Watch', location: 'Whaleway Station, Kaikoura',
    category: 'natura', status: 'prenotato', cost: '174.14',
    time: '08:30', notes: 'Presentazione ore 08:10, durata 3h30'
  },
  {
    id: 'act_011', dayId: 'day_2026-12-08', date: '2026-12-08',
    title: 'Hokitika Gorge Trekking', location: 'Hokitika',
    category: 'natura', status: 'libero', cost: '0',
    notes: '1h15 di cammino'
  },
  {
    id: 'act_012', dayId: 'day_2026-12-08', date: '2026-12-08',
    title: 'Franz Josef Glacier Walk', location: 'Franz Josef',
    category: 'natura', status: 'libero', cost: '0',
    notes: '1h30 di cammino'
  },
  {
    id: 'act_013', dayId: 'day_2026-12-09', date: '2026-12-09',
    title: 'Fox Glacier Helihike (Elicottero + Ghiacciaio)', location: 'Fox Glacier Guiding Base',
    category: 'visita', status: 'prenotato', cost: '852.82',
    platform: 'Headout', notes: 'Durata 3 ore'
  },
  {
    id: 'act_014', dayId: 'day_2026-12-09', date: '2026-12-09',
    title: 'Fox Glacier Glow Worm Forest', location: 'Fox Glacier',
    category: 'natura', status: 'libero', cost: '0',
    notes: 'Sera al buio'
  },
  {
    id: 'act_015', dayId: 'day_2026-12-10', date: '2026-12-10',
    title: 'Lake Matheson (Jetty Viewpoint)', location: 'Lake Matheson',
    category: 'natura', status: 'libero', cost: '0',
    notes: '15 min cammino'
  },
  {
    id: 'act_016', dayId: 'day_2026-12-10', date: '2026-12-10',
    title: 'Thunder Creek Falls', location: 'Haast Pass',
    category: 'natura', status: 'libero', cost: '0',
    notes: '5 min cammino'
  },
  {
    id: 'act_017', dayId: 'day_2026-12-12', date: '2026-12-12',
    title: 'Crociera Milford Sound', location: 'Terminal visitatori Milford Sound (banco Cruise Milford #2)',
    category: 'visita', status: 'prenotato', cost: '154.08',
    platform: 'Booking (Cruise Milford)', time: '09:45', notes: '09:45 - 11:45 (Arrivare prima per parcheggio)'
  },
  {
    id: 'act_018', dayId: 'day_2026-12-13', date: '2026-12-13',
    title: 'Clay Cliffs Lane', location: 'Omarama',
    category: 'natura', status: 'non_bloccato', cost: '5.00',
    notes: 'Biglietto ~5 NZD'
  },
  {
    id: 'act_019', dayId: 'day_2026-12-13', date: '2026-12-13',
    title: 'Stargazing Lake Tekapo (o Astro Cafè)', location: 'Lake Tekapo / Mt John',
    category: 'relax', status: 'da_valutare', cost: '0'
  },
  {
    id: 'act_020', dayId: 'day_2026-12-14', date: '2026-12-14',
    title: 'Opuke Thermal Pools & Spa', location: 'Methven',
    category: 'relax', status: 'non_bloccato', cost: '0'
  },
  {
    id: 'act_021', dayId: 'day_2026-12-21', date: '2026-12-21',
    title: 'Mount Oberon Summit (Telegraph Saddle)', location: 'Wilsons Promontory NP',
    category: 'natura', status: 'libero', cost: '0',
    notes: '2-3 ore trekking'
  },
  {
    id: 'act_022', dayId: 'day_2026-12-21', date: '2026-12-21',
    title: 'Prom Wildlife Walk (Avvistamento Vombati)', location: 'Wilsons Promontory NP',
    category: 'natura', status: 'libero', cost: '0',
    notes: '45 min'
  },
  {
    id: 'act_023', dayId: 'day_2026-12-24', date: '2026-12-24',
    title: 'Jervis Bay Dolphin Cruise', location: 'Huskisson, Jervis Bay',
    category: 'visita', status: 'da_valutare', cost: '0',
    time: '10:00', notes: '10:00 - 11:30'
  },
  {
    id: 'act_024', dayId: 'day_2026-12-24', date: '2026-12-24',
    title: 'Booderee National Park (Green Patch & Murrays Beach)', location: 'Jervis Bay',
    category: 'natura', status: 'non_bloccato', cost: '13.00',
    notes: 'Snorkeling, relax e sentiero pinguini. Richiede pass parco auto (~13 AUD)'
  },
  {
    id: 'act_025', dayId: 'day_2026-12-25', date: '2026-12-25',
    title: 'Wentworth Falls Track', location: 'Blue Mountains',
    category: 'natura', status: 'libero', cost: '0',
    notes: '30-45 min cammino'
  },
  {
    id: 'act_026', dayId: 'day_2026-12-27', date: '2026-12-27',
    title: 'Traghetto Panoramico Wharf 3 per Manly', location: 'Sydney (Circular Quay Wharf 3 → Manly)',
    category: 'visita', status: 'non_bloccato', cost: '0',
    notes: '30 min • Biglietto contactless ai tornelli'
  },
  {
    id: 'act_027', dayId: 'day_2027-01-03', date: '2027-01-03',
    title: 'Spedizione TAO Philippines (Palawan)', location: 'Da El Nido a Coron',
    category: 'visita', status: 'prenotato', cost: '1410.65',
    platform: 'TAO Philippines', notes: '4 giorni e 4 notti tra isole e villaggi remoti'
  },
];
