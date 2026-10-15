const fs = require('fs');

const code = `
import { storageService } from "../storage/storageService";

export const runDataMigration = async () => {
  const accommodations = await storageService.getAccommodations();
  const transports = await storageService.getTransports();

  const targetAccommodations = [
    { checkIn: '2026-11-28', checkOut: '2026-11-29', name: 'A&O Hostel Milano Ca Granda', cost: '61.95', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-01', checkOut: '2026-12-02', name: 'Noa Hotel', cost: '51.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-02', checkOut: '2026-12-03', name: 'Waitomo Village Chalets Home of Kiwipaka', cost: '68.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-03', checkOut: '2026-12-04', name: 'Wylie Court Motor Lodge', cost: '106.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-04', checkOut: '2026-12-05', name: 'National Park Backpackers', cost: '47.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-05', checkOut: '2026-12-06', name: 'Totara Lodge Motel', cost: '51.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-06', checkOut: '2026-12-07', name: 'Kaikoura Seaside Lodge', cost: '50.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-07', checkOut: '2026-12-08', name: 'Otira Stagecoach Hotel', cost: '72.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-08', checkOut: '2026-12-09', name: 'Haka House Franz Josef', cost: '68.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-09', checkOut: '2026-12-10', name: 'Ivorytowers Accommodation', cost: '49.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-10', checkOut: '2026-12-11', name: 'Cardrona Hotel', cost: '79.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-11', checkOut: '2026-12-12', name: 'Eglinton Valley Camp', cost: '85.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-12', checkOut: '2026-12-13', name: 'New Orleans Hotel', cost: '85.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-13', checkOut: '2026-12-14', name: 'Fairlie Holiday Park', cost: '61.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-14', checkOut: '2026-12-15', name: 'MCM Motel Christchurch', cost: '65.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-15', checkOut: '2026-12-16', name: 'BreakFree Wirrina Cove', cost: '99.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-16', checkOut: '2026-12-17', name: 'Discovery Parks', cost: '123.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-17', checkOut: '2026-12-18', name: 'Melbourne BIG4 Holiday Park', cost: '44.93', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-18', checkOut: '2026-12-19', name: 'Lorne Foreshore Caravan Park', cost: '38.12', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-19', checkOut: '2026-12-20', name: 'Port Campbell Holiday Park', cost: '30.88', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-20', checkOut: '2026-12-21', name: 'Seaspray Caravan Park', cost: '62.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-21', checkOut: '2026-12-22', name: 'Yarram Holiday Park', cost: '28.46', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-22', checkOut: '2026-12-23', name: 'Hobart Beach Campground', cost: '0.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-23', checkOut: '2026-12-24', name: 'Holiday Haven Huskisson Beach', cost: '74.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-24', checkOut: '2026-12-25', name: 'Werri Beach Holiday Park', cost: '48.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-25', checkOut: '2026-12-26', name: 'Grand View Hotel', cost: '98.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-26', checkOut: '2026-12-28', name: 'Hotel St Leonards', cost: '171.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-28', checkOut: '2026-12-29', name: 'Tess and Tessha Condotel', cost: '25.00', paymentStatus: 'da_saldare' },
    { checkIn: '2026-12-29', checkOut: '2027-01-02', name: 'Oseidon Hotel Boracay', cost: '191.00', paymentStatus: 'da_saldare' },
    { checkIn: '2027-01-02', checkOut: '2027-01-03', name: 'Desert Rose El Nido', cost: '53.00', paymentStatus: 'da_saldare' },
    { checkIn: '2027-01-07', checkOut: '2027-01-08', name: 'A&A Abe Bayfront Inn (Coron Town)', cost: '0.00', paymentStatus: 'da_saldare' },
    { checkIn: '2027-01-08', checkOut: '2027-01-09', name: 'Appleton Boutique Hotel Mactan Cebu', cost: '37.66', paymentStatus: 'da_saldare' }
  ];

  for (const t of targetAccommodations) {
    const existing = accommodations.find(a => a.checkIn === t.checkIn || a.name.includes(t.name.split(' ')[0]));
    if (existing) {
      if (existing.cost !== t.cost) {
        existing.cost = t.cost;
        existing.name = t.name; // enforce correct name
        await storageService.saveAccommodation(existing);
      }
    } else {
      await storageService.saveAccommodation({
        id: "acc_" + Date.now() + Math.random().toString(36).substr(2, 9),
        type: 'alloggio',
        name: t.name,
        checkIn: t.checkIn,
        checkOut: t.checkOut,
        cost: t.cost,
        paymentStatus: t.paymentStatus,
        location: t.name, // placeholder
        status: 'da_saldare',
        updatedAt: Date.now()
      });
    }
  }

  const targetTransports = [
    { date: '2026-11-28', carrier: 'Treno Roma Termini - Milano Centrale', cost: '59.80', paymentStatus: 'da_saldare', depositPaid: '0' },
    { date: '2026-11-29', carrier: 'Air China CA950 Milano - Pechino', cost: '1074.86', paymentStatus: 'saldato', depositPaid: '1074.86' },
    { date: '2026-12-01', carrier: 'Taxi ufficiale / Navetta Auckland', cost: '40.00', paymentStatus: 'da_saldare', depositPaid: '0' },
    { date: '2026-12-02', carrier: 'Snap Rentals (Mitsubishi ASX)', cost: '594.00', paymentStatus: 'da_saldare', depositPaid: '319.00' },
    { date: '2026-12-15', carrier: 'Air New Zealand NZ261 Christchurch - Adelaide', cost: '0.00', paymentStatus: 'da_saldare', depositPaid: '0' },
    { date: '2026-12-15', carrier: 'Bargain Car Rentals Adelaide', cost: '84.51', paymentStatus: 'da_saldare', depositPaid: '0' },
    { date: '2026-12-17', carrier: 'Virgin Australia VA242 Adelaide - Melbourne', cost: '185.00', paymentStatus: 'da_saldare', depositPaid: '0' }
  ];

  for (const t of targetTransports) {
    const existing = transports.find(tr => 
      (tr.date === t.date || tr.startDate === t.date) && 
      tr.carrier && tr.carrier.toLowerCase().includes(t.carrier.split(' ')[0].toLowerCase())
    );
    if (existing) {
      if (existing.cost !== t.cost || existing.depositPaid !== t.depositPaid) {
        existing.cost = t.cost;
        existing.depositPaid = t.depositPaid;
        existing.paymentStatus = t.paymentStatus;
        await storageService.saveTransport(existing);
      }
    } else {
      await storageService.saveTransport({
        id: "trn_" + Date.now() + Math.random().toString(36).substr(2, 9),
        type: 'trasporto',
        tipoTrasporto: 'transfer',
        carrier: t.carrier,
        date: t.date,
        cost: t.cost,
        paymentStatus: t.paymentStatus,
        depositPaid: t.depositPaid,
        status: 'da_saldare',
        updatedAt: Date.now()
      });
    }
  }
};
\`

fs.writeFileSync('src/views/altro/migrationData.ts', code, 'utf8');
console.log('Created migrationData.ts');
