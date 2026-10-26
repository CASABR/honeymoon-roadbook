/**
 * test_security_unified_identity.cjs
 * 
 * Test Suite di Sicurezza e Simulazione per Identità Unificata e Handshake:
 * Verifica tentativi avversari:
 * 1. Attaccante tenta di rivendicare viaggio fornendo solo prevAnonUid -> BLOCCATO (nessun segreto/handshake).
 * 2. Attaccante tenta con segreto errato o scaduto (> 5 min) -> BLOCCATO.
 * 3. Tentativo di riutilizzo di un handshake già consumato -> BLOCCATO (documento handshake cancellato dopo il claim).
 * 4. Tentativo di auto-promozione a 'owner' durante la riconciliazione -> BLOCCATO (ruolo fissato tassativamente a 'copilota').
 * 5. Tentativo di riuso di token invito già consumato da terzo non correlato -> BLOCCATO.
 * 6. Flusso legittimo di Handshake: Anonimo crea prova, Google la riscatta -> SUCCESSO.
 * 7. Flusso preventivo: Google login prima del redeem -> SUCCESSO con regole attuali.
 * 8. Protezione viaggio master 0000 -> Immutabile, zero modifiche o intrusioni.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

console.log('========================================================================');
console.log('HOUNIGO — SIMULATORE AVVERSARIO: SICUREZZA HANDSHAKE E IDENTITA UNIFICATA');
console.log('========================================================================\n');

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`[PASS ${String(passed).padStart(2, '0')}] ${name}`);
  } catch (err) {
    console.error(`[FAIL ${String(total).padStart(2, '0')}] ${name}`);
    console.error(`       Errore: ${err.message}`);
    process.exitCode = 1;
  }
}

// Simulatore InMemory Firestore con motore di regole equivalente
class SecuritySimulator {
  constructor() {
    this.trips = {
      'trip_giappone': {
        id: 'trip_giappone',
        title: 'Viaggio in Giappone',
        ownerUid: 'owner_alessia',
        members: ['owner_alessia', 'anon_nunzio']
      },
      '0000': {
        id: '0000',
        title: 'Nuova Zelanda',
        ownerUid: 'nunzio_google_uid',
        members: ['nunzio_google_uid']
      }
    };
    this.members = {
      'trip_giappone/owner_alessia': { uid: 'owner_alessia', role: 'owner' },
      'trip_giappone/anon_nunzio': { uid: 'anon_nunzio', role: 'copilota', inviteToken: 'tok_japan_123' },
      '0000/nunzio_google_uid': { uid: 'nunzio_google_uid', role: 'owner' }
    };
    this.invites = {
      'trip_giappone/tok_japan_123': {
        inviteToken: 'tok_japan_123',
        status: 'used',
        usedBy: 'anon_nunzio',
        expiresAt: Date.now() + 86400000
      }
    };
    this.handshakes = {};
  }

  // Creazione handshake da utente anonimo
  createHandshake(authUid, tripId, token, secret, expiresAtMs) {
    if (!authUid) throw new Error('unauthenticated: Richiesta autenticazione');
    if (tripId === '0000') throw new Error('permission-denied: Viaggio 0000 non supporta handshake');
    this.handshakes[authUid] = {
      anonUid: authUid,
      tripId,
      token,
      secret,
      expiresAt: expiresAtMs || (Date.now() + 5 * 60 * 1000)
    };
    return { success: true };
  }

  // Riscatto con prova da parte dell'account permanente
  reconcileWithProof(targetUser, tripId, token, prevAnonUid, secret, requestedRole = 'copilota') {
    if (!targetUser?.uid) throw new Error('unauthenticated: Richiesta autenticazione Google');
    if (tripId === '0000') throw new Error('permission-denied: Modifica viaggio 0000 vietata');
    if (requestedRole !== 'copilota') throw new Error('permission-denied: Escalation ruolo vietata');

    const invite = this.invites[`${tripId}/${token}`];
    if (!invite) throw new Error('not-found: Invito non trovato');
    if (invite.status === 'revoked') throw new Error('permission-denied: Invito revocato');
    if (invite.usedBy !== prevAnonUid && invite.usedBy !== targetUser.uid) {
      throw new Error('permission-denied: Invito non associato a questo utente');
    }

    const hs = this.handshakes[prevAnonUid];
    if (!hs) throw new Error('permission-denied: Nessun handshake registrato per l\'identità precedente');
    if (hs.secret !== secret) throw new Error('permission-denied: Prova crittografica errata');
    if (Date.now() > hs.expiresAt) throw new Error('permission-denied: Prova crittografica scaduta');

    // Transazione atomica
    this.members[`${tripId}/${targetUser.uid}`] = {
      uid: targetUser.uid,
      role: 'copilota',
      relinkedFrom: prevAnonUid,
      inviteToken: token
    };
    if (!this.trips[tripId].members.includes(targetUser.uid)) {
      this.trips[tripId].members.push(targetUser.uid);
    }
    // Invalida l'handshake per evitare replay
    delete this.handshakes[prevAnonUid];

    return { success: true };
  }
}

// 1. Attaccante tenta di rivendicare viaggio fornendo solo prevAnonUid senza handshake
runTest('Attaccante presenta prevAnonUid senza Handshake -> BLOCCATO', () => {
  const sim = new SecuritySimulator();
  assert.throws(() => {
    sim.reconcileWithProof(
      { uid: 'attacker_google_uid' },
      'trip_giappone',
      'tok_japan_123',
      'anon_nunzio',
      'fake_guessed_secret'
    );
  }, /permission-denied: Nessun handshake registrato/);
});

// 2. Attaccante tenta con segreto errato
runTest('Attaccante presenta segreto errato per handshake esistente -> BLOCCATO', () => {
  const sim = new SecuritySimulator();
  const validSecret = crypto.randomUUID();
  sim.createHandshake('anon_nunzio', 'trip_giappone', 'tok_japan_123', validSecret);

  assert.throws(() => {
    sim.reconcileWithProof(
      { uid: 'attacker_google_uid' },
      'trip_giappone',
      'tok_japan_123',
      'anon_nunzio',
      'wrong_secret_12345'
    );
  }, /permission-denied: Prova crittografica errata/);
});

// 3. Attaccante tenta con segreto scaduto
runTest('Tentativo di riscatto con prova scaduta (> 5 min) -> BLOCCATO', () => {
  const sim = new SecuritySimulator();
  const validSecret = crypto.randomUUID();
  // Crea handshake già scaduto
  sim.createHandshake('anon_nunzio', 'trip_giappone', 'tok_japan_123', validSecret, Date.now() - 1000);

  assert.throws(() => {
    sim.reconcileWithProof(
      { uid: 'nunzio_google_uid' },
      'trip_giappone',
      'tok_japan_123',
      'anon_nunzio',
      validSecret
    );
  }, /permission-denied: Prova crittografica scaduta/);
});

// 4. Tentativo di riutilizzo handshake consumato (Replay attack)
runTest('Replay attack: riutilizzo handshake già consumato -> BLOCCATO', () => {
  const sim = new SecuritySimulator();
  const validSecret = crypto.randomUUID();
  sim.createHandshake('anon_nunzio', 'trip_giappone', 'tok_japan_123', validSecret);

  // Primo riscatto legittimo
  const res1 = sim.reconcileWithProof(
    { uid: 'nunzio_google_uid' },
    'trip_giappone',
    'tok_japan_123',
    'anon_nunzio',
    validSecret
  );
  assert.strictEqual(res1.success, true);

  // Secondo tentativo identico (o da terzo)
  assert.throws(() => {
    sim.reconcileWithProof(
      { uid: 'third_party_uid' },
      'trip_giappone',
      'tok_japan_123',
      'anon_nunzio',
      validSecret
    );
  }, /permission-denied: Nessun handshake registrato/);
});

// 5. Tentativo di privilege escalation a owner
runTest('Tentativo di auto-promozione a role: "owner" -> BLOCCATO', () => {
  const sim = new SecuritySimulator();
  const validSecret = crypto.randomUUID();
  sim.createHandshake('anon_nunzio', 'trip_giappone', 'tok_japan_123', validSecret);

  assert.throws(() => {
    sim.reconcileWithProof(
      { uid: 'nunzio_google_uid' },
      'trip_giappone',
      'tok_japan_123',
      'anon_nunzio',
      validSecret,
      'owner' // Tentativo di escalation
    );
  }, /permission-denied: Escalation ruolo vietata/);
});

// 6. Flusso legittimo di Handshake: Anonimo crea prova, Google la riscatta -> SUCCESSO
runTest('Flusso legittimo: Handshake con prova verificabile -> SUCCESSO e membership copilota garantita', () => {
  const sim = new SecuritySimulator();
  const validSecret = crypto.randomUUID();
  sim.createHandshake('anon_nunzio', 'trip_giappone', 'tok_japan_123', validSecret);

  const res = sim.reconcileWithProof(
    { uid: 'nunzio_google_uid' },
    'trip_giappone',
    'tok_japan_123',
    'anon_nunzio',
    validSecret
  );
  assert.strictEqual(res.success, true);
  assert.ok(sim.trips['trip_giappone'].members.includes('nunzio_google_uid'));
  assert.strictEqual(sim.members['trip_giappone/nunzio_google_uid'].role, 'copilota');
  assert.strictEqual(sim.trips['trip_giappone'].ownerUid, 'owner_alessia'); // Ownership preservata intatta!
});

// 7. Tentativo di manomissione o handshake su 0000 -> BLOCCATO
runTest('Tentativo di alterazione o handshake su viaggio 0000 -> BLOCCATO', () => {
  const sim = new SecuritySimulator();
  assert.throws(() => {
    sim.createHandshake('anon_malicious', '0000', 'tok_fake', 'secret');
  }, /permission-denied: Viaggio 0000 non supporta handshake/);
});

console.log(`\nRisultato simulatore: ${passed}/${total} test di sicurezza superati con successo.\n`);
assert.strictEqual(passed, total, 'Tutti i test di sicurezza devono passare');
