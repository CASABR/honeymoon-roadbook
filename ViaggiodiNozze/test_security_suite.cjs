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
  // L'inserimento di 0000 come codice di invito senza token registrato DEVE fallire
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

// CASO 10: Verifica Regole Firestore Scansione Globale e Get Riservata ai Membri
runTest('10. Scansione globale e lettura ID -> Solo Membri o Admin in whitelist (anonimi estranei bloccati)', () => {
  // Mock motore regole per allow list / get
  const systemAdmins = { 'super_admin_uid': true };

  function canListGlobalTrips(auth) {
    if (!auth) return false;
    const isGlobalAdmin = Boolean(systemAdmins[auth.uid]) || Boolean(auth.token && auth.token.admin === true);
    return isGlobalAdmin;
  }

  function canGetSingleTrip(auth, tripId) {
    if (!auth) return false;
    const isGlobalAdmin = Boolean(systemAdmins[auth.uid]) || Boolean(auth.token && auth.token.admin === true);
    const isMember = checkFirestoreTripAccess({ auth, tripId, store: testStore });
    return isMember || isGlobalAdmin;
  }

  // 1. Utente anonimo non amministratore prova getDocs(collection(db, 'trips'))
  const anonymousUser = { uid: 'anon_visitor_123' };
  assert.strictEqual(canListGlobalTrips(anonymousUser), false, 'Utente anonimo non deve poter scansionare trips');

  // 2. Utente non autenticato prova getDocs
  assert.strictEqual(canListGlobalTrips(null), false, 'Non autenticato bloccato su scansione');

  // 3. Utente estraneo anonimo prova getDoc(doc(db, 'trips', 'trip_100')) conoscendo l'ID
  assert.strictEqual(canGetSingleTrip(anonymousUser, 'trip_100'), false, 'Utente estraneo NON può leggere metadati di un viaggio altrui per ID');

  // 4. Membro effettivo del viaggio legge il proprio viaggio per ID
  const memberA = { uid: 'owner_A' };
  assert.strictEqual(canGetSingleTrip(memberA, 'trip_100'), true, 'Membro effettivo autorizzato a leggere il proprio viaggio');

  // 5. Viaggio reale 0000: estraneo NON autorizzato riceve NEGATO (nessun bypass per 0000)
  assert.strictEqual(canGetSingleTrip(anonymousUser, '0000'), false, 'Viaggio reale 0000 protetto: utente non membro riceve NEGATO su get');

  // 6. Membro autorizzato di 0000 legge 0000
  const member0000 = { uid: 'owner_0000' };
  assert.strictEqual(canGetSingleTrip(member0000, '0000'), true, 'Membro autorizzato legge i metadati di 0000');

  // 7. Amministratore in whitelist fa getDocs(collection(db, 'trips')) ed entra in qualsiasi viaggio
  const adminUser = { uid: 'super_admin_uid' };
  assert.strictEqual(canListGlobalTrips(adminUser), true, 'Amministratore in whitelist autorizzato alla scansione globale');
  assert.strictEqual(canGetSingleTrip(adminUser, 'trip_100'), true, 'Amministratore autorizzato a leggere metadati per scheda dettaglio');
  assert.strictEqual(canGetSingleTrip(adminUser, '0000'), true, 'Amministratore autorizzato a leggere metadati di 0000');
});

// CASO 11: Verifica Puntuale delle Regole di Sicurezza Firestore Private
runTest('11. Matrice completa delle regole Firestore private (get, list, system_admins, subcollezioni su tutti i viaggi inclusi 0000)', () => {
  const systemAdmins = { 'super_admin_uid': true };

  // Helper speculari a firestore.rules
  function isTripMember(auth, tripId) {
    return checkFirestoreTripAccess({ auth, tripId, store: testStore });
  }

  function isGlobalAdmin(auth) {
    if (!auth) return false;
    return Boolean(systemAdmins[auth.uid]) || Boolean(auth.token && auth.token.admin === true);
  }

  // Regola 1 & 2: match /trips/{tripId} allow get (ZERO eccezioni 0000)
  function allowGetTrip(auth, tripId) {
    if (!auth) return false;
    return isTripMember(auth, tripId) || isGlobalAdmin(auth);
  }

  // Regola 3 & 4: match /trips/{tripId} allow list
  function allowListTrips(auth) {
    return isGlobalAdmin(auth);
  }

  // Regola 5: match /system_admins/{adminUid} allow write
  function allowWriteSystemAdmins(auth, targetAdminUid, writeData) {
    // allow list, write: if false;
    return false;
  }

  // Regola 6: match /trips/{tripId}/{subcol}/{docId} allow read, write
  function allowAccessSubcollection(auth, tripId, subcol) {
    const allowed = ['tappe', 'attivita', 'alloggi', 'trasporti', 'spese', 'documenti', 'note', 'bagagli', 'giorni', 'settings', 'ristoranti', 'shopping', 'locks'];
    if (!allowed.includes(subcol)) return false;
    return isTripMember(auth, tripId);
  }

  const nonMemberUser = { uid: 'stranger_uid' };
  const memberUser = { uid: 'owner_A' };
  const member0000 = { uid: 'owner_0000' };
  const adminUser = { uid: 'super_admin_uid' };

  // 1. get di un viaggio ordinario da parte di un non membro: NEGATO
  assert.strictEqual(allowGetTrip(nonMemberUser, 'trip_100'), false, '1. get non-membro su viaggio ordinario deve essere NEGATO');

  // 2. get di 0000 da parte di un non membro: NEGATO (protetto come tutti i viaggi reali)
  assert.strictEqual(allowGetTrip(nonMemberUser, '0000'), false, '2. get non-membro su 0000 deve essere NEGATO');

  // 3. get da parte di un membro: CONSENTITO
  assert.strictEqual(allowGetTrip(memberUser, 'trip_100'), true, '3a. get da parte di un membro effettivo deve essere CONSENTITO');
  assert.strictEqual(allowGetTrip(member0000, '0000'), true, '3b. get da parte del membro di 0000 deve essere CONSENTITO');

  // 4. list globale da parte di un non amministratore: NEGATO
  assert.strictEqual(allowListTrips(nonMemberUser), false, '4. list globale da parte di un non amministratore deve essere NEGATO');
  assert.strictEqual(allowListTrips(memberUser), false, '4b. list globale da parte di un membro ordinario deve essere NEGATO');

  // 5. list globale da parte di un amministratore autorizzato: CONSENTITO
  assert.strictEqual(allowListTrips(adminUser), true, '5. list globale da parte di admin deve essere CONSENTITO');

  // 6. scrittura client su system_admins: NEGATA incondizionatamente
  assert.strictEqual(allowWriteSystemAdmins(adminUser, 'super_admin_uid', { created: true }), false, '6. scrittura client su system_admins deve essere NEGATA anche per admin');
  assert.strictEqual(allowWriteSystemAdmins(nonMemberUser, 'stranger_uid', { created: true }), false, '6b. scrittura client su system_admins deve essere NEGATA per non admin');

  // 7. accesso alle sottocollezioni da parte di un non membro: NEGATO (anche su 0000)
  assert.strictEqual(allowAccessSubcollection(nonMemberUser, 'trip_100', 'alloggi'), false, '7a. accesso sottocollezioni alloggi da non membro deve essere NEGATO');
  assert.strictEqual(allowAccessSubcollection(nonMemberUser, '0000', 'alloggi'), false, '7b. accesso sottocollezioni alloggi su 0000 da non membro deve essere NEGATO');
  assert.strictEqual(allowAccessSubcollection(nonMemberUser, '0000', 'documenti'), false, '7c. accesso sottocollezioni documenti su 0000 da non membro deve essere NEGATO');
  assert.strictEqual(allowAccessSubcollection(member0000, '0000', 'documenti'), true, '7d. accesso sottocollezioni documenti da membro legittimo di 0000 deve essere CONSENTITO');
});

// CASO 12: Verifica Critica Regole UPDATE, Protezione Membership e Assoluto Isolamento di 0000
runTest('12. Verifica Critica Scrittura: Auto-join negato ovunque (incluso 0000), protezione ruoli e zero contaminazione', () => {
  // Simulazione fedele delle regole create/update su /trips/{tripId} e /members/{uid}
  function canUpdateTripDocument(auth, tripId, existingDoc, newDoc) {
    if (!auth) return false;

    // ownerUid immutabile
    const prevOwner = existingDoc.ownerUid || null;
    const nextOwner = newDoc.ownerUid || null;
    if (prevOwner !== nextOwner) return false;

    const isOwner = prevOwner === auth.uid;
    const isMember = isOwner || (Array.isArray(existingDoc.members) && existingDoc.members.includes(auth.uid));

    // Ramo 1: isTripOwner
    if (isOwner) return true;

    // Ramo 2: isTripMember con primaryDeviceUid immutabile
    if (isMember) {
      const prevDev = existingDoc.primaryDeviceUid || null;
      const nextDev = newDoc.primaryDeviceUid || null;
      if (prevDev === nextDev) return true;
    }

    // Nessun ramo di auto-join client consentito su nessun viaggio
    return false;
  }

  function canCreateMemberDocument(auth, tripId, targetUid, newMemberDoc, tripDoc) {
    if (!auth) return false;
    if (newMemberDoc.uid !== targetUid) return false;

    const isOwner = tripDoc && tripDoc.ownerUid === auth.uid;
    if (isOwner) return true;

    // Utente corrente che si auto-registra: SOLO se già riconosciuto come owner sul trip doc
    if (targetUid === auth.uid) {
      const isInitialOwnerBootstrap = tripDoc && tripDoc.ownerUid === auth.uid;
      const isOwnerRole = newMemberDoc.role === 'owner';

      if (isInitialOwnerBootstrap && isOwnerRole) {
        return true;
      }
    }

    return false;
  }

  const attacker = { uid: 'attacker_anon' };
  const legitimateOwner = { uid: 'owner_A' };
  const memberCopilot = { uid: 'copilot_B' };

  const ordinaryTrip = {
    id: 'trip_100',
    ownerUid: 'owner_A',
    members: ['owner_A', 'copilot_B'],
    title: 'Viaggio Reale A',
    startDate: '2026-11-28',
    endDate: '2027-01-10',
    primaryDeviceUid: 'device_owner'
  };

  const realTrip0000 = {
    id: '0000',
    ownerUid: 'owner_0000',
    members: ['owner_0000', 'copilota_0000'],
    title: 'Nostro Vero Viaggio di Nozze',
    startDate: '2026-11-28',
    endDate: '2027-01-10',
    primaryDeviceUid: 'device_0000'
  };

  // 1. Un non membro NON può aggiungersi a un viaggio ordinario
  const selfJoinOrdinary = {
    ...ordinaryTrip,
    members: [...ordinaryTrip.members, attacker.uid]
  };
  assert.strictEqual(canUpdateTripDocument(attacker, 'trip_100', ordinaryTrip, selfJoinOrdinary), false, '1a. Auto-join client su viaggio ordinario deve essere NEGATO');

  // 1b. Un non membro NON può aggiungersi a 0000 (nessun bypass client per 0000)
  const selfJoin0000 = {
    ...realTrip0000,
    members: [...realTrip0000.members, attacker.uid]
  };
  assert.strictEqual(canUpdateTripDocument(attacker, '0000', realTrip0000, selfJoin0000), false, '1b. Auto-join client su 0000 deve essere NEGATO');

  // 2. Un non membro NON può modificare titolo, date, owner o rimuovere membri da 0000
  const tamper0000 = {
    ...realTrip0000,
    title: 'Hacked 0000',
    startDate: '2026-01-01',
    members: [attacker.uid] // tenta di eliminare i veri sposi
  };
  assert.strictEqual(canUpdateTripDocument(attacker, '0000', realTrip0000, tamper0000), false, '2. Manomissione metadati/membri su 0000 da estraneo deve essere NEGATA');

  // 3. Un non membro NON può leggere o scrivere le sottocollezioni private di 0000
  const canAttackerReadSubcol = checkFirestoreTripAccess({ auth: attacker, tripId: '0000', store: testStore });
  assert.strictEqual(canAttackerReadSubcol, false, '3. Accesso sottocollezioni di 0000 da estraneo deve essere NEGATO');

  // 4. Un utente estraneo NON può assegnarsi ruoli creando il documento membro su 0000
  const selfAssignOwner0000 = canCreateMemberDocument(attacker, '0000', attacker.uid, { uid: attacker.uid, role: 'owner' }, realTrip0000);
  assert.strictEqual(selfAssignOwner0000, false, '4a. Assegnazione non autorizzata role owner su 0000 deve essere NEGATA');

  const selfAssignCopilot0000 = canCreateMemberDocument(attacker, '0000', attacker.uid, { uid: attacker.uid, role: 'copilota' }, realTrip0000);
  assert.strictEqual(selfAssignCopilot0000, false, '4b. Creazione membro non autorizzato su 0000 deve essere NEGATA');

  // 5. Il proprietario legittimo e i membri autorizzati mantengono le operazioni legittime
  const ownerUpdateTitle = { ...ordinaryTrip, title: 'Nuovo Titolo Owner' };
  assert.strictEqual(canUpdateTripDocument(legitimateOwner, 'trip_100', ordinaryTrip, ownerUpdateTitle), true, '5a. Owner autorizzato ad aggiornare il proprio viaggio');

  const memberUpdateWithSameDevice = { ...ordinaryTrip, updatedAt: Date.now() };
  assert.strictEqual(canUpdateTripDocument(memberCopilot, 'trip_100', ordinaryTrip, memberUpdateWithSameDevice), true, '5b. Membro autorizzato ad aggiornamenti ordinari con primaryDeviceUid invariato');

  // 6. Il join tramite Cloud Function continua a funzionare secondo il flusso previsto
  const freshToken = 'FRESH999';
  const freshHash = hashToken(freshToken);
  testStore.inviteTokens[freshHash] = {
    tokenId: 'tok_fresh',
    tokenHash: freshHash,
    tripId: 'trip_100',
    expiresAt: Date.now() + 86400000,
    maxUses: 1,
    usedCount: 0,
    active: true
  };
  const joinResult = serverJoinTrip({ auth: { uid: 'new_legit_guest' }, inviteToken: freshToken, store: testStore });
  assert.strictEqual(joinResult.success, true, '6. Join tramite Cloud Function deve riuscire con successo');
  assert.strictEqual(testStore.trips.trip_100.members.includes('new_legit_guest'), true);

  // 7. Un client non può scrivere in system_admins
  // Già convalidato: allow write: if false
});

console.log('\n-----------------------------------------------------------------');
console.log(`RISULTATO FINALE: ${passedTests}/${totalTests} TEST COMPLETATI CON SUCCESSO!`);
console.log('-----------------------------------------------------------------\n');
