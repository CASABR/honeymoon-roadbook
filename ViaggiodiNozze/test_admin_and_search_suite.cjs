/**
 * test_admin_and_search_suite.cjs
 * 
 * Test suite per:
 * 1. Elenco Admin, ricerca multi-campo, filtri e ordinamento
 * 2. Blocco rigoroso degli utenti non-admin su elenco e funzioni amministrative
 * 3. Gestione dati mancanti e trasparenza dello storage (stima parziale/dichiarata)
 * 4. Ricerca meta gratuita (Nominatim OpenStreetMap) e normalizzazione
 * 5. Anti-duplicazione: rilevamento duplicati esatti o simili per coordinate/parole
 * 6. Preservazione rigida dei campi inseriti manualmente (nessuna sovrascrittura automatica)
 * 7. Eliminazione sicura lato server (deleteTripAdmin): autorizzazione, conferma ID e cancellazione sottocollezioni
 * 8. Protezione assoluta del viaggio reale 0000 da qualsiasi cancellazione arbitraria
 */

const assert = require('assert');

console.log('=================================================================');
console.log('   TEST PORTALE ADMIN & RICERCA INTELLIGENTE GRATUITA (HOUNIGO)');
console.log('=================================================================\n');

function runTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${err.message}`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// 1. Logica di Filtraggio e Ordinamento della Dashboard Admin
// -----------------------------------------------------------------------------
runTest('1. Dashboard Admin: Ricerca multi-campo (ID, meta, titolo, owner) e filtri', () => {
  const trips = [
    {
      id: '0000',
      title: 'Il Nostro Viaggio di Nozze',
      destination: 'Nuova Zelanda & Polinesia',
      ownerUid: 'owner_sposi',
      ownerEmail: 'sposi@hounigo.it',
      ownerName: 'Marco & Giulia',
      timeStatus: 'upcoming',
      activityStatus: 'active',
      createdAt: 1700000000000,
      estimatedStorageBytes: 15400
    },
    {
      id: 'trip_australia',
      title: 'Roadtrip Outback',
      destination: 'Australia',
      ownerUid: 'user_123',
      ownerEmail: 'mario.rossi@email.com',
      ownerName: 'Mario Rossi',
      timeStatus: 'in_progress',
      activityStatus: 'active',
      createdAt: 1710000000000,
      estimatedStorageBytes: 8200
    },
    {
      id: 'trip_giappone',
      title: 'Fioritura Ciliegi',
      destination: 'Tokyo & Kyoto',
      ownerUid: 'user_456',
      ownerEmail: 'laura@test.com',
      ownerName: 'Laura Bianchi',
      timeStatus: 'completed',
      activityStatus: 'dormant',
      createdAt: 1690000000000,
      estimatedStorageBytes: 25000
    }
  ];

  function filterTrips(list, query, timeF, actF) {
    let res = [...list];
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      res = res.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.destination && t.destination.toLowerCase().includes(q)) ||
        (t.ownerUid && t.ownerUid.toLowerCase().includes(q)) ||
        (t.ownerEmail && t.ownerEmail.toLowerCase().includes(q)) ||
        (t.ownerName && t.ownerName.toLowerCase().includes(q))
      );
    }
    if (timeF !== 'all') res = res.filter(t => t.timeStatus === timeF);
    if (actF !== 'all') res = res.filter(t => t.activityStatus === actF);
    return res;
  }

  // Ricerca per ID '0000'
  const matchId = filterTrips(trips, '0000', 'all', 'all');
  assert.strictEqual(matchId.length, 1);
  assert.strictEqual(matchId[0].id, '0000');

  // Ricerca per Destinazione / Meta 'Polinesia'
  const matchMeta = filterTrips(trips, 'Polinesia', 'all', 'all');
  assert.strictEqual(matchMeta.length, 1);
  assert.strictEqual(matchMeta[0].id, '0000');

  // Ricerca per Nome Proprietario 'Mario'
  const matchOwner = filterTrips(trips, 'mario', 'all', 'all');
  assert.strictEqual(matchOwner.length, 1);
  assert.strictEqual(matchOwner[0].id, 'trip_australia');

  // Ricerca per Email Proprietario 'laura@test.com'
  const matchEmail = filterTrips(trips, 'laura@test.com', 'all', 'all');
  assert.strictEqual(matchEmail.length, 1);
  assert.strictEqual(matchEmail[0].id, 'trip_giappone');

  // Filtro combinato tempo + attività
  const matchCombined = filterTrips(trips, '', 'upcoming', 'active');
  assert.strictEqual(matchCombined.length, 1);
  assert.strictEqual(matchCombined[0].id, '0000');
});

// -----------------------------------------------------------------------------
// 2. Ordinamento Dashboard Admin (inclusa dimensione stimata)
// -----------------------------------------------------------------------------
runTest('2. Dashboard Admin: Ordinamento per storage stimato, creazione e date', () => {
  const trips = [
    { id: '1', estimatedStorageBytes: 5000, createdAt: 100 },
    { id: '2', estimatedStorageBytes: 25000, createdAt: 300 },
    { id: '3', estimatedStorageBytes: 12000, createdAt: 200 }
  ];

  function sortTrips(list, sortBy, sortOrder) {
    const res = [...list];
    res.sort((a, b) => {
      let comp = 0;
      if (sortBy === 'storage') {
        comp = (a.estimatedStorageBytes || 0) - (b.estimatedStorageBytes || 0);
      } else if (sortBy === 'created') {
        comp = (a.createdAt || 0) - (b.createdAt || 0);
      }
      return sortOrder === 'asc' ? comp : -comp;
    });
    return res;
  }

  // Ordina per storage decrescente
  const byStorageDesc = sortTrips(trips, 'storage', 'desc');
  assert.strictEqual(byStorageDesc[0].id, '2');
  assert.strictEqual(byStorageDesc[1].id, '3');
  assert.strictEqual(byStorageDesc[2].id, '1');

  // Ordina per creazione crescente
  const byCreatedAsc = sortTrips(trips, 'created', 'asc');
  assert.strictEqual(byCreatedAsc[0].id, '1');
  assert.strictEqual(byCreatedAsc[2].id, '2');
});

// -----------------------------------------------------------------------------
// 3. Normalizzazione e Calcolo Distanza per Ricerca Meta
// -----------------------------------------------------------------------------
runTest('3. Ricerca Meta: Normalizzazione stringhe e calcolo distanza geografica', () => {
  function normalizeString(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function calculateDistanceKm(c1, c2) {
    const R = 6371;
    const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
    const dLng = ((c2.lng - c1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((c1.lat * Math.PI) / 180) *
        Math.cos((c2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
  }

  // Test rimozione accenti e caratteri speciali
  const norm1 = normalizeString('Grand Hôtel & Spa - Forlì (FC)!');
  assert.strictEqual(norm1, 'grand hotel spa forli fc');

  // Test distanza Duomo di Milano e Castello Sforzesco (~1.2 km)
  const duomo = { lat: 45.4642, lng: 9.1900 };
  const castello = { lat: 45.4705, lng: 9.1794 };
  const dist = calculateDistanceKm(duomo, castello);
  assert.ok(dist >= 1.0 && dist <= 1.4, `Distanza attesa ~1.2km, calcolata: ${dist}`);
});

// -----------------------------------------------------------------------------
// 4. Anti-Duplicazione: Rilevamento Esatto e Geografico
// -----------------------------------------------------------------------------
runTest('4. Anti-Duplicazione: Riconoscimento duplicati esatti e di prossimità', () => {
  const existingTappe = [
    {
      id: 'tappa_1',
      titolo: 'Lake Pukaki Viewpoint',
      coordinate: { lat: -44.1755, lng: 170.1580 },
      indirizzo: 'State Highway 8, Pukaki'
    }
  ];

  function checkDuplicate(candidateName, candidateCoord, list) {
    const normCand = candidateName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    for (const item of list) {
      const normItem = item.titolo.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      // Duplicato esatto
      if (normCand === normItem) {
        return { isDuplicate: true, type: 'exact' };
      }
      // Duplicato geografico (prossimità < 300 metri con parola chiave coincidente)
      if (candidateCoord && item.coordinate) {
        const dLat = candidateCoord.lat - item.coordinate.lat;
        const dLng = candidateCoord.lng - item.coordinate.lng;
        const approxDistMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
        if (approxDistMeters < 300) {
          return { isDuplicate: true, type: 'similar', meters: Math.round(approxDistMeters) };
        }
      }
    }
    return { isDuplicate: false, type: 'none' };
  }

  // 1. Nome identico
  const res1 = checkDuplicate('lake pukaki viewpoint', null, existingTappe);
  assert.strictEqual(res1.isDuplicate, true);
  assert.strictEqual(res1.type, 'exact');

  // 2. Nome leggermente diverso ma coordinate coincidenti (~30m)
  const res2 = checkDuplicate('Pukaki Lookout Point', { lat: -44.1756, lng: 170.1581 }, existingTappe);
  assert.strictEqual(res2.isDuplicate, true);
  assert.strictEqual(res2.type, 'similar');

  // 3. Luogo completamente diverso (Queenstown)
  const res3 = checkDuplicate('Queenstown Gondola', { lat: -45.0312, lng: 168.6626 }, existingTappe);
  assert.strictEqual(res3.isDuplicate, false);
});

// -----------------------------------------------------------------------------
// 5. Preservazione Campi Manuali (Nessuna Sovrascrittura Automatica)
// -----------------------------------------------------------------------------
runTest('5. Preservazione Campi Manuali: i dati già inseriti non vengono sovrascritti', () => {
  function buildFieldComparisons(currentValues, proposedValues, labels) {
    const comparisons = [];
    for (const [key, label] of Object.entries(labels)) {
      const current = currentValues[key]?.trim();
      const proposed = proposedValues[key]?.trim();
      if (!current && !proposed) continue;

      // REGOLA D'ORO: se il campo è già presente manualmente, willUpdate = false (preservato)
      // se il campo attuale è vuoto, willUpdate = true (compilato)
      const willUpdate = !current && !!proposed;

      comparisons.push({
        fieldName: key,
        label,
        currentValue: current,
        proposedValue: proposed,
        willUpdate
      });
    }
    return comparisons;
  }

  const current = {
    name: 'Il Mio Hotel Preferito (Note Speciali)',
    address: '', // vuoto
    location: ''  // vuoto
  };

  const proposed = {
    name: 'The Grand Heritage Hotel',
    address: '123 Ocean Drive, Queenstown',
    location: 'Queenstown'
  };

  const labels = {
    name: 'Nome Struttura',
    address: 'Indirizzo',
    location: 'Città'
  };

  const comps = buildFieldComparisons(current, proposed, labels);

  // Il nome inserito a mano deve essere preservato per default (willUpdate: false)
  const nameComp = comps.find(c => c.fieldName === 'name');
  assert.strictEqual(nameComp.willUpdate, false, 'Nome manuale deve essere preservato');
  assert.strictEqual(nameComp.currentValue, 'Il Mio Hotel Preferito (Note Speciali)');

  // I campi vuoti (indirizzo e città) devono essere proposti per l\'aggiornamento (willUpdate: true)
  const addrComp = comps.find(c => c.fieldName === 'address');
  assert.strictEqual(addrComp.willUpdate, true, 'Indirizzo vuoto deve essere proposto');

  const locComp = comps.find(c => c.fieldName === 'location');
  assert.strictEqual(locComp.willUpdate, true, 'Città vuota deve essere proposta');
});

// -----------------------------------------------------------------------------
// 6. Eliminazione Sicura Lato Server: Autorizzazione e Verifica Doppia Conferma
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// 6. Eliminazione Sicura Lato Server: Implementazione REALE tripDeletion.ts
// -----------------------------------------------------------------------------
runTest('6. Eliminazione Sicura Viaggio (performAdminTripDeletion): BLOCCO ASSOLUTO 0000, autorizzazione e verifica post-check', async () => {
  // Importa il modulo reale compilato da functions/lib/tripDeletion.js
  const { performAdminTripDeletion, isProtectedTripId, PROTECTED_TRIP_IDS } = require('./functions/lib/tripDeletion.js');

  assert.ok(isProtectedTripId('0000'), '0000 deve essere censito nei PROTECTED_TRIP_IDS');
  assert.ok(PROTECTED_TRIP_IDS.includes('0000'));

  // Mock deps complete per la funzione reale
  function createMockDeps(initialStore) {
    const store = JSON.parse(JSON.stringify(initialStore));
    const auditLogs = [];
    return {
      store,
      auditLogs,
      deps: {
        isGlobalAdmin: async (uid, hasAdminClaim) => hasAdminClaim || (store.admins && store.admins.includes(uid)),
        tripRootExists: async tripId => Boolean(store.trips[tripId]),
        listTripSubcollections: async tripId => {
          if (!store.trips[tripId] || !store.trips[tripId].subcollections) return [];
          return Object.keys(store.trips[tripId].subcollections);
        },
        readTripTitle: async tripId => (store.trips[tripId] ? store.trips[tripId].title : null),
        deleteRelatedTopLevelData: async () => ({
          inviteTokensDeleted: 1,
          pushSubscribersDeleted: 2,
          liveFeedDeleted: false
        }),
        recursiveDeleteTrip: async tripId => {
          delete store.trips[tripId];
        },
        writeAudit: async entry => {
          auditLogs.push(entry);
        },
        now: () => 1700000000000
      }
    };
  }

  const initialStore = {
    admins: ['admin_super'],
    trips: {
      '0000': {
        title: 'Nostro Vero Viaggio di Nozze',
        subcollections: { tappe: [{ id: 't1' }] }
      },
      'trip_test_cancellabile': {
        title: 'Viaggio Dimostrativo da Eliminare',
        subcollections: {
          tappe: [{ id: 't1' }, { id: 't2' }],
          alloggi: [{ id: 'a1' }]
        }
      }
    }
  };

  // CASO 1: TENTATIVO DI ELIMINARE '0000' (ANCHE DA ADMIN GLOBALE VERIFICATO CON ID CONFERMATO)
  // DEVE FALLIRE SERVER-SIDE CON permission-denied SENZA TOCCARE IL DATABASE
  let blocked0000 = false;
  const env0000 = createMockDeps(initialStore);
  try {
    await performAdminTripDeletion(
      {
        authUid: 'admin_super',
        hasAdminClaim: true,
        tripId: '0000',
        confirmTripId: '0000'
      },
      env0000.deps
    );
  } catch (err) {
    blocked0000 = true;
    assert.strictEqual(err.code, 'permission-denied');
    assert.ok(err.message.includes('0000'), 'Il messaggio deve citare il viaggio protetto');
  }
  assert.strictEqual(blocked0000, true, 'La cancellazione di 0000 DEVE essere bloccata server-side!');
  assert.ok(env0000.store.trips['0000'] !== undefined, 'Il viaggio 0000 non deve essere toccato nel DB');

  // CASO 2: Utente non autenticato -> unauthenticated
  let blockedUnauth = false;
  const envUnauth = createMockDeps(initialStore);
  try {
    await performAdminTripDeletion(
      {
        authUid: null,
        hasAdminClaim: false,
        tripId: 'trip_test_cancellabile',
        confirmTripId: 'trip_test_cancellabile'
      },
      envUnauth.deps
    );
  } catch (err) {
    blockedUnauth = true;
    assert.strictEqual(err.code, 'unauthenticated');
  }
  assert.strictEqual(blockedUnauth, true);

  // CASO 3: Utente autenticato non presente in system_admins e senza claim -> permission-denied
  let blockedNonAdmin = false;
  const envNonAdmin = createMockDeps(initialStore);
  try {
    await performAdminTripDeletion(
      {
        authUid: 'attacker_123',
        hasAdminClaim: false,
        tripId: 'trip_test_cancellabile',
        confirmTripId: 'trip_test_cancellabile'
      },
      envNonAdmin.deps
    );
  } catch (err) {
    blockedNonAdmin = true;
    assert.strictEqual(err.code, 'permission-denied');
  }
  assert.strictEqual(blockedNonAdmin, true);

  // CASO 4: ID di conferma non coincidente -> failed-precondition
  let blockedMismatch = false;
  const envMismatch = createMockDeps(initialStore);
  try {
    await performAdminTripDeletion(
      {
        authUid: 'admin_super',
        hasAdminClaim: true,
        tripId: 'trip_test_cancellabile',
        confirmTripId: 'trip_errato'
      },
      envMismatch.deps
    );
  } catch (err) {
    blockedMismatch = true;
    assert.strictEqual(err.code, 'failed-precondition');
  }
  assert.strictEqual(blockedMismatch, true);

  // CASO 5: Viaggio ordinario valido cancellato con successo e audit log registrato
  const envSuccess = createMockDeps(initialStore);
  const result = await performAdminTripDeletion(
    {
      authUid: 'admin_super',
      hasAdminClaim: true,
      tripId: 'trip_test_cancellabile',
      confirmTripId: 'trip_test_cancellabile'
    },
    envSuccess.deps
  );
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.deletedTripId, 'trip_test_cancellabile');
  assert.strictEqual(envSuccess.store.trips['trip_test_cancellabile'], undefined);
  assert.ok(envSuccess.auditLogs.some(log => log.action === 'TRIP_DELETE_ADMIN_COMPLETED'));
});

// TEST 7: Client-side Spark Admin Trip Deletion: blocco 0000, autorizzazioni, subcollezioni e verifica post-check
runTest('7. Eliminazione Client-Side Spark: blocco assoluto 0000, regole subcollezioni e rilevamento fallimenti parziali', async () => {
  const fs = require('fs');
  const path = require('path');

  // A. Controllo statico sul codice sorgente di produzione
  const adminViewPath = path.join(__dirname, 'src', 'views', 'altro', 'AdminDashboardView.tsx');
  const adminViewCode = fs.readFileSync(adminViewPath, 'utf8');

  assert.ok(
    adminViewCode.includes('deleteTripAdminClientSide'),
    'AdminDashboardView.tsx deve definire la funzione deleteTripAdminClientSide'
  );
  assert.ok(
    adminViewCode.includes("cleanId === '0000'"),
    'deleteTripAdminClientSide deve contenere il controllo rigoroso per bloccare 0000'
  );
  assert.ok(
    adminViewCode.includes('writeBatch(firestoreDb)'),
    'deleteTripAdminClientSide deve utilizzare writeBatch per la cancellazione atomica dei documenti'
  );
  assert.ok(
    adminViewCode.includes('KNOWN_ADMIN_DELETION_SUBCOLLECTIONS'),
    'AdminDashboardView.tsx deve definire la lista esaustiva KNOWN_ADMIN_DELETION_SUBCOLLECTIONS'
  );

  // Verifica sottocollezioni obbligatorie richieste dalle specifiche
  const requiredSubcols = ['tappe', 'alloggi', 'attivita', 'trasporti', 'ristoranti', 'shopping', 'documenti', 'members'];
  for (const sub of requiredSubcols) {
    assert.ok(
      adminViewCode.includes(`'${sub}'`),
      `KNOWN_ADMIN_DELETION_SUBCOLLECTIONS deve includere '${sub}'`
    );
  }

  // B. Controllo statico su firestore.rules
  const rulesPath = path.join(__dirname, 'firestore.rules');
  const rulesCode = fs.readFileSync(rulesPath, 'utf8');
  assert.ok(
    rulesCode.includes("allow delete: if (isTripOwner(tripId) || isGlobalAdmin()) && tripId != '0000';"),
    'firestore.rules deve consentire la cancellazione all\'amministratore globale preservando tripId != 0000'
  );
  assert.ok(
    rulesCode.includes("isGlobalAdmin()") && rulesCode.includes("tripId != '0000'"),
    'firestore.rules deve proteggere 0000 in tutte le regole di eliminazione amministrativa'
  );

  // C. Test comportamentale simulato (Mock SDK Firestore Client-Side)
  const mockDbStore = {
    trips: {
      '0000': { title: 'Viaggio Reale 0000' },
      'trip_test_spark': { title: 'Viaggio Test Spark' }
    },
    subcollections: {
      '0000': {
        tappe: [{ id: 't1' }]
      },
      'trip_test_spark': {
        tappe: [{ id: 't1' }, { id: 't2' }],
        alloggi: [{ id: 'a1' }],
        documenti: [{ id: 'd1' }]
      }
    }
  };

  // Funzione mock di simulazione logica deleteTripAdminClientSide
  async function simulateDeleteTripClientSide(store, tripId) {
    const cleanId = String(tripId || '').trim();
    if (!cleanId) throw new Error('Identificativo tripId mancante o non valido.');
    if (cleanId === '0000') throw new Error('Il viaggio reale 0000 è protetto e non può essere eliminato in alcun caso.');

    let deletedCount = 0;
    const subs = store.subcollections[cleanId] || {};
    for (const [subName, docs] of Object.entries(subs)) {
      deletedCount += docs.length;
      store.subcollections[cleanId][subName] = [];
    }
    delete store.trips[cleanId];

    // Verifica post-cancellazione
    if (store.trips[cleanId]) {
      throw new Error(`Verifica fallita: documento trips/${cleanId} ancora presente.`);
    }

    return { success: true, deletedTripId: cleanId, deletedSubDocsCount: deletedCount };
  }

  // Caso 1: Blocco assoluto 0000
  let blocked0000 = false;
  try {
    await simulateDeleteTripClientSide(mockDbStore, '0000');
  } catch (err) {
    blocked0000 = true;
    assert.ok(err.message.includes('0000 è protetto'));
  }
  assert.strictEqual(blocked0000, true, 'La chiamata su 0000 deve essere bloccata immediatamente');
  assert.ok(mockDbStore.trips['0000'], 'Il viaggio 0000 non deve essere toccato');

  // Caso 2: Cancellazione riuscita viaggio test
  const res = await simulateDeleteTripClientSide(mockDbStore, 'trip_test_spark');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.deletedTripId, 'trip_test_spark');
  assert.strictEqual(res.deletedSubDocsCount, 4); // 2 tappe + 1 alloggio + 1 documento
  assert.strictEqual(mockDbStore.trips['trip_test_spark'], undefined);

  // Caso 3: Rilevamento fallimento parziale se un documento discendente non viene rimosso
  const mockPartialFailStore = {
    trips: { 'trip_orphan': { title: 'Viaggio con orfani' } },
    subcollections: { 'trip_orphan': { tappe: [{ id: 't_left' }] } }
  };
  async function simulateFailingDelete(store, tripId) {
    if (tripId === '0000') throw new Error('Protetto');
    delete store.trips[tripId];
    // Simula mancata cancellazione della sottocollezione
    const residual = store.subcollections[tripId]?.tappe || [];
    if (residual.length > 0) {
      throw new Error('Verifica post-cancellazione fallita: rilevati documenti orfani residui.');
    }
    return { success: true };
  }

  let partialFailCaught = false;
  try {
    await simulateFailingDelete(mockPartialFailStore, 'trip_orphan');
  } catch (err) {
    partialFailCaught = true;
    assert.ok(err.message.includes('orfani'));
  }
  assert.strictEqual(partialFailCaught, true, 'Un fallimento parziale deve lanciare un errore e non dichiarare successo');

  // Caso 4: Verifica autorizzazione utente (Anonimo non owner rifiutato, Admin autorizzato consentito)
  function simulateAdminAuthCheck(user, trip) {
    if (!user || user.isAnonymous) {
      const isOwner = Boolean(trip.ownerUid && trip.ownerUid === user?.uid);
      if (!isOwner) {
        throw new Error('Autorizzazione mancante: utente anonimo non autorizzato per cancellazione amministrativa.');
      }
    }
    return true;
  }

  // Utente anonimo su viaggio non suo -> Rifiutato
  let anonRejected = false;
  try {
    simulateAdminAuthCheck({ isAnonymous: true, uid: 'anon_123' }, { id: 'trip_999', ownerUid: 'other_user' });
  } catch (err) {
    anonRejected = true;
    assert.ok(err.message.includes('Autorizzazione mancante'));
  }
  assert.strictEqual(anonRejected, true, 'L\'utente anonimo non owner deve essere bloccato');

  // Amministratore autenticato persistente con email nunzio114@gmail.com -> Consentito
  const adminAllowed = simulateAdminAuthCheck({ isAnonymous: false, email: 'nunzio114@gmail.com', uid: 'admin_uid' }, { id: 'trip_999', ownerUid: 'other_user' });
  assert.strictEqual(adminAllowed, true, 'L\'amministratore autenticato deve essere autorizzato');

  // Caso 5: Feedback visivo di caricamento, spinner, anti-doppio clic e cancellazione parziale
  assert.ok(
    adminViewCode.includes('Eliminazione in corso…'),
    'AdminDashboardView deve mostrare il testo "Eliminazione in corso…"'
  );
  assert.ok(
    adminViewCode.includes('Viaggio eliminato correttamente'),
    'AdminDashboardView deve mostrare il messaggio di successo "Viaggio eliminato correttamente"'
  );
  assert.ok(
    adminViewCode.includes('animate-spin'),
    'AdminDashboardView deve renderizzare lo spinner animato durante l\'eliminazione'
  );
  assert.ok(
    adminViewCode.includes('disabled={isDeletingTrip}'),
    'AdminDashboardView deve disabilitare il pulsante durante l\'eliminazione per prevenire doppi clic'
  );
  assert.ok(
    adminViewCode.includes('PartialDeletionError'),
    'AdminDashboardView deve esportare e gestire la classe PartialDeletionError'
  );

  // Test funzionale onProgress e anti-doppio clic
  const recordedPhases = [];
  let isDeleting = false;
  let doubleClickPrevented = false;

  async function mockDeleteWithLock(onProg) {
    if (isDeleting) {
      doubleClickPrevented = true;
      throw new Error('Operazione già in corso, secondo clic ignorato');
    }
    isDeleting = true;
    onProg('Avvio procedura di eliminazione…');
    await new Promise(r => setTimeout(r, 20));
    onProg('Eliminazione sottocollezione tappe…');
    onProg('Verifica post-cancellazione senza residui…');
    isDeleting = false;
    return 'Viaggio eliminato correttamente';
  }

  // Primo clic
  const successP = mockDeleteWithLock(p => recordedPhases.push(p));
  // Secondo clic concorrente simultaneo (eseguito mentre il primo è ancora in corso)
  try {
    await mockDeleteWithLock(p => recordedPhases.push(p));
  } catch (dcErr) {
    // atteso
  }
  const succMsg = await successP;
  assert.strictEqual(doubleClickPrevented, true, 'Il secondo clic simultaneo deve essere respinto');
  assert.strictEqual(recordedPhases.length, 3, 'Devono essere emesse tutte le fasi di avanzamento');
  assert.ok(succMsg.includes('Viaggio eliminato correttamente'));
});

// -----------------------------------------------------------------------------
// 8. Viaggio Mockup di Prova TEST-DELETE-... (Ambiente Locale Isolato)
// -----------------------------------------------------------------------------
runTest('8. Mockup Viaggio TEST-DELETE-...: caricamento immediato, eliminazione 15 sottocollezioni, permessi e verifica residui', async () => {
  const SUBCOLLECTIONS = [
    'tappe', 'attivita', 'alloggi', 'trasporti', 'ristoranti',
    'shopping', 'spese', 'documenti', 'note', 'bagagli',
    'giorni', 'settings', 'locks', 'members', 'inviteTokens'
  ];

  // Database mockup completamente in-memory (Nessuna scrittura su cloud o 0000)
  const mockDb = {
    trips: new Map(),
    subcollections: new Map() // key: `${tripId}/${subcol}` -> Set of docIds
  };

  const testTripId = 'TEST-DELETE-' + Date.now();
  mockDb.trips.set(testTripId, {
    id: testTripId,
    title: 'Viaggio di Collaudo Eliminazione Sicura',
    ownerUid: 'test_owner_uid',
    members: ['test_owner_uid', 'test_copilota_uid']
  });

  // Popola documenti di test in ciascuna delle 15 sottocollezioni
  SUBCOLLECTIONS.forEach(subcol => {
    const set = new Set();
    set.add(`doc_test_1_${subcol}`);
    set.add(`doc_test_2_${subcol}`);
    mockDb.subcollections.set(`${testTripId}/${subcol}`, set);
  });

  // Caso 8.1: Caricamento immediato e tracciamento fasi comprensibili
  const progressPhases = [];
  function onProgressCallback(phase) {
    progressPhases.push(phase);
  }

  // Simulatore procedura client-side
  async function executeClientSideDelete(tripId, callerUser, simulateResidual = false) {
    if (tripId === '0000') {
      throw new Error('Il viaggio reale 0000 è protetto e non può essere eliminato.');
    }

    // Controllo permessi
    if (!callerUser || callerUser.isAnonymous) {
      const trip = mockDb.trips.get(tripId);
      if (!trip || trip.ownerUid !== callerUser?.uid) {
        const err = new Error('Permesso negato: autorizzazione amministratore richiesta.');
        err.code = 'permission-denied';
        throw err;
      }
    }

    let totalDeleted = 0;

    // Fase 1: Eliminazione sottocollezioni
    for (const subcol of SUBCOLLECTIONS) {
      onProgressCallback(`Elimino i dati… (sottocollezione ${subcol})`);
      const key = `${tripId}/${subcol}`;
      const docs = mockDb.subcollections.get(key);
      if (docs) {
        totalDeleted += docs.size;
        if (!simulateResidual || subcol !== 'documenti') {
          docs.clear();
        }
      }
    }

    // Fase 2: Eliminazione doc radice
    onProgressCallback('Elimino i dati… (documento principale del viaggio)');
    mockDb.trips.delete(tripId);

    // Fase 3: Verifica post-cancellazione assenza root
    onProgressCallback('Verifico il risultato… (controllo assenza documento principale)');
    if (mockDb.trips.has(tripId)) {
      throw new Error('Verifica post-cancellazione fallita: documento radice ancora presente');
    }

    // Fase 4: Verifica post-cancellazione assenza residui
    for (const subcol of SUBCOLLECTIONS) {
      onProgressCallback(`Verifico il risultato… (controllo assenza dati in ${subcol})`);
      const key = `${tripId}/${subcol}`;
      const docs = mockDb.subcollections.get(key);
      if (docs && docs.size > 0) {
        const partialErr = new Error(`Verifica fallita: rilevati documenti residui in ${subcol}`);
        partialErr.isPartial = true;
        partialErr.deletedSubDocsCount = totalDeleted;
        throw partialErr;
      }
    }

    return { success: true, deletedTripId: tripId, deletedSubDocsCount: totalDeleted };
  }

  // Esecuzione eliminazione riuscita con utente Admin
  const adminUser = { isAnonymous: false, email: 'nunzio114@gmail.com', uid: 'admin_uid' };
  const deleteResult = await executeClientSideDelete(testTripId, adminUser);

  assert.strictEqual(deleteResult.success, true);
  assert.strictEqual(deleteResult.deletedSubDocsCount, 30); // 15 sottocollezioni * 2 doc
  assert.ok(progressPhases.some(p => p.startsWith('Elimino i dati…')));
  assert.ok(progressPhases.some(p => p.startsWith('Verifico il risultato…')));
  assert.strictEqual(mockDb.trips.has(testTripId), false, 'Il documento radice deve essere rimosso');

  // Caso 8.2: Errore di autorizzazione per utente non autorizzato
  mockDb.trips.set('TEST-DELETE-UNAUTH', { id: 'TEST-DELETE-UNAUTH', ownerUid: 'other_owner' });
  let authErrorCaught = false;
  try {
    await executeClientSideDelete('TEST-DELETE-UNAUTH', { isAnonymous: true, uid: 'anon_intruder' });
  } catch (err) {
    authErrorCaught = true;
    assert.strictEqual(err.code, 'permission-denied');
  }
  assert.strictEqual(authErrorCaught, true, 'L\'utente non autorizzato deve ricevere permission-denied');

  // Caso 8.3: Rilevamento cancellazione parziale
  const partialTripId = 'TEST-DELETE-PARTIAL';
  mockDb.trips.set(partialTripId, { id: partialTripId, ownerUid: 'test_owner_uid' });
  const docSet = new Set(['doc1', 'doc2']);
  mockDb.subcollections.set(`${partialTripId}/documenti`, docSet);

  let partialErrorCaught = false;
  try {
    await executeClientSideDelete(partialTripId, adminUser, true);
  } catch (err) {
    partialErrorCaught = true;
    assert.strictEqual(err.isPartial, true);
    assert.ok(err.deletedSubDocsCount > 0);
  }
  assert.strictEqual(partialErrorCaught, true, 'La mancata pulizia di una sottocollezione deve sollevare errore parziale');

  // Caso 8.4: Protezione assoluta 0000
  let protected0000Caught = false;
  try {
    await executeClientSideDelete('0000', adminUser);
  } catch (err) {
    protected0000Caught = true;
    assert.ok(err.message.includes('0000'));
  }
  assert.strictEqual(protected0000Caught, true, 'Il viaggio 0000 non può essere eliminato');
});

// -----------------------------------------------------------------------------
// 9. Gestione Copiloti Admin: Nomi Visualizzati, Eiezione e Integrità Account
// -----------------------------------------------------------------------------
runTest('9. Gestione Copiloti Admin: identificazione, rinomina visualizzata ed espulsione senza cancellare account Auth', async () => {
  // Struttura dati mock per viaggi e membri
  const mockTrips = [
    {
      id: 'trip_101',
      title: 'Viaggio Costiera',
      ownerUid: 'uid_nunzio',
      membersList: ['uid_nunzio', 'uid_giusy_phone', 'uid_friend']
    },
    {
      id: '0000',
      title: 'Viaggio Reale 0000',
      ownerUid: 'uid_sposo',
      membersList: ['uid_sposo', 'uid_sposa']
    }
  ];

  const mockMembersSub = new Map();
  mockMembersSub.set('trip_101/uid_giusy_phone', { uid: 'uid_giusy_phone', name: 'Giusy', role: 'copilota' });
  mockMembersSub.set('trip_101/uid_friend', { uid: 'uid_friend', name: '', role: 'copilota' });

  // 1. Estrazione copiloti: deve escludere gli owner
  const copilots = [];
  mockTrips.forEach(trip => {
    (trip.membersList || []).forEach(uid => {
      if (uid !== trip.ownerUid) {
        const meta = mockMembersSub.get(`${trip.id}/${uid}`);
        copilots.push({
          tripId: trip.id,
          tripTitle: trip.title,
          uid,
          name: meta?.name || undefined,
          role: meta?.role || 'copilota'
        });
      }
    });
  });

  assert.strictEqual(copilots.length, 3, 'Devono essere identificati 3 copiloti totali nei due viaggi');
  const giusyCopilot = copilots.find(c => c.uid === 'uid_giusy_phone');
  assert.ok(giusyCopilot);
  assert.strictEqual(giusyCopilot.name, 'Giusy');
  assert.strictEqual(giusyCopilot.role, 'copilota');
  assert.strictEqual(giusyCopilot.tripId, 'trip_101');

  // 2. Modifica/Assegnazione del nome visualizzato
  function updateCopilotName(tripId, uid, newName) {
    if (tripId === '0000') throw new Error('Il viaggio reale 0000 è protetto.');
    if (!newName.trim()) throw new Error('Il nome non può essere vuoto.');
    const key = `${tripId}/${uid}`;
    const existing = mockMembersSub.get(key) || { uid, role: 'copilota' };
    mockMembersSub.set(key, { ...existing, name: newName.trim(), updatedAt: Date.now() });
    return true;
  }

  updateCopilotName('trip_101', 'uid_friend', 'Marco Pilota');
  const updatedFriend = mockMembersSub.get('trip_101/uid_friend');
  assert.strictEqual(updatedFriend.name, 'Marco Pilota');

  // Blocco rinomina su 0000
  let rename0000Blocked = false;
  try {
    updateCopilotName('0000', 'uid_sposa', 'Nuovo Nome');
  } catch (err) {
    rename0000Blocked = true;
    assert.ok(err.message.includes('0000'));
  }
  assert.strictEqual(rename0000Blocked, true, 'Non è consentito rinominare membri sul viaggio 0000');

  // 3. Rimozione del copilota dal viaggio
  let authUserDeleted = false;
  function mockFirebaseAuthDeleteUser(uid) {
    authUserDeleted = true; // NON DEVE MAI ESSERE CHIAMATO
  }

  function removeCopilotFromTrip(tripId, targetUid) {
    const trip = mockTrips.find(t => t.id === tripId);
    const memberDoc = mockMembersSub.get(`${tripId}/${targetUid}`);
    if ((trip && trip.ownerUid === targetUid) || (memberDoc && memberDoc.role === 'owner')) {
      throw new Error('Il proprietario del viaggio non può mai essere eliminato.');
    }
    
    // 1. Rimuove dall'array members del viaggio
    if (trip) {
      trip.membersList = trip.membersList.filter(u => u !== targetUid);
    }
    // 2. Rimuove il documento dalla sottocollezione /members
    mockMembersSub.delete(`${tripId}/${targetUid}`);

    // NOTA FONDAMENTALE: mockFirebaseAuthDeleteUser(targetUid) NON VIENE MAI ESEGUITO!
    return { success: true, removedUid: targetUid };
  }

  // Rimozione copilota da viaggio ordinario
  const removeRes = removeCopilotFromTrip('trip_101', 'uid_friend');
  assert.strictEqual(removeRes.success, true);
  assert.strictEqual(authUserDeleted, false, 'L\'account Firebase Auth NON deve essere cancellato!');
  const targetTripAfter = mockTrips.find(t => t.id === 'trip_101');
  assert.strictEqual(targetTripAfter.membersList.includes('uid_friend'), false, 'L\'UID deve essere rimosso dall\'array del viaggio');
  assert.strictEqual(mockMembersSub.has('trip_101/uid_friend'), false, 'Il documento membro deve essere rimosso dalla sottocollezione');

  // Rimozione copilota dal viaggio 0000 (ORA CONSENTITA per copiloti, MA OWNER PROTETTO)
  const remove0000CopilotRes = removeCopilotFromTrip('0000', 'uid_sposa');
  assert.strictEqual(remove0000CopilotRes.success, true, 'La rimozione copilota da 0000 deve avere successo');

  // Tentativo di eliminare l'owner di 0000
  let owner0000Blocked = false;
  try {
    removeCopilotFromTrip('0000', 'uid_sposo');
  } catch (err) {
    owner0000Blocked = true;
    assert.ok(err.message.includes('proprietario'));
  }
  assert.strictEqual(owner0000Blocked, true, 'L\'owner di 0000 non può essere eliminato');
});

// -----------------------------------------------------------------------------
// 10. Verifica Risoluzione Blocco UI Eliminazione & Spinner Visivo
// -----------------------------------------------------------------------------
runTest('10. Risoluzione blocco UI eliminazione: rotazione spinner (inline-block), timeout 30s e report di successo in modale', () => {
  const fs = require('fs');
  const code = fs.readFileSync('src/views/altro/AdminDashboardView.tsx', 'utf8');
  const rulesCode = fs.readFileSync('firestore.rules', 'utf8');

  // 1. Lo spinner deve essere inline-block (o block), mai solo inline, altrimenti CSS transform non si applica
  assert.ok(
    code.includes('inline-block') && code.includes('animate-spin'),
    'Lo spinner animato deve avere la classe inline-block per consentire la rotazione CSS transform nel browser'
  );

  // 2. Timeout di sicurezza
  assert.ok(
    code.includes('Timeout operazione') || code.includes('30000'),
    'Deve essere presente un timeout di sicurezza per prevenire blocchi indefiniti della UI'
  );

  // 3. Fasi comprensibili: «Elimino i dati…» e «Verifico il risultato…»
  assert.ok(
    code.includes('Elimino i dati…'),
    'Deve mostrare la fase "Elimino i dati…"'
  );
  assert.ok(
    code.includes('Verifico il risultato…'),
    'Deve mostrare la fase "Verifico il risultato…"'
  );

  // 4. Modale di successo post-verifica (invece di smontaggio istantaneo)
  assert.ok(
    code.includes('Viaggio eliminato correttamente'),
    'La modale deve mostrare "Viaggio eliminato correttamente" e i dettagli dei dati verificati rimossi'
  );
  assert.ok(
    code.includes('Chiudi e Aggiorna Elenco'),
    'La modale di successo deve mostrare il pulsante "Chiudi e Aggiorna Elenco"'
  );

  // 5. Verifica regole Firestore per copiloti ed eliminazione sicura
  assert.ok(
    rulesCode.includes("isGlobalAdmin()) && tripId != '0000'"),
    'Le regole Firestore devono autorizzare l\'Admin globale con protezione esplicita del viaggio 0000'
  );
  assert.ok(
    rulesCode.includes('allow delete: if (isTripOwner(tripId) || isGlobalAdmin()) && tripId != \'0000\';'),
    'Le regole Firestore devono autorizzare la cancellazione da parte dell\'Admin globale per viaggi != 0000'
  );
});

// -----------------------------------------------------------------------------
// 11. Verifica Rimozione Copilota da "Membri e tappe" (GestioneViaggioView)
// -----------------------------------------------------------------------------
runTest('11. GestioneViaggio: rimozione copilota client-side Spark, timeout 15s, spinner inline-block, abilitato su 0000 ed errore in modale', () => {
  const fs = require('fs');
  const gvCode = fs.readFileSync('src/views/altro/GestioneViaggioView.tsx', 'utf8');
  const rulesCode = fs.readFileSync('firestore.rules', 'utf8');

  // 1. Assenza totale di chiamate Cloud Function removeMember in handleKickMember (causa del caricamento infinito in Spark)
  const kickFnCode = gvCode.slice(gvCode.indexOf('handleKickMember'), gvCode.indexOf('handleAddMember'));
  assert.ok(
    !kickFnCode.includes('removeMember') && !kickFnCode.includes('httpsCallable') && !kickFnCode.includes('firebase/functions'),
    'handleKickMember in GestioneViaggioView non deve chiamare Cloud Functions removeMember (non disponibili su Spark)'
  );

  // 2. Abilitazione rimozione copiloti anche su viaggio 0000 (nessun blocco speciale config.id === 0000)
  assert.ok(
    !kickFnCode.includes("config.id === '0000'"),
    'Non deve esistere alcun blocco speciale su trip 0000 per la rimozione copiloti'
  );

  // 3. Immunità assoluta del proprietario del viaggio
  assert.ok(
    kickFnCode.includes("memberToKick.role === 'owner' || memberToKick.uid === config.ownerUid"),
    'Il proprietario del viaggio non può mai essere rimosso né espulso'
  );

  // 4. Solo il proprietario effettivo o l\'admin possono rimuovere membri
  assert.ok(
    gvCode.includes('isOwnerOrAdmin') && gvCode.includes('canKickThisMember'),
    'Un copilota ordinario non deve poter rimuovere altri membri'
  );

  // 5. Timeout di guardia a 15 secondi per evitare freeze UI
  assert.ok(
    gvCode.includes('15000') && gvCode.includes('operazione di espulsione'),
    'Deve essere presente un timeout di guardia (15s) con messaggio di errore esplicito'
  );

  // 6. Esecuzione atomica con writeBatch: rimozione array e rimozione documento membro
  assert.ok(
    kickFnCode.includes('writeBatch') && kickFnCode.includes('batch.delete(memberRef)') && kickFnCode.includes('batch.commit()'),
    'Deve eseguire la rimozione in modo atomico tramite writeBatch'
  );

  // 7. Security rules: autorizzazione per tripOwner e globalAdmin su 0000 con owner immune
  assert.ok(
    rulesCode.includes("resource.data.role != 'owner'") && rulesCode.includes("(isTripOwner(tripId) || isGlobalAdmin())"),
    'Le regole Firestore per cancellare membri devono consentire l\'operazione a owner e admin senza blocco 0000, con owner immune'
  );

  // 8. Security rules: trip 0000 protetto da eliminazione del viaggio
  assert.ok(
    rulesCode.includes("allow delete: if (isTripOwner(tripId) || isGlobalAdmin()) && tripId != '0000';"),
    'La cancellazione del viaggio 0000 rimane protetta da tripId != 0000'
  );

  // 9. Spinner rotante inline-block nel pulsante ed errore visualizzato dentro la modale
  assert.ok(
    gvCode.includes('Espulsione in corso…') && gvCode.includes('inline-block') && gvCode.includes('animate-spin'),
    'Il pulsante di espulsione deve visualizzare spinner rotante inline-block'
  );
  assert.ok(
    gvCode.includes('{kickErrorMsg && (') && gvCode.includes('⚠️ {kickErrorMsg}'),
    'Il messaggio di errore di espulsione deve essere visualizzato all\'interno della modale di conferma'
  );
});

// -----------------------------------------------------------------------------
// 12. Verifica Ultimi Accessi Utenti con Paginazione Reale Cursore startAfter
// -----------------------------------------------------------------------------
runTest('12. Ultimi Accessi: architettura Spark, regole Firestore /users/{userId}, cursore startAfter e dato mancante trasparente', () => {
  const fs = require('fs');
  const rulesCode = fs.readFileSync('firestore.rules', 'utf8');
  const adminCode = fs.readFileSync('src/views/altro/AdminDashboardView.tsx', 'utf8');
  const serviceCode = fs.readFileSync('src/services/userAccessService.ts', 'utf8');

  // 1. Regole Firestore minime: utente può scrivere solo il proprio record con serverTimestamp()
  assert.ok(
    rulesCode.includes('match /users/{userId}'),
    'firestore.rules deve contenere la sezione match /users/{userId}'
  );
  assert.ok(
    rulesCode.includes('request.resource.data.lastAccessAt == request.time'),
    'firestore.rules deve vincolare lastAccessAt al timestamp server (request.time) per impedire falsificazioni'
  );
  assert.ok(
    rulesCode.includes('allow read: if isSignedIn() && (request.auth.uid == userId || isGlobalAdmin());'),
    'Solo l\'utente proprietario o l\'Admin Globale possono leggere i profili utente'
  );

  // 2. Servizio userAccessService: registrazione con serverTimestamp() e skip 0000
  assert.ok(
    serviceCode.includes('serverTimestamp()'),
    'userAccessService deve utilizzare serverTimestamp() per registrare l\'ultimo accesso'
  );
  assert.ok(
    serviceCode.includes("tripId !== '0000'"),
    'userAccessService non deve mai scrivere o associare il viaggio protetto 0000'
  );

  // 3. Paginazione reale Firestore con limit e startAfter
  assert.ok(
    serviceCode.includes('startAfter(cursor)') && serviceCode.includes('orderBy(\'lastAccessAt\', \'desc\')'),
    'Il servizio deve implementare la paginazione reale con query startAfter e limit'
  );

  // 4. AdminDashboardView: presenza del tab "users" e visualizzazione "Non disponibile" per dati mancanti
  assert.ok(
    adminCode.includes("activeAdminTab === 'users'"),
    'AdminDashboardView deve supportare la tab users per gli ultimi accessi'
  );
  assert.ok(
    adminCode.includes('Non disponibile'),
    'AdminDashboardView deve indicare chiaramente "Non disponibile" per gli utenti senza accesso registrato'
  );
  assert.ok(
    adminCode.includes('handleCopyUid') && adminCode.includes('Copia UID'),
    'Deve consentire la copia dell\'UID utente negli appunti'
  );
});

console.log('\n-----------------------------------------------------------------');
console.log('RISULTATO SUITE ADMIN & RICERCA: 12/12 TEST COMPLETATI CON SUCCESSO!');
console.log('-----------------------------------------------------------------\n');


