import type { Trasporto } from '../types';

export const SEED_TRANSPORTS: Omit<Trasporto, 'createdAt' | 'updatedAt'>[] = [
  // [TRATTA 1: Volo Intercontinentale Andata con Scalo a Pechino]
  {
    id: 'trn_01_mxp_pek_akl',
    type: 'volo',
    date: '2026-11-29',
    carrier: 'Air China (CA950 + CA783)',
    departureLocation: 'Milano Malpensa (MXP) T1',
    arrivalLocation: 'Auckland (AKL)',
    departureTime: '12:30',
    arrivalTime: '17:35 (01 Dic)',
    layover: {
      airport: 'Pechino Capitale (PEK) T3',
      arrivalTime: '05:50 (30 Nov)',
      departureTime: '00:25 (01 Dic)',
      duration: '18h 35m'
    },
    bookingCode: '1688897340550151',
    status: 'prenotato',
    cost: 'Incluso nel pacchetto',
    notes: 'Scalo a Pechino con camera day-use / uscita in città. Franchigia: 2 colli da 23 kg in stiva + 8 kg cabina a testa. All\'arrivo controlli biosicurezza NZ: dichiarare scarpe da trekking pulite.'
  },
  // [TRATTA 2: Transfer Serale ad Auckland]
  {
    id: 'trn_02_transfer_akl',
    type: 'transfer',
    date: '2026-12-01',
    carrier: 'Taxi ufficiale / Navetta / Uber',
    departureLocation: 'Auckland Apt (AKL)',
    arrivalLocation: 'Hotel Noa (Queen St, Auckland CBD)',
    departureTime: '18:30',
    arrivalTime: '19:15',
    status: 'da_prenotare',
    cost: 'Da saldare: ~40 € (60–75 NZD)',
    notes: 'Trasferimento serale in centro città per pernottamento pre-ritiro auto.'
  },
  // [TRATTA 3: Noleggio Auto Snap Rentals Nuova Zelanda]
  {
    id: 'trn_03_snap_rentals',
    type: 'auto',
    date: '2026-12-02',
    carrier: 'Snap Rentals (Mitsubishi ASX o similare)',
    departureLocation: 'Auckland Downtown Branch (60-64 The Strand, Parnell, Auckland City)',
    arrivalLocation: 'Christchurch Airport Branch (170 Orchard Road, Harewood, Christchurch)',
    departureTime: '10:00',
    dropoffDate: '2026-12-15',
    dropoffTime: '12:00',
    dropoffLocation: 'Christchurch Airport Branch (170 Orchard Road, Harewood, Christchurch)',
    bookingCode: '#U-520010 (Agenzia 742210189)',
    status: 'prenotato',
    cost: 'Da saldare: ~310 € (538,86 NZD)',
    depositPaid: '518,18 NZD (~282 €)',
    notes: 'One-Way fee isola inclusa. Navetta gratuita inclusa per il terminal partenze di Christchurch dopo il rilascio. Tel: +64 9 275 2438. Totale noleggio: 1.057,04 NZD (~592 €). Acconto già versato: 518,18 NZD (~282 €). Saldo da versare al banco: 538,86 NZD (~310 €).'
  },
  // [TRATTA 4: Traghetto Bluebridge Wellington - Picton]
  {
    id: 'trn_04_bluebridge',
    type: 'traghetto',
    date: '2026-12-06',
    carrier: 'Bluebridge Ferry',
    departureLocation: 'Wellington Ferry Terminal',
    arrivalLocation: 'Picton Ferry Terminal',
    departureTime: '08:00',
    arrivalTime: '11:30',
    status: 'prenotato',
    cost: '175,00 € Saldato',
    notes: '1 Auto + 2 Adulti. Check-in veicoli TASSATIVO entro le ore 07:00 al terminal di Wellington.'
  },
  // [TRATTA 5: Volo Christchurch - Adelaide]
  {
    id: 'trn_05_chc_adl',
    type: 'volo',
    date: '2026-12-15',
    carrier: 'Air New Zealand (NZ261)',
    departureLocation: 'Christchurch (CHC)',
    arrivalLocation: 'Adelaide (ADL)',
    departureTime: '15:25',
    arrivalTime: '17:35',
    bookingCode: 'XLY76H',
    status: 'prenotato',
    cost: 'Incluso nel pacchetto',
    notes: 'Volo trans-tasmanico diretto (3h 40m).'
  },
  // [TRATTA 6: Noleggio Auto Bargain Adelaide]
  {
    id: 'trn_06_bargain_car',
    type: 'auto',
    date: '2026-12-15',
    carrier: 'Bargain Car Rentals (MG 3 o similare)',
    departureLocation: 'Adelaide Airport (ADL)',
    arrivalLocation: 'Adelaide Airport (ADL)',
    departureTime: '18:00',
    dropoffDate: '2026-12-17',
    dropoffTime: '17:30',
    dropoffLocation: 'Adelaide Airport (ADL)',
    status: 'prenotato',
    cost: '84,51 € Saldato',
    notes: 'Riconsegna al desk aeroportuale entro le 17:30 prima del volo serale per Melbourne.'
  },
  // [TRATTA 7: Traghetto SeaLink Kangaroo Island - Andata]
  {
    id: 'trn_07_sealink_andata',
    type: 'traghetto',
    date: '2026-12-16',
    carrier: 'SeaLink Kangaroo Island (Andata)',
    departureLocation: 'Cape Jervis',
    arrivalLocation: 'Penneshaw (Kangaroo Island)',
    departureTime: '09:00 (o 10:00)',
    arrivalTime: '09:45',
    status: 'da_prenotare',
    cost: 'Da saldare: ~125 € (SeaLink)',
    notes: '1 Auto standard (<5m) + 2 Adulti. Presentarsi all\'imbarco 30 minuti prima.'
  },
  // [TRATTA 8: Traghetto SeaLink Kangaroo Island - Ritorno]
  {
    id: 'trn_08_sealink_ritorno',
    type: 'traghetto',
    date: '2026-12-17',
    carrier: 'SeaLink Kangaroo Island (Ritorno)',
    departureLocation: 'Penneshaw (Kangaroo Island)',
    arrivalLocation: 'Cape Jervis',
    departureTime: '13:30',
    arrivalTime: '14:15',
    status: 'da_prenotare',
    cost: 'Da saldare: ~125 € (SeaLink)',
    notes: 'Sbarco a Cape Jervis alle 14:15. Guida di 105 km verso Adelaide Airport per riconsegna auto entro le 17:30.'
  },
  // [TRATTA 9: Volo Adelaide - Melbourne]
  {
    id: 'trn_09_adl_mel',
    type: 'volo',
    date: '2026-12-17',
    carrier: 'Virgin Australia (VA242)',
    departureLocation: 'Adelaide (ADL)',
    arrivalLocation: 'Melbourne (MEL)',
    departureTime: '19:50',
    arrivalTime: '21:40',
    bookingCode: 'SSZUQN',
    status: 'prenotato',
    cost: '185,00 € Saldato (300,97 AUD)',
    notes: 'Posti 16A e 16B. 1 bagaglio da stiva da 23 kg a testa incluso. (Il vecchio volo del 16 Dicembre è eliminato).'
  },
  // [TRATTA 10: Noleggio Campervan Travellers Autobarn Melbourne - Sydney]
  {
    id: 'trn_10_travellers_camper',
    type: 'camper',
    date: '2026-12-17',
    carrier: 'Travellers Autobarn (Budgie Van 2-berth)',
    departureLocation: 'Melbourne Tullamarine (5 Assembly Drive)',
    arrivalLocation: 'Sydney Banksmeadow (1C McPherson Street)',
    departureTime: '22:30 (After-hours contactless)',
    dropoffDate: '2026-12-28',
    dropoffTime: '09:15',
    dropoffLocation: 'Sydney Banksmeadow (1C McPherson Street)',
    bookingCode: 'U-152128',
    status: 'prenotato',
    cost: 'Da saldare: ~1.180 € (1.957,13 AUD)',
    depositPaid: '511,00 AUD (~308 €)',
    notes: 'Copertura Protection Plus (Franchigia zero). Ritiro notturno con cassetta codificata. Targa da registrare su Linkt per i pedaggi. Totale stimato: 2.468,13 AUD (~1.488 €). Acconto già versato: 511,00 AUD (~308 €). Saldo da versare: 1.957,13 AUD (~1.180 €).'
  },
  // [TRATTA 11: Volo Sydney - Manila]
  {
    id: 'trn_11_syd_mnl',
    type: 'volo',
    date: '2026-12-28',
    carrier: 'Cebu Pacific (5J040)',
    departureLocation: 'Sydney (SYD) T1',
    arrivalLocation: 'Manila (MNL) T3',
    departureTime: '12:15',
    arrivalTime: '18:10',
    bookingCode: '1688897853414407',
    status: 'prenotato',
    cost: 'Incluso nel pacchetto',
    notes: 'Terminal 1 Internazionale SYD (arrivo entro le ore 10:00). Transito notturno autonomo a Manila T3.'
  },
  // [TRATTA 12: Volo Manila - Caticlan/Boracay]
  {
    id: 'trn_12_mnl_mph',
    type: 'volo',
    date: '2026-12-29',
    carrier: 'Cebu Pacific (5J899)',
    departureLocation: 'Manila (MNL) T3',
    arrivalLocation: 'Caticlan/Boracay (MPH)',
    departureTime: '08:50',
    arrivalTime: '10:00',
    bookingCode: 'Incluso nella prenotazione SYD-MPH',
    status: 'prenotato',
    cost: 'Incluso nel pacchetto',
    notes: 'Partenza da Manila T3. All\'arrivo transfer al molo di Caticlan per imbarco su barca verso Boracay.'
  },
  // [TRATTA 13: Volo Caticlan - El Nido Lio]
  {
    id: 'trn_13_mph_eni',
    type: 'volo',
    date: '2027-01-02',
    carrier: 'Cebgo (DG6709)',
    departureLocation: 'Caticlan (MPH)',
    arrivalLocation: 'El Nido Lio (ENI)',
    departureTime: '15:30',
    arrivalTime: '16:45',
    bookingCode: 'TENLHL',
    status: 'prenotato',
    cost: 'Incluso nel pacchetto',
    notes: 'Volo con aeromobile ATR 72 diretto a El Nido Lio. Rigida franchigia bagaglio cabina (max 7 kg).'
  },
  // [TRATTA 14: Spedizione Marittima Tao Philippines El Nido - Coron]
  {
    id: 'trn_14_tao_expedition',
    type: 'traghetto',
    date: '2027-01-03',
    carrier: 'Spedizione in barca Tao Philippines / BDBM',
    departureLocation: 'El Nido (Palawan)',
    arrivalLocation: 'Coron Busuanga (06 Gen)',
    departureTime: '03 Gen mattina',
    arrivalTime: '06 Gen pomeriggio',
    status: 'da_prenotare',
    cost: 'Da saldare: ~500 € (In definizione)',
    notes: 'Navigazione tra gli atolli di Linapacan con notti nei campi base remoti (03–06 Gennaio).'
  },
  // [TRATTA 15: Volo Coron Busuanga - Cebu]
  {
    id: 'trn_15_usu_ceb',
    type: 'volo',
    date: '2027-01-08',
    carrier: 'PAL Express (PR2681)',
    departureLocation: 'Coron Busuanga (USU)',
    arrivalLocation: 'Cebu (CEB)',
    departureTime: '16:55',
    arrivalTime: '18:15',
    bookingCode: 'ZUT8YF',
    status: 'prenotato',
    cost: 'Incluso nel pacchetto',
    notes: 'Bagaglio da stiva 15 kg prepagato.'
  },
  // [TRATTA 16: Volo Ritorno Intercontinentale Cebu - Taipei - Roma FCO]
  {
    id: 'trn_16_ceb_tpe_fco',
    type: 'volo',
    date: '2027-01-09',
    carrier: 'China Airlines (CI706 + CI75)',
    departureLocation: 'Cebu (CEB)',
    arrivalLocation: 'Roma Fiumicino (FCO)',
    departureTime: '12:10 (09 Gen)',
    arrivalTime: '07:15 (10 Gen)',
    layover: {
      airport: 'Taipei (TPE)',
      arrivalTime: '15:00 (09 Gen)',
      departureTime: '23:25 (09 Gen)',
      duration: '8h 25m'
    },
    bookingCode: 'X8KORM',
    status: 'prenotato',
    cost: 'Incluso nel pacchetto',
    notes: '2 colli da 23 kg a testa inclusi fino a Roma. Scalo a Taipei 8h 25m.'
  }
];
