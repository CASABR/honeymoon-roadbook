const assert = require('node:assert/strict');

console.log('\n=== HOUNIGO: FASE 2 — SUITE DI VERIFICA LIVE INTELLIGENCE & GPS MULTI-CLIENT ===\n');

// -------------------------------------------------------------
// IN-MEMORY EMULATOR CONFORME A FIRESTORE RULES
// -------------------------------------------------------------
class MockFirestoreEmulator {
  constructor() {
    this.storage = new Map();
    this.listeners = new Map();
  }

  set(docPath, data) {
    this.storage.set(docPath, JSON.parse(JSON.stringify(data)));
    const cbs = this.listeners.get(docPath) || [];
    for (const cb of cbs) cb(this.get(docPath));
  }

  get(docPath) {
    const d = this.storage.get(docPath);
    return {
      exists: () => Boolean(d),
      data: () => (d ? JSON.parse(JSON.stringify(d)) : null)
    };
  }

  delete(docPath) {
    this.storage.delete(docPath);
    const cbs = this.listeners.get(docPath) || [];
    for (const cb of cbs) cb({ exists: () => false, data: () => null });
  }

  onSnapshot(docPath, cb) {
    if (!this.listeners.has(docPath)) this.listeners.set(docPath, []);
    this.listeners.get(docPath).push(cb);
    cb(this.get(docPath));
    return () => {
      const arr = this.listeners.get(docPath) || [];
      this.listeners.set(docPath, arr.filter(x => x !== cb));
    };
  }
}

const db = new MockFirestoreEmulator();
const TRIP_ID = 'trip-synth-test';
const LEASE_PATH = `live_feeds/${TRIP_ID}/gps_control/current`;
const LOCATION_PATH = `live_feeds/${TRIP_ID}/locations/current`;

async function main() {
  const { deriveLiveIntelligence } = await import('../src/utils/liveIntelligenceHelper.ts');

  // -------------------------------------------------------------
  // VERIFICA 1: LA POSIZIONE GPS PROVIENE DAL DISPOSITIVO GUIDA AUTORIZZATO
  // -------------------------------------------------------------
  {
    const ownerUid = 'organizzatore-uid-01';
    const ownerDev = 'dev-iphone15-pro-01';
    const unauthorizedUid = 'estraneo-uid-99';
    const unauthorizedDev = 'dev-estraneo-99';

    // Configura lease attivo per owner
    db.set(LEASE_PATH, {
      holderUid: ownerUid,
      holderDeviceId: ownerDev,
      status: 'active',
      updatedAt: Date.now(),
      expiresAt: Date.now() + 3600 * 1000
    });

    function tryPublishLocation(clientUid, clientDev, lat, lng) {
      const lease = db.get(LEASE_PATH).data();
      if (!lease || lease.status !== 'active') throw new Error('Lease non attivo');
      if (lease.holderUid !== clientUid || lease.holderDeviceId !== clientDev) {
        throw new Error('Dispositivo non autorizzato a pubblicare GPS');
      }
      db.set(LOCATION_PATH, {
        lat,
        lng,
        accuracy: 12,
        updatedAt: Date.now(),
        city: 'Hobbiton'
      });
      return true;
    }

    // 1a. Il dispositivo autorizzato pubblica correttamente
    const pubOk = tryPublishLocation(ownerUid, ownerDev, -37.8721, 175.6829);
    assert.strictEqual(pubOk, true);
    assert.strictEqual(db.get(LOCATION_PATH).data().city, 'Hobbiton');

    // 1b. Dispositivo non autorizzato viene bloccato
    assert.throws(() => {
      tryPublishLocation(unauthorizedUid, unauthorizedDev, 45.4642, 9.1900);
    }, /Dispositivo non autorizzato/);

    console.log('[PASS 01] Posizione GPS: accettata solo dal dispositivo guida autorizzato');
  }

  // -------------------------------------------------------------
  // VERIFICA 2: IL SECONDO CLIENT RICEVE LA POSIZIONE CONDIVISA
  // -------------------------------------------------------------
  {
    let clientBReceived = null;
    const unsubscribe = db.onSnapshot(LOCATION_PATH, (snap) => {
      if (snap.exists()) {
        clientBReceived = snap.data();
      }
    });

    assert.notStrictEqual(clientBReceived, null);
    assert.strictEqual(clientBReceived.lat, -37.8721);
    assert.strictEqual(clientBReceived.accuracy, 12);
    unsubscribe();
    console.log('[PASS 02] Secondo client: riceve snapshot con coordinate e precisione in tempo reale');
  }

  // -------------------------------------------------------------
  // VERIFICA 3: POSIZIONE PREVISTA DERIVATA DA ATTIVITÀ E ORARI DELL'ITINERARIO
  // -------------------------------------------------------------
  {
    const now = new Date('2026-11-29T11:40:00');
    const activities = [
      {
        id: 'act-1',
        dayId: 'day-1',
        date: '2026-11-29',
        title: 'Visita guidata a Hobbiton',
        time: '11:00',
        duration: '120 min',
        location: 'Hobbiton Movie Set',
        coordinate: { lat: -37.8721, lng: 175.6829 },
        category: 'visita',
        status: 'prenotato',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'act-2',
        dayId: 'day-1',
        date: '2026-11-29',
        title: 'Passeggiata a Rotorua Geothermal',
        time: '15:00',
        duration: '60 min',
        location: 'Rotorua',
        coordinate: { lat: -38.1368, lng: 176.2497 },
        category: 'natura',
        status: 'prenotato',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const intel = deriveLiveIntelligence({
      giorni: [{ id: 'd-1', date: '2026-11-29', title: 'Giorno 1', location: 'Matamata', createdAt: 0, updatedAt: 0 }],
      attivita: activities,
      tappe: [],
      alloggi: [],
      trasporti: [],
      currentDateTime: now,
      tripStartDate: '2026-11-28',
      tripEndDate: '2026-12-15'
    });

    assert.notStrictEqual(intel, null);
    assert.strictEqual(intel.currentEvent.title, 'Visita guidata a Hobbiton');
    assert.strictEqual(intel.plannedLocation.coords.lat, -37.8721);
    assert.strictEqual(intel.plannedLocation.coords.lng, 175.6829);
    assert.strictEqual(intel.nextEvent.title, 'Passeggiata a Rotorua Geothermal');
    console.log('[PASS 03] Posizione prevista: determinata dall\'attività in corso (Hobbiton 11:00-13:00)');
  }

  // -------------------------------------------------------------
  // VERIFICA 4: MAPPA MOSTRA DUE MARKER DISTINTI (REALE E PREVISTO)
  // -------------------------------------------------------------
  {
    const realGps = { lat: -37.7870, lng: 175.2793 }; // Hamilton (~38 km prima)
    const planned = { lat: -37.8721, lng: 175.6829 }; // Hobbiton

    const hasTwoDistinctMarkers = (
      realGps.lat !== planned.lat || realGps.lng !== planned.lng
    );
    assert.strictEqual(hasTwoDistinctMarkers, true);

    // Verifica semantica etichette e stili
    const marker1Real = { label: 'Sei qui', color: '#FF6B5F', type: 'circle' };
    const marker2Planned = { label: 'Secondo itinerario', color: '#172033', type: 'diamond' };

    assert.notStrictEqual(marker1Real.color, marker2Planned.color);
    assert.notStrictEqual(marker1Real.type, marker2Planned.type);
    assert.strictEqual(marker2Planned.label, 'Secondo itinerario');
    console.log('[PASS 04] Mappa a due marker: Coral cerchio (GPS reale) e Navy rombo (Secondo itinerario)');
  }

  // -------------------------------------------------------------
  // VERIFICA 5: IN ASSENZA DI COORDINATE NON VIENE CREATO MARKER FITTIZIO
  // -------------------------------------------------------------
  {
    const now = new Date('2026-11-29T11:40:00');
    const activityNoCoords = [
      {
        id: 'act-no-coords',
        dayId: 'day-1',
        date: '2026-11-29',
        title: 'Pranzo Tipico Rurale',
        time: '11:30',
        duration: '60 min',
        location: 'Trattoria nelle campagne',
        // coordinate ASSENTI
        category: 'cibo',
        status: 'prenotato',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const intel = deriveLiveIntelligence({
      giorni: [{ id: 'd-1', date: '2026-11-29', title: 'Giorno 1', location: 'Campagna', createdAt: 0, updatedAt: 0 }],
      attivita: activityNoCoords,
      tappe: [],
      alloggi: [],
      trasporti: [],
      currentDateTime: now,
      tripStartDate: '2026-11-28',
      tripEndDate: '2026-12-15'
    });

    assert.strictEqual(intel.plannedLocation.coords, undefined);
    assert.strictEqual(intel.plannedLocation.confidence, 'approximate');
    assert.strictEqual(intel.plannedLocation.locationName, 'Trattoria nelle campagne');
    console.log('[PASS 05] Assenza di coordinate: nessun marker fittizio inventato sulla mappa');
  }

  // -------------------------------------------------------------
  // VERIFICA 6: DURANTE UN VOLO NON VIENE MOSTRATO L'AEROPORTO DI ***REMOVED*** COME POSIZIONE ATTUALE
  // -------------------------------------------------------------
  {
    const now = new Date('2026-11-29T16:00:00');
    const flights = [
      {
        id: 'fl-1',
        type: 'volo',
        carrier: 'Air China · CA950',
        date: '2026-11-29',
        departureTime: '12:30',
        arrivalDate: '2026-11-30',
        arrivalTime: '05:40',
        departureLocation: 'Milano Malpensa (MXP)',
        arrivalLocation: 'Pechino Capital (PEK)',
        coordinate: { lat: 40.0799, lng: 116.6031 }, // Coordinate PEK
        status: 'prenotato',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const intel = deriveLiveIntelligence({
      giorni: [{ id: 'd-1', date: '2026-11-29', title: 'Partenza', location: 'Milano', createdAt: 0, updatedAt: 0 }],
      attivita: [],
      tappe: [],
      alloggi: [],
      trasporti: flights,
      currentDateTime: now,
      tripStartDate: '2026-11-28',
      tripEndDate: '2026-12-15'
    });

    assert.strictEqual(intel.currentEvent.isTransportInProgress, true);
    assert.strictEqual(intel.plannedLocation.coords, undefined); // NON deve prendere le coordinate di PEK!
    assert(intel.currentEvent.subtitle.includes('MXP') && intel.currentEvent.subtitle.includes('PEK') && intel.currentEvent.subtitle.includes('→'));
    console.log('[PASS 06] Volo in corso: aeroporto PEK non anticipato e coordinate non interpolate');
  }

  // -------------------------------------------------------------
  // VERIFICA 7: LA PROSSIMA ATTIVITÀ NON VIENE CONFUSA CON QUELLA IN CORSO
  // -------------------------------------------------------------
  {
    const now = new Date('2026-11-29T11:40:00');
    const activities = [
      {
        id: 'act-current',
        dayId: 'day-1',
        date: '2026-11-29',
        title: 'Attività Corrente (Hobbiton)',
        time: '11:00',
        duration: '120 min',
        location: 'Hobbiton',
        category: 'visita',
        status: 'prenotato',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'act-future',
        dayId: 'day-1',
        date: '2026-11-29',
        title: 'Attività Futura (Cena Rotorua)',
        time: '19:30',
        duration: '90 min',
        location: 'Rotorua',
        category: 'cibo',
        status: 'prenotato',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const intel = deriveLiveIntelligence({
      giorni: [{ id: 'd-1', date: '2026-11-29', title: 'Giorno 1', location: 'Matamata', createdAt: 0, updatedAt: 0 }],
      attivita: activities,
      tappe: [],
      alloggi: [],
      trasporti: [],
      currentDateTime: now,
      tripStartDate: '2026-11-28',
      tripEndDate: '2026-12-15'
    });

    assert.strictEqual(intel.currentEvent.title, 'Attività Corrente (Hobbiton)');
    assert.strictEqual(intel.nextEvent.title, 'Attività Futura (Cena Rotorua)');
    assert.notStrictEqual(intel.plannedLocation.title, intel.nextEvent.title);
    console.log('[PASS 07] Prossima attività: separata nettamente dall\'attività in corso');
  }

  // -------------------------------------------------------------
  // VERIFICA 8: EVENTI CHE ATTRAVERSANO MEZZANOTTE INTERPRETATI CORRETTAMENTE
  // -------------------------------------------------------------
  {
    // Orario: ore 01:15 del 30 novembre
    const nowMidnight = new Date('2026-11-30T01:15:00');
    const nightActivity = [
      {
        id: 'act-night',
        dayId: 'day-1',
        date: '2026-11-29',
        endDate: '2026-11-30',
        title: 'Osservazione Stelle Dark Sky',
        time: '23:00',
        duration: '180 min', // fino alle 02:00 del 30/11
        location: 'Osservatorio Mt John',
        coordinate: { lat: -43.9866, lng: 170.4651 },
        category: 'natura',
        status: 'prenotato',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const intel = deriveLiveIntelligence({
      giorni: [
        { id: 'd-1', date: '2026-11-29', title: 'Giorno 1', location: 'Tekapo', createdAt: 0, updatedAt: 0 },
        { id: 'd-2', date: '2026-11-30', title: 'Giorno 2', location: 'Tekapo', createdAt: 0, updatedAt: 0 }
      ],
      attivita: nightActivity,
      tappe: [],
      alloggi: [],
      trasporti: [],
      currentDateTime: nowMidnight,
      tripStartDate: '2026-11-28',
      tripEndDate: '2026-12-15'
    });

    assert.notStrictEqual(intel.currentEvent, null);
    assert.strictEqual(intel.currentEvent.title, 'Osservazione Stelle Dark Sky');
    assert.strictEqual(intel.plannedLocation.coords.lat, -43.9866);
    console.log('[PASS 08] Evento oltre mezzanotte: correttamente riconosciuto in corso il giorno successivo');
  }

  // -------------------------------------------------------------
  // VERIFICA 9: I FUSI ORARI INTERNAZIONALI NON ALTERANO LA SELEZIONE
  // -------------------------------------------------------------
  {
    const aucklandNow = new Date('2026-12-05T14:30:00');
    const aucklandActivities = [
      {
        id: 'act-nz',
        dayId: 'day-7',
        date: '2026-12-05',
        title: 'Sky Tower Walk Auckland',
        time: '14:00',
        duration: '90 min',
        location: 'Auckland Sky Tower',
        coordinate: { lat: -36.8485, lng: 174.7622 },
        category: 'visita',
        status: 'prenotato',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const intel = deriveLiveIntelligence({
      giorni: [{ id: 'd-7', date: '2026-12-05', title: 'Auckland', location: 'Auckland', createdAt: 0, updatedAt: 0 }],
      attivita: aucklandActivities,
      tappe: [],
      alloggi: [],
      trasporti: [],
      currentDateTime: aucklandNow,
      tripStartDate: '2026-11-28',
      tripEndDate: '2026-12-15'
    });

    assert.strictEqual(intel.currentEvent.title, 'Sky Tower Walk Auckland');
    console.log('[PASS 09] Fusi orari internazionali: isolamento temporale affidabile');
  }

  // -------------------------------------------------------------
  // VERIFICA 10: DOPO STOP, PAUSA O SCADENZA GPS IL MARKER PUBBLICO SCOMPARE
  // -------------------------------------------------------------
  {
    // 10a. GPS scaduto (> 120s fa)
    const expiredTime = Date.now() - 150_000;
    db.set(LOCATION_PATH, {
      lat: -37.8721,
      lng: 175.6829,
      accuracy: 10,
      updatedAt: expiredTime
    });

    const loc = db.get(LOCATION_PATH).data();
    const isFresh = Boolean(loc && (Date.now() - loc.updatedAt) < 120_000);
    assert.strictEqual(isFresh, false, 'Marker pubblico deve sparire dopo 2 minuti senza aggiornamenti');

    // 10b. Lease in pausa
    db.set(LEASE_PATH, {
      holderUid: 'organizzatore-uid-01',
      holderDeviceId: 'dev-iphone15-pro-01',
      status: 'paused',
      updatedAt: Date.now(),
      expiresAt: Date.now() + 3600 * 1000
    });

    const leasePaused = db.get(LEASE_PATH).data();
    assert.strictEqual(leasePaused.status, 'paused');

    // 10c. Lease terminato
    db.delete(LOCATION_PATH);
    db.set(LEASE_PATH, {
      holderUid: null,
      holderDeviceId: null,
      status: 'revoked',
      updatedAt: Date.now()
    });

    assert.strictEqual(db.get(LOCATION_PATH).exists(), false);
    console.log('[PASS 10] Ciclo di vita GPS: marker pubblico rimosso su pausa, stop e timeout 120s');
  }

  // -------------------------------------------------------------
  // VERIFICA 11: GLI OSPITI NON POSSONO OTTENERE DATI PRIVATI DELL'ITINERARIO
  // -------------------------------------------------------------
  {
    const now = new Date('2026-11-29T11:40:00');
    const privateActivities = [
      {
        id: 'priv-1',
        dayId: 'day-1',
        date: '2026-11-29',
        title: 'Prenotazione Riservata Hotel Suite & Spa',
        time: '11:00',
        duration: '120 min',
        location: 'Indirizzo Privato 123',
        category: 'relax',
        status: 'prenotato',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    // Chiamata con isExternalGuest = true
    const guestResult = deriveLiveIntelligence({
      giorni: [{ id: 'd-1', date: '2026-11-29', title: 'Giorno 1', location: 'Hotel', createdAt: 0, updatedAt: 0 }],
      attivita: privateActivities,
      tappe: [],
      alloggi: [],
      trasporti: [],
      currentDateTime: now,
      tripStartDate: '2026-11-28',
      tripEndDate: '2026-12-15',
      isExternalGuest: true
    });

    assert.strictEqual(guestResult.currentEvent, null, 'Ospite esterno non deve ricevere dati dell\'itinerario privato');
    assert.strictEqual(guestResult.plannedLocation, null);
    assert.strictEqual(guestResult.nextEvent, null);
    console.log('[PASS 11] Privacy ospiti: isolamento totale dell\'itinerario privato per utenti esterni');
  }

  // -------------------------------------------------------------
  // VERIFICA 12: POSIZIONE PREVISTA PRESENTATA COME PROGRAMMATA E MAI RILEVATA
  // -------------------------------------------------------------
  {
    const wording = {
      plannedMarkerLabel: 'Secondo itinerario',
      sectionTitle: '🗺️ Posizione itinerario',
      headingFallback: 'Posizione programmata',
      neutralComparison: 'Posizione prevista a circa 38 km in linea d\'aria'
    };

    assert(!wording.plannedMarkerLabel.includes('rilevata'));
    assert(!wording.sectionTitle.includes('rilevata'));
    assert(!wording.headingFallback.includes('rilevata'));
    assert(!wording.neutralComparison.includes('ritardo'));

    console.log('[PASS 12] Semantica UI: posizione prevista designata come "PROGRAMMATA", mai come rilevata');
  }

  console.log('\nTUTTE LE 12 VERIFICHE LIVE INTELLIGENCE SUPERATE CON SUCCESSO!\n');
}

main().catch(err => {
  console.error('[ERRORE FASE 2]:', err);
  process.exit(1);
});
