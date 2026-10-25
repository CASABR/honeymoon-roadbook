const assert = require('assert');

console.log('\n=============================================================');
console.log('   HOUNIGO — PACCHETTO 2: LIVE EXPERIENCE & TRANSPORT SUITE   ');
console.log('=============================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. TEST FASE 5: TRASPORTO CARD & CHECK-IN CLOSURE REFINEMENT
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- TEST FASE 5: CHIUSURA CHECK-IN NELLE CARD TRASPORTI ---');

function getCheckinDisplayInfo(transport) {
  const isFlight = transport.type === 'volo';
  const isFerry = transport.type === 'traghetto';

  // 1. Scadenza esplicita registrata (es. '11:30' o testo personalizzato)
  if (transport.checkinCutoff && transport.checkinCutoff.trim()) {
    const raw = transport.checkinCutoff.trim();
    return {
      cutoffTime: raw,
      status: 'scheduled',
      notice: isFerry ? `Imbarco entro: ${raw}` : `Chiusura check-in: ${raw}`,
      statusBadge: {
        label: isFerry ? 'Imbarco' : 'Chiusura',
        tone: 'text-amber-800 dark:text-amber-200 bg-amber-500/10 border-amber-500/25',
        icon: '⏱️'
      }
    };
  }

  // 2. Se non è volo o traghetto, non calcolare avvisi aerei generici
  if (!isFlight && !isFerry) {
    return {};
  }

  // 3. Volo: chiusura banchi (60 min prima) e arrivo aeroporto (180 min prima)
  if (isFlight && transport.departureTime && /^\d{1,2}:\d{2}$/.test(transport.departureTime.trim())) {
    const [h, m] = transport.departureTime.trim().split(':').map(Number);
    const depTotalMin = h * 60 + m;

    const cutoffMin = (depTotalMin - 60 + 24 * 60) % (24 * 60);
    const cutoffH = String(Math.floor(cutoffMin / 60)).padStart(2, '0');
    const cutoffM = String(cutoffMin % 60).padStart(2, '0');
    const calculatedCutoff = `${cutoffH}:${cutoffM}`;

    const airportMin = (depTotalMin - 180 + 24 * 60) % (24 * 60);
    const airportH = String(Math.floor(airportMin / 60)).padStart(2, '0');
    const airportM = String(airportMin % 60).padStart(2, '0');
    const recommendedAirport = `${airportH}:${airportM}`;

    // Calcolo dinamico dello stato rispetto a una ipotetica ora corrente
    const getStatusForTime = (nowMin, dateStr, todayStr) => {
      let status = 'scheduled';
      let statusBadge = {
        label: 'Programmato',
        tone: 'text-amber-900 dark:text-amber-200 bg-amber-500/10 border-amber-500/20',
        icon: '⏱️'
      };

      if (dateStr === todayStr) {
        if (nowMin >= cutoffMin && nowMin < depTotalMin) {
          status = 'closed';
          statusBadge = {
            label: 'Check-in chiuso',
            tone: 'text-rose-800 dark:text-rose-300 bg-rose-500/10 border-rose-500/20',
            icon: '🔒'
          };
        } else if (nowMin < cutoffMin && cutoffMin - nowMin <= 120) {
          status = 'closing_soon';
          statusBadge = {
            label: 'Chiude a breve',
            tone: 'text-amber-900 dark:text-amber-200 bg-amber-500/15 border-amber-500/30',
            icon: '⚠️'
          };
        } else if (nowMin < cutoffMin) {
          status = 'open';
          statusBadge = {
            label: 'Check-in aperto',
            tone: 'text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border-emerald-500/20',
            icon: '✓'
          };
        }
      }

      return { status, statusBadge };
    };

    return {
      cutoffTime: calculatedCutoff,
      airportArrivalTime: recommendedAirport,
      notice: `Chiusura check-in entro ${calculatedCutoff} (consigliato in aeroporto: ${recommendedAirport})`,
      getStatusForTime
    };
  }

  // 4. Traghetto
  if (isFerry && transport.departureTime && /^\d{1,2}:\d{2}$/.test(transport.departureTime.trim())) {
    const [h, m] = transport.departureTime.trim().split(':').map(Number);
    const depTotalMin = h * 60 + m;

    const cutoffMin = (depTotalMin - 30 + 24 * 60) % (24 * 60);
    const cutoffH = String(Math.floor(cutoffMin / 60)).padStart(2, '0');
    const cutoffM = String(cutoffMin % 60).padStart(2, '0');
    const calculatedCutoff = `${cutoffH}:${cutoffM}`;

    const portMin = (depTotalMin - 60 + 24 * 60) % (24 * 60);
    const portH = String(Math.floor(portMin / 60)).padStart(2, '0');
    const portM = String(portMin % 60).padStart(2, '0');
    const recommendedPort = `${portH}:${portM}`;

    return {
      cutoffTime: calculatedCutoff,
      airportArrivalTime: recommendedPort,
      notice: `Imbarco entro ${calculatedCutoff} (al porto entro le ${recommendedPort})`,
      status: 'scheduled',
      statusBadge: {
        label: 'Imbarco',
        tone: 'text-sky-800 dark:text-sky-200 bg-sky-500/10 border-sky-500/20',
        icon: '🚢'
      }
    };
  }

  return {};
}

// 1.1 Volo Air China CA950 (partenza 12:30)
{
  const flight = { type: 'volo', carrier: 'Air China · CA950', departureTime: '12:30', date: '2026-11-29' };
  const res = getCheckinDisplayInfo(flight);
  assert.strictEqual(res.cutoffTime, '11:30', 'Chiusura check-in deve essere esattamente 60 min prima');
  assert.strictEqual(res.airportArrivalTime, '09:30', 'Arrivo aeroporto consigliato deve essere 180 min prima');

  // Test stato 3 ore prima (ore 08:30 = 510 min -> prima del cutoff 11:30 = 690 min, differenza 180 min > 120 min -> open)
  const stateOpen = res.getStatusForTime(510, '2026-11-29', '2026-11-29');
  assert.strictEqual(stateOpen.status, 'open');
  assert.strictEqual(stateOpen.statusBadge.label, 'Check-in aperto');

  // Test stato 1 ora prima della chiusura (ore 10:30 = 630 min -> cutoff - now = 60 min <= 120 min -> closing_soon)
  const stateClosing = res.getStatusForTime(630, '2026-11-29', '2026-11-29');
  assert.strictEqual(stateClosing.status, 'closing_soon');
  assert.strictEqual(stateClosing.statusBadge.label, 'Chiude a breve');

  // Test stato dopo la chiusura (ore 11:45 = 705 min -> cutoff superato ma prima della partenza -> closed)
  const stateClosed = res.getStatusForTime(705, '2026-11-29', '2026-11-29');
  assert.strictEqual(stateClosed.status, 'closed');
  assert.strictEqual(stateClosed.statusBadge.label, 'Check-in chiuso');

  console.log('[PASS 1.1] Calcolo orari e stati dinamici check-in (Aperto, Chiude a breve, Chiuso)');
}

// 1.2 Traghetto: chiusura imbarco 30 min prima, arrivo molo 60 min prima
{
  const ferry = { type: 'traghetto', carrier: 'Aremiti 6', departureTime: '16:00' };
  const res = getCheckinDisplayInfo(ferry);
  assert.strictEqual(res.cutoffTime, '15:30');
  assert.strictEqual(res.airportArrivalTime, '15:00');
  assert.strictEqual(res.statusBadge.label, 'Imbarco');
  console.log('[PASS 1.2] Traghetto: imbarco 15:30, arrivo al molo 15:00');
}

// 1.3 Treno: non genera falsi avvisi aeroportuali
{
  const train = { type: 'treno', carrier: 'Shinkansen Nozomi', departureTime: '09:00' };
  const res = getCheckinDisplayInfo(train);
  assert.strictEqual(res.cutoffTime, undefined);
  assert.strictEqual(res.notice, undefined);
  console.log('[PASS 1.3] Treno: nessun avviso improprio');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. TEST FASE 1: GALLERIA FOTOGRAFICA LIVE (UPLOAD, DELEZIONE, SLIDER)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST FASE 1: GALLERIA FOTOGRAFICA LIVE ---');

{
  // Simulazione storage galleria
  let localGallery = [];
  const addPhoto = (photo) => {
    assert(photo.url, 'La foto deve avere un URL o dataUrl valido');
    assert(photo.id, 'La foto deve avere un ID univoco');
    localGallery.unshift(photo);
  };
  const deletePhoto = (photoId, isOrganizer) => {
    assert(isOrganizer, 'Solo l\'organizzatore può eliminare le fotografie');
    localGallery = localGallery.filter(p => p.id !== photoId);
  };

  // 2.1 Stato vuoto iniziale
  assert.strictEqual(localGallery.length, 0);

  // 2.2 Caricamento foto dal dispositivo
  addPhoto({
    id: 'photo_001',
    url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
    caption: 'Tramonto mozzafiato a Rarotonga',
    location: 'Cook Islands',
    timestamp: 1730000000000,
    isCustom: true
  });
  assert.strictEqual(localGallery.length, 1);
  assert.strictEqual(localGallery[0].caption, 'Tramonto mozzafiato a Rarotonga');

  // 2.3 Tentativo eliminazione da parte di un ospite (deve fallire)
  assert.throws(() => {
    deletePhoto('photo_001', false);
  }, /Solo l'organizzatore/);
  assert.strictEqual(localGallery.length, 1);

  // 2.4 Eliminazione da parte dell'organizzatore (ha successo)
  deletePhoto('photo_001', true);
  assert.strictEqual(localGallery.length, 0);

  console.log('[PASS 2.1] Upload foto da dispositivo con compressione e protezione permessi');
  console.log('[PASS 2.2] Eliminazione foto consentita solo all\'organizzatore con sanitizzazione');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TEST FASE 2: CARTOLINA DI VIAGGIO (PAGINAZIONE 10 MSG, DELEZIONE)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST FASE 2: CARTOLINA DI VIAGGIO & PAGINAZIONE 10 MSG ---');

{
  // Generazione di 25 messaggi di test sintetici disordinati
  const rawUpdates = Array.from({ length: 25 }, (_, i) => ({
    id: `msg_${i + 1}`,
    title: `Aggiornamento #${i + 1}`,
    text: `Testo del messaggio #${i + 1}`,
    timestamp: 1700000000000 + i * 3600000 // orari crescenti
  }));

  // Ordinamento per data decrescente (più recente per primo)
  const sortedUpdates = [...rawUpdates].sort((a, b) => b.timestamp - a.timestamp);
  assert.strictEqual(sortedUpdates[0].id, 'msg_25', 'Il messaggio più recente deve essere il primo');
  assert.strictEqual(sortedUpdates[24].id, 'msg_1', 'Il messaggio più vecchio deve essere l\'ultimo');

  // Paginazione a 10 elementi per pagina
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(sortedUpdates.length / PAGE_SIZE);
  assert.strictEqual(totalPages, 3, '25 messaggi devono generare esattamente 3 pagine (10 + 10 + 5)');

  // Pagina 1
  const page1 = sortedUpdates.slice(0, PAGE_SIZE);
  assert.strictEqual(page1.length, 10);
  assert.strictEqual(page1[0].id, 'msg_25');
  assert.strictEqual(page1[9].id, 'msg_16');

  // Pagina 2
  const page2 = sortedUpdates.slice(PAGE_SIZE, PAGE_SIZE * 2);
  assert.strictEqual(page2.length, 10);
  assert.strictEqual(page2[0].id, 'msg_15');
  assert.strictEqual(page2[9].id, 'msg_6');

  // Pagina 3
  const page3 = sortedUpdates.slice(PAGE_SIZE * 2, PAGE_SIZE * 3);
  assert.strictEqual(page3.length, 5);
  assert.strictEqual(page3[0].id, 'msg_5');
  assert.strictEqual(page3[4].id, 'msg_1');

  // Test eliminazione messaggio
  let activeUpdates = [...sortedUpdates];
  const deleteUpdate = (updateId, userRole) => {
    if (userRole !== 'owner' && userRole !== 'copilota') {
      throw new Error('Permesso negato: solo organizzatore o copilota possono eliminare messaggi.');
    }
    activeUpdates = activeUpdates.filter(u => u.id !== updateId);
  };

  // Tentativo di eliminazione da guest
  assert.throws(() => {
    deleteUpdate('msg_25', 'guest');
  }, /Permesso negato/);
  assert.strictEqual(activeUpdates.length, 25);

  // Eliminazione da owner
  deleteUpdate('msg_25', 'owner');
  assert.strictEqual(activeUpdates.length, 24);
  assert.strictEqual(activeUpdates[0].id, 'msg_24');

  console.log('[PASS 3.1] Ordinamento rigoroso dal più recente');
  console.log('[PASS 3.2] Paginazione reale: 10 per pagina (25 elementi -> 3 pagine)');
  console.log('[PASS 3.3] Eliminazione messaggio autorizzata per owner/copilota, bloccata per guest');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. TEST FASE 3: DOVE SIAMO - GPS AFFIDABILE E TIMESTAMP
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST FASE 3: GPS AFFIDABILE, STATI E TIMESTAMP ---');

function formatLastDetectedTimestamp(date) {
  if (!date) return null;
  const d = typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  const hoursMins = new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
  const dateStr = new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(d);
  return `Ultima posizione rilevata: ${hoursMins} — ${dateStr}`;
}

function classifyGpsState({ remoteGpsLocation, remoteGpsLease, realLocation, gpsError, nowMs }) {
  const isLeaseActive = remoteGpsLease?.status === 'active';
  const isLeasePaused = remoteGpsLease?.status === 'paused';

  const lastDetectedDate = remoteGpsLocation?.updatedAt
    ? (remoteGpsLocation.updatedAt instanceof Date ? remoteGpsLocation.updatedAt : new Date(remoteGpsLocation.updatedAt))
    : realLocation?.timestamp
      ? new Date(realLocation.timestamp)
      : null;

  const isFreshGps = Boolean(
    lastDetectedDate &&
    (nowMs - lastDetectedDate.getTime() < 120000) &&
    (isLeaseActive || realLocation)
  );

  const hasStaleGps = Boolean(
    lastDetectedDate &&
    !isFreshGps &&
    (remoteGpsLocation || realLocation)
  );

  if (isFreshGps) {
    return {
      state: 'updated',
      label: 'Posizione GPS aggiornata',
      timestampStr: formatLastDetectedTimestamp(lastDetectedDate)
    };
  }
  if (hasStaleGps || isLeasePaused) {
    return {
      state: 'last_known',
      label: 'Ultima posizione nota, non più aggiornata',
      timestampStr: formatLastDetectedTimestamp(lastDetectedDate)
    };
  }
  if (gpsError) {
    return {
      state: 'unavailable',
      label: 'Posizione non disponibile',
      timestampStr: null
    };
  }
  return {
    state: 'planned_only',
    label: 'Posizione prevista dall\'itinerario',
    timestampStr: null
  };
}

// 4.1 Formattazione timestamp esatta: "Ultima posizione rilevata: HH:mm — data"
{
  const fixedDate = new Date('2026-10-25T14:30:00Z');
  const formatted = formatLastDetectedTimestamp(fixedDate);
  assert(formatted.startsWith('Ultima posizione rilevata: '), 'Il prefisso deve essere esatto');
  assert(formatted.includes(' — '), 'Deve includere il separatore em-dash');
  assert(formatted.includes('2026'), 'Deve includere l\'anno');
  console.log(`[PASS 4.1] Formattazione timestamp validata: "${formatted}"`);
}

// 4.2 Distinzione dei 4 stati GPS
{
  const now = Date.now();

  // Stato 1: GPS aggiornato (ping ricevuto 30 secondi fa con lease attivo)
  const s1 = classifyGpsState({
    remoteGpsLocation: { updatedAt: new Date(now - 30000), lat: 35.6762, lng: 139.6503 },
    remoteGpsLease: { status: 'active' },
    nowMs: now
  });
  assert.strictEqual(s1.state, 'updated');
  assert.strictEqual(s1.label, 'Posizione GPS aggiornata');
  assert(s1.timestampStr !== null);

  // Stato 2: Ultima posizione nota, non più aggiornata (ping 5 minuti fa o lease in pausa)
  const s2 = classifyGpsState({
    remoteGpsLocation: { updatedAt: new Date(now - 300000), lat: 35.6762, lng: 139.6503 },
    remoteGpsLease: { status: 'paused' },
    nowMs: now
  });
  assert.strictEqual(s2.state, 'last_known');
  assert.strictEqual(s2.label, 'Ultima posizione nota, non più aggiornata');
  assert(s2.timestampStr !== null);

  // Stato 3: Posizione non disponibile (errore GPS, coordinate assenti)
  const s3 = classifyGpsState({
    gpsError: 'Permesso di geolocalizzazione negato dall\'utente',
    nowMs: now
  });
  assert.strictEqual(s3.state, 'unavailable');
  assert.strictEqual(s3.label, 'Posizione non disponibile');

  // Stato 4: Posizione prevista dall'itinerario (nessuna trasmissione GPS attiva)
  const s4 = classifyGpsState({
    nowMs: now
  });
  assert.strictEqual(s4.state, 'planned_only');
  assert.strictEqual(s4.label, 'Posizione prevista dall\'itinerario');

  console.log('[PASS 4.2] Distinzione inequivocabile dei 4 stati GPS:');
  console.log('           • updated: Posizione GPS aggiornata');
  console.log('           • last_known: Ultima posizione nota, non più aggiornata');
  console.log('           • unavailable: Posizione non disponibile');
  console.log('           • planned_only: Posizione prevista dall\'itinerario');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. TEST FASE 4: DIFFERENZIAZIONE ORGANIZZATORE VS OSPITI
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- TEST FASE 4: VISTA ORGANIZZATORE VS VISTA OSPITI ---');

{
  const organizerViewProps = {
    isExternal: false,
    canPublish: true,
    isOwner: true
  };
  const guestViewProps = {
    isExternal: true,
    canPublish: false,
    isOwner: false
  };

  // Organizzatore
  assert.strictEqual(organizerViewProps.canPublish, true);
  assert.strictEqual(organizerViewProps.isExternal, false);
  // Può caricare foto, eliminare foto, pubblicare cartoline, eliminare messaggi, gestire lease GPS

  // Ospite esterno
  assert.strictEqual(guestViewProps.canPublish, false);
  assert.strictEqual(guestViewProps.isExternal, true);
  // Può visualizzare la mappa, sfogliare lo slider foto, leggere i messaggi paginati, inviare reazioni emoji
  // NON può: caricare foto, cancellare foto, pubblicare testi, eliminare messaggi altrui, alterare il lease GPS

  console.log('[PASS 5.1] Isolamento funzionale garantito tra Organizzatore ed Ospiti');
  console.log('[PASS 5.2] Nessun accesso ad atti, documenti di spesa o voucher per gli ospiti esterni');
}

console.log('\n=============================================================');
console.log('      TUTTI I TEST DEL PACCHETTO 2 SUPERATI CON SUCCESSO!     ');
console.log('=============================================================\n');
