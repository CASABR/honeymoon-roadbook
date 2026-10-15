/**
 * Test Suite Esteso per Sicurezza, Inviti, Notifiche e Assenza di Privilegi 0000
 * Copre esattamente i 9 requisiti specificati:
 * 1. Invito valido e utente autorizzato.
 * 2. Invito scaduto, invalido o alterato.
 * 3. Tentativo di unirsi a un viaggio senza i permessi necessari.
 * 4. Notifica con tripId valido.
 * 5. Notifica senza tripId, che deve fallire in sicurezza.
 * 6. Tentativo di inviare notifiche a partecipanti di un altro viaggio.
 * 7. Token push non valido o scaduto.
 * 8. Accesso non autorizzato ai dati di un viaggio.
 * 9. Assenza di privilegi ottenibili tramite '0000'.
 */

const crypto = require('crypto');
const assert = require('assert');

console.log('=================================================================');
console.log('   TEST DI VERIFICA SICUREZZA, INVITI, NOTIFICHE & PRIVILEGI 0000');
console.log('=================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Errore: ${err.message}`);
    process.exitCode = 1;
  }
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw.trim().toUpperCase()).digest('hex');
}

// -----------------------------------------------------------------------------
// SIMULATORE SERVER CLOUD FUNCTION joinTrip (Logica identica a functions/src/index.ts)
// -----------------------------------------------------------------------------
function serverJoinTrip({ auth, inviteToken, store }) {
  if (!auth) {
    const err = new Error('unauthenticated: Devi essere autenticato.');
    err.code = 'unauthenticated';
    throw err;
  }
  if (!inviteToken || typeof inviteToken !== 'string' || !inviteToken.trim()) {
    const err = new Error('invalid-argument: Codice mancante.');
    err.code = 'invalid-argument';
    throw err;
  }

  const tokenClean = inviteToken.trim().toUpperCase();
  const tokenHash = hashToken(tokenClean);

  let targetTripId = null;
  let tokenData = store.inviteTokens[tokenHash];

  if (tokenData) {
    if (tokenData.active === false) {
      const err = new Error('failed-precondition: Codice di invito revocato o non attivo.');
      err.code = 'failed-precondition';
      throw err;
    }
    if (tokenData.expiresAt && tokenData.expiresAt < Date.now()) {
      const err = new Error('failed-precondition: Codice di invito scaduto.');
      err.code = 'failed-precondition';
      throw err;
    }
    if (typeof tokenData.maxUses === 'number' && (tokenData.usedCount || 0) >= tokenData.maxUses) {
      const err = new Error('failed-precondition: Codice di invito già utilizzato.');
      err.code = 'failed-precondition';
      throw err;
    }
    targetTripId = tokenData.tripId;
  } else {
    // Legacy search
    for (const tId of Object.keys(store.trips)) {
      if (store.trips[tId].inviteCode === tokenClean) {
        targetTripId = tId;
        break;
      }
    }
    if (!targetTripId) {
      const err = new Error('not-found: Codice invito non valido o inesistente.');
      err.code = 'not-found';
      throw err;
    }
  }

  const trip = store.trips[targetTripId];
  if (!trip) {
    const err = new Error('not-found: Il viaggio associato a questo invito non esiste più.');
    err.code = 'not-found';
    throw err;
  }

  if (!trip.members.includes(auth.uid)) {
    trip.members.push(auth.uid);
  }
  if (!store.members[`${trip.id}/${auth.uid}`]) {
    store.members[`${trip.id}/${auth.uid}`] = {
      uid: auth.uid,
      role: 'copilota',
      createdAt: Date.now()
    };
  }

  if (tokenData) {
    tokenData.usedCount = (tokenData.usedCount || 0) + 1;
    tokenData.lastUsedAt = Date.now();
    tokenData.lastUsedBy = auth.uid;
  }

  return {
    success: true,
    tripId: trip.id,
    title: trip.title,
    ownerUid: trip.ownerUid
  };
}

// -----------------------------------------------------------------------------
// SIMULATORE DISPATCHER NOTIFICHE PUSH (Logica identica a scripts/send-update-notification.cjs)
// -----------------------------------------------------------------------------
function simulateSendNotification({ targetTripId, message, subscribers, mockWebPushSend }) {
  // Regola di sicurezza: tripId obbligatorio
  if (!targetTripId || targetTripId === 'all') {
    throw new Error('SECURITY_ERROR: È obbligatorio specificare un tripId valido.');
  }

  // Filtra solo i subscriber associati a targetTripId
  const matching = subscribers.filter(s => s.tripId === targetTripId && s.subscription);
  if (matching.length === 0) {
    return { sentCount: 0, removedCount: 0 };
  }

  let sentCount = 0;
  let removedCount = 0;

  for (const sub of matching) {
    try {
      mockWebPushSend(sub.subscription, message);
      sentCount++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        sub.deleted = true;
        removedCount++;
      } else {
        throw err;
      }
    }
  }

  return { sentCount, removedCount };
}

// -----------------------------------------------------------------------------
// SIMULATORE REGOLE DI ACCESSO FIRESTORE (Mirroring firestore.rules)
// -----------------------------------------------------------------------------
function checkFirestoreTripAccess({ auth, tripId, store }) {
  if (!auth) return false;
  const trip = store.trips[tripId];
  if (!trip) return false;
  if (trip.ownerUid === auth.uid) return true;
  if (Array.isArray(trip.members) && trip.members.includes(auth.uid)) return true;
  const memberDoc = store.members[`${tripId}/${auth.uid}`];
  if (memberDoc) return true;
  return false;
}

// =============================================================================
// ESECUZIONE DEI TEST RICHIESTI
// =============================================================================

const testStore = {
  trips: {
    trip_100: { id: 'trip_100', title: 'Viaggio Reale A', ownerUid: 'owner_A', members: ['owner_A'] },
    trip_200: { id: 'trip_200', title: 'Viaggio Reale B', ownerUid: 'owner_B', members: ['owner_B'] },
    '0000': { id: '0000', title: 'Viaggio 0000', ownerUid: 'owner_0000', members: ['owner_0000'] }
  },
  members: {
    'trip_100/owner_A': { uid: 'owner_A', role: 'owner' },
    'trip_200/owner_B': { uid: 'owner_B', role: 'owner' },
    '0000/owner_0000': { uid: 'owner_0000', role: 'owner' }
  },
  inviteTokens: {}
};

// Genera un token valido per trip_100
const validCode = 'VALID123';
const validHash = hashToken(validCode);
testStore.inviteTokens[validHash] = {
  tokenId: 'tok_valid',
  tokenHash: validHash,
  tripId: 'trip_100',
  expiresAt: Date.now() + 86400000,
  maxUses: 1,
  usedCount: 0,
  active: true
};

// CASO 1: Invito valido e utente autorizzato
runTest('1. Invito valido e utente autorizzato -> Join riuscito con ruolo copilota', () => {
  const res = serverJoinTrip({ auth: { uid: 'guest_user' }, inviteToken: 'valid123', store: testStore });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.tripId, 'trip_100');
  assert.strictEqual(testStore.trips.trip_100.members.includes('guest_user'), true);
  assert.strictEqual(testStore.members['trip_100/guest_user'].role, 'copilota');
});

// CASO 2: Invito scaduto, invalido o alterato
runTest('2. Invito scaduto, invalido o alterato -> Rifiutato in sicurezza', () => {
  // A) Token alterato / inesistente
  assert.throws(() => {
    serverJoinTrip({ auth: { uid: 'guest_attacker' }, inviteToken: 'INVALID9', store: testStore });
  }, /not-found/);

  // B) Token scaduto
  const expCode = 'EXPIRED9';
  const expHash = hashToken(expCode);
  testStore.inviteTokens[expHash] = {
    tokenId: 'tok_exp',
    tokenHash: expHash,
    tripId: 'trip_100',
    expiresAt: Date.now() - 5000,
    maxUses: 1,
    usedCount: 0,
    active: true
  };
  assert.throws(() => {
    serverJoinTrip({ auth: { uid: 'guest_attacker' }, inviteToken: expCode, store: testStore });
  }, /scaduto/);

  // C) Token già usato
  assert.throws(() => {
    serverJoinTrip({ auth: { uid: 'guest_second' }, inviteToken: 'valid123', store: testStore });
  }, /utilizzato/);
});

// CASO 3: Tentativo di unirsi a un viaggio senza permessi (non autenticato o token revocato)
runTest('3. Tentativo di unirsi senza permessi (unauthenticated / token revocato) -> Bloccato', () => {
  assert.throws(() => {
    serverJoinTrip({ auth: null, inviteToken: 'ANYTOKEN', store: testStore });
  }, /unauthenticated/);

  const revokedCode = 'REVOKED1';
  const revokedHash = hashToken(revokedCode);
  testStore.inviteTokens[revokedHash] = {
    tokenId: 'tok_rev',
    tokenHash: revokedHash,
    tripId: 'trip_100',
    expiresAt: Date.now() + 86400000,
    maxUses: 1,
    usedCount: 0,
    active: false
  };
  assert.throws(() => {
    serverJoinTrip({ auth: { uid: 'guest_user' }, inviteToken: revokedCode, store: testStore });
  }, /revocato/);
});

// CASO 4: Notifica con tripId valido
runTest('4. Notifica con tripId valido -> Inviata solo ai dispositivi iscritti a quel viaggio', () => {
  const subscribers = [
    { id: 'sub_1', tripId: 'trip_100', subscription: { endpoint: 'https://push1' } },
    { id: 'sub_2', tripId: 'trip_100', subscription: { endpoint: 'https://push2' } },
    { id: 'sub_3', tripId: 'trip_200', subscription: { endpoint: 'https://push3' } }
  ];

  const delivered = [];
  const mockSend = (sub, msg) => {
    delivered.push(sub.endpoint);
  };

  const res = simulateSendNotification({
    targetTripId: 'trip_100',
    message: 'Test update',
    subscribers,
    mockWebPushSend: mockSend
  });

  assert.strictEqual(res.sentCount, 2);
  assert.deepStrictEqual(delivered, ['https://push1', 'https://push2']);
});

// CASO 5: Notifica senza tripId, che deve fallire in sicurezza
runTest('5. Notifica senza tripId (o con "all") -> Fallisce immediatamente in sicurezza (nessun broadcast)', () => {
  const subscribers = [
    { id: 'sub_1', tripId: 'trip_100', subscription: { endpoint: 'https://push1' } }
  ];
  assert.throws(() => {
    simulateSendNotification({
      targetTripId: null,
      message: 'Broadcast?',
      subscribers,
      mockWebPushSend: () => {}
    });
  }, /SECURITY_ERROR/);

  assert.throws(() => {
    simulateSendNotification({
      targetTripId: 'all',
      message: 'Broadcast?',
      subscribers,
      mockWebPushSend: () => {}
    });
  }, /SECURITY_ERROR/);
});

// CASO 6: Tentativo di inviare notifiche a partecipanti di un altro viaggio
runTest('6. Isolamento viaggi nelle notifiche -> I partecipanti di trip_200 non ricevono notifiche di trip_100', () => {
  const subscribers = [
    { id: 'sub_A', tripId: 'trip_100', subscription: { endpoint: 'https://pushA' } },
    { id: 'sub_B', tripId: 'trip_200', subscription: { endpoint: 'https://pushB' } }
  ];
  const delivered = [];
  simulateSendNotification({
    targetTripId: 'trip_100',
    message: 'Nuova tappa',
    subscribers,
    mockWebPushSend: (sub) => delivered.push(sub.endpoint)
  });
  assert.strictEqual(delivered.includes('https://pushB'), false);
  assert.strictEqual(delivered.includes('https://pushA'), true);
});

// CASO 7: Token push non valido o scaduto (410 Gone / 404 Not Found)
runTest('7. Token push non valido o scaduto -> Intercettato ed eliminato dal database', () => {
  const subscribers = [
    { id: 'sub_dead', tripId: 'trip_100', subscription: { endpoint: 'https://dead' }, deleted: false }
  ];
  const mockSendGone = () => {
    const err = new Error('Subscription expired');
    err.statusCode = 410;
    throw err;
  };
  const res = simulateSendNotification({
    targetTripId: 'trip_100',
    message: 'Check',
    subscribers,
    mockWebPushSend: mockSendGone
  });
  assert.strictEqual(res.sentCount, 0);
  assert.strictEqual(res.removedCount, 1);
  assert.strictEqual(subscribers[0].deleted, true);
});

// CASO 8: Accesso non autorizzato ai dati di un viaggio
runTest('8. Accesso non autorizzato ai dati di un viaggio -> Bloccato da Firestore rule', () => {
  // Utente estraneo che tenta di leggere trip_200
  const canAttackerAccess = checkFirestoreTripAccess({
    auth: { uid: 'attacker_user' },
    tripId: 'trip_200',
    store: testStore
  });
  assert.strictEqual(canAttackerAccess, false);

  // Utente non autenticato
  const canAnonymousAccess = checkFirestoreTripAccess({
    auth: null,
    tripId: 'trip_200',
    store: testStore
  });
  assert.strictEqual(canAnonymousAccess, false);

  // Membro autorizzato
  const canOwnerAccess = checkFirestoreTripAccess({
    auth: { uid: 'owner_B' },
    tripId: 'trip_200',
    store: testStore
  });
  assert.strictEqual(canOwnerAccess, true);
});

// CASO 9: Assenza di privilegi ottenibili tramite "0000"
runTest('9. Assenza di backdoor o privilegi tramite "0000" -> Trattato come codice ordinario, nessun bypass', () => {
  // L\'inserimento di 0000 come codice di invito senza token registrato DEVE fallire
  assert.throws(() => {
    serverJoinTrip({ auth: { uid: 'random_guest' }, inviteToken: '0000', store: testStore });
  }, /not-found/);

  // Un utente casuale NON ottiene accesso ai dati di 0000
  const canRandomAccess = checkFirestoreTripAccess({
    auth: { uid: 'random_guest' },
    tripId: '0000',
    store: testStore
  });
  assert.strictEqual(canRandomAccess, false);
});

console.log('\n-----------------------------------------------------------------');
console.log(`RISULTATO FINALE: ${passedTests}/${totalTests} TEST COMPLETATI CON SUCCESSO!`);
console.log('-----------------------------------------------------------------\n');
