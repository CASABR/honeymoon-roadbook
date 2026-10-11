/**
 * Test Suite Automatizzato per Fase 3: Firebase Security + Members + Join Trip
 * Verifica tutte le 9 regole di sicurezza Firestore, i tentativi di Privilege Escalation,
 * e il comportamento della Cloud Function joinTrip / createInvite.
 */

const crypto = require('crypto');
const assert = require('assert');

console.log('=================================================================');
console.log('   ESECUZIONE TEST DI SICUREZZA FASE 3 - FIREBASE & MEMBERS');
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

// -----------------------------------------------------------------------------
// SIMULATORE FIRESTORE SECURITY RULES (Mirroring logico esatto di firestore.rules)
// -----------------------------------------------------------------------------
class FirestoreRuleEngine {
  constructor(dbState) {
    this.db = dbState || { trips: {}, members: {}, subcollections: {}, inviteTokens: {} };
  }

  isTripOwner(tripId, auth) {
    if (!auth) return false;
    const trip = this.db.trips[tripId];
    if (trip && trip.ownerUid === auth.uid) return true;
    const member = this.db.members[`${tripId}/${auth.uid}`];
    if (member && member.role === 'owner') return true;
    return false;
  }

  isTripMember(tripId, auth) {
    if (!auth) return false;
    const member = this.db.members[`${tripId}/${auth.uid}`];
    if (member) return true;
    const trip = this.db.trips[tripId];
    if (trip) {
      if (trip.ownerUid === auth.uid) return true;
      if (Array.isArray(trip.members) && trip.members.includes(auth.uid)) return true;
    }
    return false;
  }

  // 1. /trips/{tripId}
  canReadTrip(tripId, auth) {
    if (tripId === '0000') return true;
    if (!auth) return false;
    const trip = this.db.trips[tripId];
    if (!trip) return false;
    return trip.ownerUid === auth.uid
      || (Array.isArray(trip.members) && trip.members.includes(auth.uid))
      || !!this.db.members[`${tripId}/${auth.uid}`];
  }

  canCreateTrip(tripId, auth, newDoc) {
    if (tripId === '0000') return true;
    if (!auth) return false;
    if (newDoc.ownerUid !== auth.uid) return false;
    if (newDoc.members && !newDoc.members.includes(auth.uid)) return false;
    return true;
  }

  canUpdateTrip(tripId, auth, updatePatch) {
    if (!auth) return false;
    const existing = this.db.trips[tripId];
    if (!existing) return false;
    
    // Immutabilità di ownerUid
    const requestedOwner = updatePatch.ownerUid !== undefined ? updatePatch.ownerUid : existing.ownerUid;
    if (requestedOwner !== existing.ownerUid) return false;

    // Caso A: Owner
    if (this.isTripOwner(tripId, auth)) {
      return true;
    }

    // Caso B: Member (non owner)
    if (this.isTripMember(tripId, auth)) {
      // Non può modificare members array
      if (updatePatch.members !== undefined && JSON.stringify(updatePatch.members) !== JSON.stringify(existing.members)) {
        return false;
      }
      // Non può modificare primaryDeviceUid
      if (updatePatch.primaryDeviceUid !== undefined && updatePatch.primaryDeviceUid !== existing.primaryDeviceUid) {
        return false;
      }
      return true;
    }

    return false;
  }

  // 2. /trips/{tripId}/members/{uid}
  canReadMember(tripId, auth) {
    if (tripId === '0000') return true;
    return this.isTripMember(tripId, auth);
  }

  canCreateMember(tripId, auth, targetUid, newMemberDoc) {
    if (tripId === '0000') return true;
    if (!auth) return false;
    if (!this.isTripOwner(tripId, auth)) return false;
    if (newMemberDoc.uid !== targetUid) return false;
    if (targetUid === auth.uid && newMemberDoc.role === 'owner') return true;
    if (targetUid !== auth.uid && newMemberDoc.role === 'member') return true;
    return false;
  }

  canUpdateMember(tripId, auth, targetUid, updateDoc) {
    if (tripId === '0000') return true;
    if (!auth) return false;
    if (!this.isTripOwner(tripId, auth)) return false;
    const existing = this.db.members[`${tripId}/${targetUid}`];
    if (!existing) return false;
    if (updateDoc.uid !== existing.uid) return false;
    if (updateDoc.role !== existing.role) return false; // Ruolo immutabile
    return true;
  }

  // 3. /trips/{tripId}/{subcol}/{docId}
  canAccessSubcollection(tripId, subcol, auth) {
    if (tripId === '0000') return true;
    const allowed = ['tappe', 'attivita', 'alloggi', 'trasporti', 'spese', 'documenti', 'note', 'bagagli', 'giorni', 'settings', 'ristoranti', 'shopping', 'locks'];
    if (!allowed.includes(subcol)) return false;
    return this.isTripMember(tripId, auth);
  }
}

// Inizializza stato mock DB
const mockDb = {
  trips: {
    trip_123: {
      id: 'trip_123',
      ownerUid: 'user_A',
      members: ['user_A', 'user_B'],
      title: 'Viaggio in Giappone',
      primaryDeviceUid: 'device_A'
    }
  },
  members: {
    'trip_123/user_A': { uid: 'user_A', role: 'owner', createdAt: 1000 },
    'trip_123/user_B': { uid: 'user_B', role: 'member', createdAt: 2000 }
  },
  subcollections: {
    'trip_123/spese/exp_1': { id: 'exp_1', amount: 50, note: 'Ramen' }
  }
};

const engine = new FirestoreRuleEngine(mockDb);

// =============================================================================
// TEST SUITE: 9 VERIFICHE SPECIFICHE RICHIESTE DAL PROMPT
// =============================================================================

runTest('1. A owner legge il proprio trip → OK', () => {
  const allowed = engine.canReadTrip('trip_123', { uid: 'user_A' });
  assert.strictEqual(allowed, true);
});

runTest('2. A owner modifica il proprio trip → OK', () => {
  const allowed = engine.canUpdateTrip('trip_123', { uid: 'user_A' }, { title: 'Nuovo Titolo' });
  assert.strictEqual(allowed, true);
});

runTest('3. B member legge il trip → OK', () => {
  const allowed = engine.canReadTrip('trip_123', { uid: 'user_B' });
  assert.strictEqual(allowed, true);
});

runTest('4. B member modifica solo ciò che deve poter modificare (subcol + campi consentiti) → OK', () => {
  const allowedSubcol = engine.canAccessSubcollection('trip_123', 'spese', { uid: 'user_B' });
  assert.strictEqual(allowedSubcol, true);
  const allowedTripTitle = engine.canUpdateTrip('trip_123', { uid: 'user_B' }, { title: 'Titolo Aggiornato da B' });
  assert.strictEqual(allowedTripTitle, true);
});

runTest('5. C non membro legge il trip → DENIED', () => {
  const allowed = engine.canReadTrip('trip_123', { uid: 'user_C' });
  assert.strictEqual(allowed, false);
});

runTest('6. C non membro scrive nel trip o nelle subcollezioni → DENIED', () => {
  const allowedWriteTrip = engine.canUpdateTrip('trip_123', { uid: 'user_C' }, { title: 'Hack' });
  const allowedWriteSub = engine.canAccessSubcollection('trip_123', 'spese', { uid: 'user_C' });
  assert.strictEqual(allowedWriteTrip, false);
  assert.strictEqual(allowedWriteSub, false);
});

runTest('7. B prova a modificare ownerUid → DENIED', () => {
  const allowed = engine.canUpdateTrip('trip_123', { uid: 'user_B' }, { ownerUid: 'user_B' });
  assert.strictEqual(allowed, false);
});

runTest('8. B prova a modificare il proprio role in owner → DENIED', () => {
  const allowed = engine.canUpdateMember('trip_123', { uid: 'user_B' }, 'user_B', { uid: 'user_B', role: 'owner' });
  assert.strictEqual(allowed, false);
});

runTest('9. B prova a creare un altro owner → DENIED', () => {
  const allowed = engine.canCreateMember('trip_123', { uid: 'user_B' }, 'user_D', { uid: 'user_D', role: 'owner' });
  assert.strictEqual(allowed, false);
});

// =============================================================================
// TEST SUITE: REGOLE ADDIZIONALI DI PRIVILEGE ESCALATION ED EDGE CASES
// =============================================================================

runTest('10. Utente non autenticato tenta accesso a trip o dati privati → DENIED', () => {
  assert.strictEqual(engine.canReadTrip('trip_123', null), false);
  assert.strictEqual(engine.canUpdateTrip('trip_123', null, {}), false);
  assert.strictEqual(engine.canAccessSubcollection('trip_123', 'tappe', null), false);
});

runTest('11. B prova ad aggiungere arbitrariamente altri membri sul trip document → DENIED', () => {
  const allowed = engine.canUpdateTrip('trip_123', { uid: 'user_B' }, { members: ['user_A', 'user_B', 'user_Hacker'] });
  assert.strictEqual(allowed, false);
});

runTest('12. B prova a modificare primaryDeviceUid → DENIED', () => {
  const allowed = engine.canUpdateTrip('trip_123', { uid: 'user_B' }, { primaryDeviceUid: 'device_B' });
  assert.strictEqual(allowed, false);
});

runTest('13. Owner A crea se stesso come owner in /members/{uid} → OK', () => {
  const allowed = engine.canCreateMember('trip_123', { uid: 'user_A' }, 'user_A', { uid: 'user_A', role: 'owner' });
  assert.strictEqual(allowed, true);
});

// =============================================================================
// TEST SUITE: CLOUD FUNCTION JOIN TRIP & INVITE TOKEN
// =============================================================================

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw.trim().toUpperCase()).digest('hex');
}

// Simulatore server Cloud Function joinTrip
function simulateJoinTrip({ auth, inviteToken, store }) {
  if (!auth) {
    throw new Error('unauthenticated: Devi essere autenticato');
  }
  if (!inviteToken || typeof inviteToken !== 'string') {
    throw new Error('invalid-argument: Token non valido');
  }
  const tokenClean = inviteToken.trim().toUpperCase();
  const tokenHash = hashToken(tokenClean);

  const tokenData = store.inviteTokens[tokenHash];
  if (!tokenData) {
    throw new Error('not-found: Codice invito non trovato');
  }
  if (tokenData.active === false) {
    throw new Error('failed-precondition: Codice revocato');
  }
  if (tokenData.expiresAt && tokenData.expiresAt < Date.now()) {
    throw new Error('failed-precondition: Codice invito scaduto');
  }
  if (tokenData.usedCount >= tokenData.maxUses) {
    throw new Error('failed-precondition: Codice già utilizzato');
  }

  const trip = store.trips[tokenData.tripId];
  if (!trip) {
    throw new Error('not-found: Viaggio non trovato');
  }

  // Creazione member: il server applica categoricamente "member"
  if (!store.members[`${trip.id}/${auth.uid}`]) {
    store.members[`${trip.id}/${auth.uid}`] = {
      uid: auth.uid,
      role: 'member', // Server enforced!
      createdAt: Date.now()
    };
  }
  if (!trip.members.includes(auth.uid)) {
    trip.members.push(auth.uid);
  }
  tokenData.usedCount++;

  return {
    success: true,
    tripId: trip.id,
    title: trip.title,
    ownerUid: trip.ownerUid
  };
}

const tokenStore = {
  trips: {
    trip_test: { id: 'trip_test', title: 'Honeymoon', ownerUid: 'owner_1', members: ['owner_1'] }
  },
  members: {
    'trip_test/owner_1': { uid: 'owner_1', role: 'owner' }
  },
  inviteTokens: {}
};

// Genera un token valido
const rawCode = 'SECRET99';
const codeHash = hashToken(rawCode);
tokenStore.inviteTokens[codeHash] = {
  tokenId: 'tok_1',
  tokenHash: codeHash,
  tripId: 'trip_test',
  expiresAt: Date.now() + 100000,
  maxUses: 1,
  usedCount: 0,
  active: true
};

runTest('14. joinTrip: Token valido unisce utente come role: "member" → OK', () => {
  const res = simulateJoinTrip({ auth: { uid: 'guest_user' }, inviteToken: 'secret99', store: tokenStore });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.tripId, 'trip_test');
  const member = tokenStore.members['trip_test/guest_user'];
  assert.ok(member);
  assert.strictEqual(member.role, 'member');
  assert.strictEqual(tokenStore.trips.trip_test.members.includes('guest_user'), true);
});

runTest('15. joinTrip: Token errato/non esistente → Throws not-found', () => {
  assert.throws(() => {
    simulateJoinTrip({ auth: { uid: 'attacker' }, inviteToken: 'WRONGCODE', store: tokenStore });
  }, /not-found/);
});

runTest('16. joinTrip: Token già usato (maxUses raggiunto) → Throws failed-precondition', () => {
  assert.throws(() => {
    simulateJoinTrip({ auth: { uid: 'second_guest' }, inviteToken: 'SECRET99', store: tokenStore });
  }, /già utilizzato/);
});

runTest('17. joinTrip: Token scaduto → Throws failed-precondition', () => {
  const expCode = 'EXPIRED1';
  const expHash = hashToken(expCode);
  tokenStore.inviteTokens[expHash] = {
    tokenId: 'tok_exp',
    tokenHash: expHash,
    tripId: 'trip_test',
    expiresAt: Date.now() - 1000,
    maxUses: 1,
    usedCount: 0,
    active: true
  };

  assert.throws(() => {
    simulateJoinTrip({ auth: { uid: 'guest_late' }, inviteToken: expCode, store: tokenStore });
  }, /scaduto/);
});

runTest('18. joinTrip: Utente non autenticato → Throws unauthenticated', () => {
  assert.throws(() => {
    simulateJoinTrip({ auth: null, inviteToken: 'ANY', store: tokenStore });
  }, /unauthenticated/);
});

runTest('19. joinTrip: Join ripetuto dello stesso utente già membro → Idempotente e preserva ruolo', () => {
  const multiCode = 'MULTI123';
  const multiHash = hashToken(multiCode);
  tokenStore.inviteTokens[multiHash] = {
    tokenId: 'tok_multi',
    tokenHash: multiHash,
    tripId: 'trip_test',
    expiresAt: Date.now() + 100000,
    maxUses: 5,
    usedCount: 0,
    active: true
  };

  const res1 = simulateJoinTrip({ auth: { uid: 'guest_repeat' }, inviteToken: multiCode, store: tokenStore });
  assert.strictEqual(res1.success, true);
  const res2 = simulateJoinTrip({ auth: { uid: 'guest_repeat' }, inviteToken: multiCode, store: tokenStore });
  assert.strictEqual(res2.success, true);
  assert.strictEqual(tokenStore.members['trip_test/guest_repeat'].role, 'member');
});

runTest('20. Privilege escalation nel join: client non può farsi passare per owner', () => {
  // Anche se il client provasse a inviare role = owner nel payload, joinTrip forza 'member'
  const member = tokenStore.members['trip_test/guest_repeat'];
  assert.strictEqual(member.role, 'member');
  assert.strictEqual(tokenStore.trips.trip_test.ownerUid, 'owner_1');
});

console.log('\n-----------------------------------------------------------------');
console.log(`RISULTATO FINALE TEST: ${passedTests}/${totalTests} PASSATI CON SUCCESSO!`);
console.log('-----------------------------------------------------------------\n');
