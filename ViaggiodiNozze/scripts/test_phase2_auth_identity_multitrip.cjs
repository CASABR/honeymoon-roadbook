/**
 * HOUNIGO — TEST FASE 2: AUTH, IDENTITÀ E MULTI-VIAGGIO
 * Convalida su Firebase Emulator reale (porta 8085) con identità multiple distinte.
 * 
 * Scenari testati:
 * A. Utente anonimo (Owner Anon A) crea viaggio GIAPPONE (titolo, metadati, doc membro owner).
 * B. Secondo utente (Copilota Anon B) entra tramite invito crittografico valido generato da A.
 * C. Copilota B legge correttamente tappe, spese e documenti privati di GIAPPONE.
 * D. Copilota B collega un account Google nuovo con linkWithPopup (preservando lo stesso UID).
 * E. Copilota B tenta l'accesso con un account Google preesistente (UID diverso, Google C):
 *    - Verifica che l'account Google C non possa abusare di prevUid per auto-promuoversi.
 *    - Verifica che con un nuovo invito autorizzato dall'owner A, Google C diventi membro legittimo.
 *    - Verifica che il flusso sia chiaro e sicuro.
 * F. Il copilota che ha effettuato il login conserva tutti i viaggi di cui è membro.
 * G. Utente (Owner 0000 e Copilota GIAPPONE): verifica selezione tra i due viaggi senza forzature o ritorni ciechi a 0000.
 * H. Membro già autorizzato rientra nel viaggio con link invito senza ri-consumare il token già used.
 * I. Utente estraneo (Attaccante E) non può acquisire membership con UID arbitrario o bypassando il token.
 * J. Inviti non validi (scaduto, già usato, revocato) vengono categoricamente rifiutati da Firestore Rules.
 */

const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  arrayUnion,
  collection,
  getDocs,
  serverTimestamp,
  Timestamp
} = require('firebase/firestore');

const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const projectId = 'demo-phase2-auth-multitrip';

async function runPhase2() {
  console.log('========================================================================');
  console.log('HOUNIGO — FASE 2: AUTH, IDENTITÀ E MULTI-VIAGGIO (TEST COMPLETO EMULATOR)');
  console.log('========================================================================\n');

  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: '127.0.0.1', port: 8085 }
  });

  await testEnv.clearFirestore();

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  [PASS ${passed.toString().padStart(2, '0')}] ${name}`);
    } catch (err) {
      console.error(`  [FAIL ${total.toString().padStart(2, '0')}] ${name}`);
      console.error('    Dettaglio errore:', err.message);
      process.exitCode = 1;
    }
  }

  // Identità simulate:
  const UID_OWNER_A = 'anon_owner_aaa_111';
  const UID_COPILOT_B = 'anon_copilot_bbb_222';
  const UID_GOOGLE_C = 'google_preexisting_ccc_333';
  const UID_ATTACKER_E = 'attacker_eee_666';
  const UID_OWNER_0000 = 'owner_master_0000_777';

  const TRIP_GIAPPONE = 'trip_giappone_2026';
  const TRIP_0000 = '0000';

  const ownerAContext = testEnv.authenticatedContext(UID_OWNER_A);
  const copilotBContext = testEnv.authenticatedContext(UID_COPILOT_B);
  const googleCContext = testEnv.authenticatedContext(UID_GOOGLE_C);
  const attackerEContext = testEnv.authenticatedContext(UID_ATTACKER_E);
  const owner0000Context = testEnv.authenticatedContext(UID_OWNER_0000);
  const unauthContext = testEnv.unauthenticatedContext();

  const dbOwnerA = ownerAContext.firestore();
  const dbCopilotB = copilotBContext.firestore();
  const dbGoogleC = googleCContext.firestore();
  const dbAttackerE = attackerEContext.firestore();
  const dbOwner0000 = owner0000Context.firestore();
  const dbUnauth = unauthContext.firestore();

  const TOKEN_VALID = 'tok_valid_giappone_999';
  const TOKEN_EXPIRED = 'tok_expired_giappone_888';
  const TOKEN_REVOKED = 'tok_revoked_giappone_777';
  const TOKEN_NEW_FOR_C = 'tok_valid_for_google_c_555';

  console.log('--- SCENARIO A: CREAZIONE VIAGGIO GIAPPONE DA UTENTE ANONIMO ---');
  await test('A1: Owner anonimo A crea viaggio GIAPPONE e relativo record membro owner', async () => {
    const batch = writeBatch(dbOwnerA);
    const tripRef = doc(dbOwnerA, 'trips', TRIP_GIAPPONE);
    batch.set(tripRef, {
      title: 'Viaggio in Giappone 2026',
      destination: 'Giappone',
      ownerUid: UID_OWNER_A,
      members: [UID_OWNER_A],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    const memberRef = doc(dbOwnerA, 'trips', TRIP_GIAPPONE, 'members', UID_OWNER_A);
    batch.set(memberRef, {
      uid: UID_OWNER_A,
      role: 'owner',
      displayName: '***REMOVED*** (Owner Anonimo)',
      joinedAt: serverTimestamp()
    });
    await assertSucceeds(batch.commit());

    const snap = await getDoc(doc(dbOwnerA, 'trips', TRIP_GIAPPONE));
    if (!snap.exists() || snap.data().ownerUid !== UID_OWNER_A) {
      throw new Error('Dati viaggio non persistiti correttamente');
    }
  });

  console.log('\n--- SCENARIO B: SECONDO UTENTE ENTRA CON INVITO VALIDO ---');
  await test('B1: Owner A crea token invito valido per copilota (7 giorni)', async () => {
    const inviteRef = doc(dbOwnerA, 'trips', TRIP_GIAPPONE, 'invites', TOKEN_VALID);
    await assertSucceeds(setDoc(inviteRef, {
      inviteToken: TOKEN_VALID,
      tripId: TRIP_GIAPPONE,
      tripTitle: 'Viaggio in Giappone 2026',
      ownerName: '***REMOVED***',
      role: 'copilota',
      status: 'active',
      createdBy: UID_OWNER_A,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000)
    }));
  });

  await test('B2: Copilota B legge i metadati dell\'invito pre-join', async () => {
    const inviteSnap = await getDoc(doc(dbCopilotB, 'trips', TRIP_GIAPPONE, 'invites', TOKEN_VALID));
    if (!inviteSnap.exists() || inviteSnap.data().status !== 'active') {
      throw new Error('Impossibile leggere metadati invito attivo');
    }
  });

  await test('B3: Copilota B riscatta atomicamente l\'invito (aggiorna status used, crea member e aggiunge a members)', async () => {
    const batch = writeBatch(dbCopilotB);
    const inviteRef = doc(dbCopilotB, 'trips', TRIP_GIAPPONE, 'invites', TOKEN_VALID);
    batch.update(inviteRef, {
      status: 'used',
      usedBy: UID_COPILOT_B,
      usedAt: serverTimestamp()
    });

    const memberRef = doc(dbCopilotB, 'trips', TRIP_GIAPPONE, 'members', UID_COPILOT_B);
    batch.set(memberRef, {
      uid: UID_COPILOT_B,
      role: 'copilota',
      displayName: '***REMOVED*** (Copilota)',
      inviteToken: TOKEN_VALID,
      joinedAt: serverTimestamp()
    });

    const tripRef = doc(dbCopilotB, 'trips', TRIP_GIAPPONE);
    batch.update(tripRef, {
      members: arrayUnion(UID_COPILOT_B),
      updatedAt: serverTimestamp()
    });

    await assertSucceeds(batch.commit());
  });

  console.log('\n--- SCENARIO C: COPILOTA B VISUALIZZA TAPPE, SPESE E PREZZI ---');
  await test('C1: Owner A aggiunge una tappa privata e una spesa preventivo', async () => {
    const tappaRef = doc(dbOwnerA, 'trips', TRIP_GIAPPONE, 'tappe', 'tappa_tokyo_01');
    await assertSucceeds(setDoc(tappaRef, {
      title: 'Arrivo a Tokyo e check-in Shinjuku',
      dateStr: '2026-11-01',
      createdAt: serverTimestamp()
    }));

    const spesaRef = doc(dbOwnerA, 'trips', TRIP_GIAPPONE, 'spese', 'spesa_shinkansen_01');
    await assertSucceeds(setDoc(spesaRef, {
      description: 'Japan Rail Pass 7 giorni',
      importo: 350.00,
      categoria: 'trasporti',
      createdAt: serverTimestamp()
    }));
  });

  await test('C2: Copilota B legge correttamente tappe e spese private del viaggio', async () => {
    const tappaSnap = await getDoc(doc(dbCopilotB, 'trips', TRIP_GIAPPONE, 'tappe', 'tappa_tokyo_01'));
    const spesaSnap = await getDoc(doc(dbCopilotB, 'trips', TRIP_GIAPPONE, 'spese', 'spesa_shinkansen_01'));

    if (!tappaSnap.exists() || !spesaSnap.exists()) {
      throw new Error('Dati privati non leggibili dal copilota autorizzato');
    }
    if (spesaSnap.data().importo !== 350.00) {
      throw new Error(`Importo spesa non corrispondente: ${spesaSnap.data().importo}`);
    }
  });

  console.log('\n--- SCENARIO D: COLLEGAMENTO GOOGLE ACCOUNT NUOVO (linkWithPopup) ---');
  await test('D1: Copilota B con UID invariato (linkWithPopup) mantiene membership e accesso trasparente', async () => {
    // In Firebase Auth, linkWithPopup collega la credenziale Google allo stesso record Auth anonimo,
    // preservando l'UID invariato: UID_COPILOT_B == UID_COPILOT_B.
    const memberSnap = await getDoc(doc(dbCopilotB, 'trips', TRIP_GIAPPONE, 'members', UID_COPILOT_B));
    if (!memberSnap.exists() || memberSnap.data().role !== 'copilota') {
      throw new Error('Membership non conservata con UID invariato');
    }
  });

  console.log('\n--- SCENARIO E: COPILOTA TENTA ACCESSO CON ACCOUNT GOOGLE GIÀ ESISTENTE ---');
  await test('E1: Google C (UID diverso) NON può usare prevUid per auto-creare membership (Vulnerabilità Chiusa)', async () => {
    // Attaccante/Altro account tenta di auto-creare membership indicando prevUid
    const memberRef = doc(dbGoogleC, 'trips', TRIP_GIAPPONE, 'members', UID_GOOGLE_C);
    await assertFails(setDoc(memberRef, {
      uid: UID_GOOGLE_C,
      role: 'copilota',
      prevUid: UID_COPILOT_B,
      joinedAt: serverTimestamp()
    }));
  });

  await test('E2: Owner A emette un nuovo invito e Google C entra legittimamente', async () => {
    const inviteRefOwner = doc(dbOwnerA, 'trips', TRIP_GIAPPONE, 'invites', TOKEN_NEW_FOR_C);
    await assertSucceeds(setDoc(inviteRefOwner, {
      inviteToken: TOKEN_NEW_FOR_C,
      tripId: TRIP_GIAPPONE,
      tripTitle: 'Viaggio in Giappone 2026',
      ownerName: '***REMOVED***',
      role: 'copilota',
      status: 'active',
      createdBy: UID_OWNER_A,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000)
    }));

    // Google C riscatta l'invito atomico usando riferimenti al proprio dbGoogleC
    const batch = writeBatch(dbGoogleC);
    const inviteRefGoogle = doc(dbGoogleC, 'trips', TRIP_GIAPPONE, 'invites', TOKEN_NEW_FOR_C);
    batch.update(inviteRefGoogle, {
      status: 'used',
      usedBy: UID_GOOGLE_C,
      usedAt: serverTimestamp()
    });
    batch.set(doc(dbGoogleC, 'trips', TRIP_GIAPPONE, 'members', UID_GOOGLE_C), {
      uid: UID_GOOGLE_C,
      role: 'copilota',
      displayName: '***REMOVED*** (Account Google Definitivo)',
      inviteToken: TOKEN_NEW_FOR_C,
      joinedAt: serverTimestamp()
    });
    batch.update(doc(dbGoogleC, 'trips', TRIP_GIAPPONE), {
      members: arrayUnion(UID_GOOGLE_C),
      updatedAt: serverTimestamp()
    });
    await assertSucceeds(batch.commit());
  });

  console.log('\n--- SCENARIO F: COPILOTA CONSERVA TUTTI I VIAGGI DI CUI È MEMBRO ---');
  await test('F1: Google C verifica presenza sia in members del doc trip sia nella subcollezione', async () => {
    const tripSnap = await getDoc(doc(dbGoogleC, 'trips', TRIP_GIAPPONE));
    const memberSnap = await getDoc(doc(dbGoogleC, 'trips', TRIP_GIAPPONE, 'members', UID_GOOGLE_C));

    if (!tripSnap.exists() || !tripSnap.data().members.includes(UID_GOOGLE_C)) {
      throw new Error('Google C non presente nell\'array members del viaggio');
    }
    if (!memberSnap.exists() || memberSnap.data().role !== 'copilota') {
      throw new Error('Doc membro Google C non trovato o ruolo errato');
    }
  });

  console.log('\n--- SCENARIO G: UTENTE POSSIEDE 0000 ED È COPILOTA DI GIAPPONE ---');
  await test('G1: Creazione viaggio master 0000 con owner dedicato', async () => {
    const batch = writeBatch(dbOwner0000);
    batch.set(doc(dbOwner0000, 'trips', TRIP_0000), {
      title: 'Nuova Zelanda Roadbook Master',
      destination: 'Nuova Zelanda',
      ownerUid: UID_OWNER_0000,
      members: [UID_OWNER_0000, UID_GOOGLE_C],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.set(doc(dbOwner0000, 'trips', TRIP_0000, 'members', UID_OWNER_0000), {
      uid: UID_OWNER_0000,
      role: 'owner',
      displayName: '***REMOVED*** (Master 0000)'
    });
    batch.set(doc(dbOwner0000, 'trips', TRIP_0000, 'members', UID_GOOGLE_C), {
      uid: UID_GOOGLE_C,
      role: 'copilota',
      displayName: '***REMOVED*** (Copilota 0000)'
    });
    await assertSucceeds(batch.commit());
  });

  await test('G2: Google C accede a 0000 E a GIAPPONE senza forzature o ritorni automatici a 0000', async () => {
    const snap0000 = await getDoc(doc(dbGoogleC, 'trips', TRIP_0000));
    const snapGiappone = await getDoc(doc(dbGoogleC, 'trips', TRIP_GIAPPONE));

    if (!snap0000.exists()) throw new Error('Impossibile accedere al viaggio 0000');
    if (!snapGiappone.exists()) throw new Error('Impossibile accedere al viaggio GIAPPONE');

    if (snapGiappone.id !== TRIP_GIAPPONE) {
      throw new Error('Atteso viaggio GIAPPONE, restituito altro viaggio');
    }
  });

  console.log('\n--- SCENARIO H: RE-INGRESSO MEMBRO GIÀ AUTORIZZATO SENZA RI-CONSUMARE TOKEN ---');
  await test('H1: Membro già registrato B accede direttamente anche se il token è marcato used', async () => {
    // In OnboardingView, l'app verifica isUserAlreadyMember prima di toccare il token
    const memberDoc = await getDoc(doc(dbCopilotB, 'trips', TRIP_GIAPPONE, 'members', UID_COPILOT_B));
    if (!memberDoc.exists() || memberDoc.data().role !== 'copilota') {
      throw new Error('Membro B non riconosciuto');
    }
    // Accesso diretto al viaggio senza necessità di writeBatch o transazioni
    const tripDoc = await getDoc(doc(dbCopilotB, 'trips', TRIP_GIAPPONE));
    if (!tripDoc.exists()) {
      throw new Error('Accesso a GIAPPONE negato a membro già effettivo');
    }
  });

  console.log('\n--- SCENARIO I: BLOCCO ATTACCANTE E CON UID ARBITRARIO O BYPASS TOKEN ---');
  await test('I1: Attaccante E non può leggere viaggi altrui senza essere membro', async () => {
    await assertFails(getDoc(doc(dbAttackerE, 'trips', TRIP_GIAPPONE)));
    await assertFails(getDoc(doc(dbAttackerE, 'trips', TRIP_0000)));
  });

  await test('I2: Attaccante E non può auto-aggiungersi a members array di GIAPPONE', async () => {
    await assertFails(updateDoc(doc(dbAttackerE, 'trips', TRIP_GIAPPONE), {
      members: arrayUnion(UID_ATTACKER_E)
    }));
  });

  await test('I3: Attaccante E non può creare doc membro senza token valido', async () => {
    await assertFails(setDoc(doc(dbAttackerE, 'trips', TRIP_GIAPPONE, 'members', UID_ATTACKER_E), {
      uid: UID_ATTACKER_E,
      role: 'copilota'
    }));
  });

  console.log('\n--- SCENARIO J: TOKEN SCADUTO, GIÀ USATO E REVOCATO CATEGORICAMENTE RIFIUTATI ---');
  await test('J1: Tentativo di riuso token già used (TOKEN_VALID) viene respinto', async () => {
    const batch = writeBatch(dbAttackerE);
    batch.update(doc(dbAttackerE, 'trips', TRIP_GIAPPONE, 'invites', TOKEN_VALID), {
      status: 'used',
      usedBy: UID_ATTACKER_E
    });
    batch.set(doc(dbAttackerE, 'trips', TRIP_GIAPPONE, 'members', UID_ATTACKER_E), {
      uid: UID_ATTACKER_E,
      role: 'copilota',
      inviteToken: TOKEN_VALID
    });
    batch.update(doc(dbAttackerE, 'trips', TRIP_GIAPPONE), {
      members: arrayUnion(UID_ATTACKER_E)
    });
    await assertFails(batch.commit());
  });

  await test('J2: Token scaduto viene respinto al riscatto', async () => {
    // Setup token scaduto con security rules disabilitate (come avverrebbe dopo il decorso temporale reale)
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const adminDb = adminContext.firestore();
      await setDoc(doc(adminDb, 'trips', TRIP_GIAPPONE, 'invites', TOKEN_EXPIRED), {
        inviteToken: TOKEN_EXPIRED,
        tripId: TRIP_GIAPPONE,
        tripTitle: 'Viaggio in Giappone 2026',
        ownerName: '***REMOVED***',
        role: 'copilota',
        status: 'active',
        createdBy: UID_OWNER_A,
        createdAt: Timestamp.fromMillis(Date.now() - 10000),
        expiresAt: Timestamp.fromMillis(Date.now() - 5000)
      });
    });

    const batch = writeBatch(dbAttackerE);
    batch.update(doc(dbAttackerE, 'trips', TRIP_GIAPPONE, 'invites', TOKEN_EXPIRED), {
      status: 'used',
      usedBy: UID_ATTACKER_E
    });
    batch.set(doc(dbAttackerE, 'trips', TRIP_GIAPPONE, 'members', UID_ATTACKER_E), {
      uid: UID_ATTACKER_E,
      role: 'copilota',
      inviteToken: TOKEN_EXPIRED
    });
    batch.update(doc(dbAttackerE, 'trips', TRIP_GIAPPONE), {
      members: arrayUnion(UID_ATTACKER_E)
    });
    await assertFails(batch.commit());
  });

  await test('J3: Token revocato (status revoked) viene respinto al riscatto', async () => {
    // Owner revoca token attivo
    const inviteRefOwner = doc(dbOwnerA, 'trips', TRIP_GIAPPONE, 'invites', TOKEN_REVOKED);
    await setDoc(inviteRefOwner, {
      inviteToken: TOKEN_REVOKED,
      tripId: TRIP_GIAPPONE,
      tripTitle: 'Viaggio in Giappone 2026',
      ownerName: '***REMOVED***',
      role: 'copilota',
      status: 'active',
      createdBy: UID_OWNER_A,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000)
    });
    await updateDoc(inviteRefOwner, { status: 'revoked' });

    const batch = writeBatch(dbAttackerE);
    batch.update(doc(dbAttackerE, 'trips', TRIP_GIAPPONE, 'invites', TOKEN_REVOKED), {
      status: 'used',
      usedBy: UID_ATTACKER_E
    });
    batch.set(doc(dbAttackerE, 'trips', TRIP_GIAPPONE, 'members', UID_ATTACKER_E), {
      uid: UID_ATTACKER_E,
      role: 'copilota',
      inviteToken: TOKEN_REVOKED
    });
    batch.update(doc(dbAttackerE, 'trips', TRIP_GIAPPONE), {
      members: arrayUnion(UID_ATTACKER_E)
    });
    await assertFails(batch.commit());
  });

  console.log('\n------------------------------------------------------------------------');
  console.log(`ESITO FASE 2: ${passed}/${total} test superati con successo (${Math.round(passed / total * 100)}%)`);
  console.log('------------------------------------------------------------------------');

  await testEnv.cleanup();
}

runPhase2().catch(err => {
  console.error('Fatal in Phase 2:', err);
  process.exit(1);
});
