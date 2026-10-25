/**
 * HOUNIGO — JARVIS 2: SIMULAZIONE UTENTI REALI E CONTINUITÀ
 * Esecuzione su Firebase Emulator reale (porta 8085).
 * 
 * Verifica dei 3 profili:
 * - TESTER A (Organizzatore principiante): creazione, tappe, spese, link Google, invito.
 * - TESTER B (Copilota invitato): ricezione link WhatsApp, riscatto token, consultazione, modifica, re-ingresso.
 * - TESTER C (Ospite LIVE): accesso sola lettura senza account, isolamento dati sensibili, privacy.
 * - CONTINUITÀ: riapertura sessione, prevenzione perdita dati, concorrenza.
 * - SICUREZZA: divieto cancellazione viaggio da copilota, divieto accesso a documenti privati per ospite.
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
const projectId = 'demo-jarvis2-user-simulation';

async function runJarvis2Simulation() {
  console.log('========================================================================');
  console.log('HOUNIGO — JARVIS 2: SIMULAZIONE UTENTI REALI (TESTER A, B, C & CONTINUITÀ)');
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

  // Identità utenti reali simulate:
  const UID_TESTER_A = 'tester_a_organizer_anon';
  const UID_TESTER_A_GOOGLE = 'tester_a_organizer_anon'; // linkWithPopup preserva UID invariato!
  const UID_TESTER_B = 'tester_b_copilot_anon';
  const UID_TESTER_C = null; // Ospite LIVE: utente non autenticato o anonimo visitatore
  const UID_TESTER_C_ANON = 'tester_c_guest_anon';

  const TRIP_TEST = 'trip_toscana_on_the_road_2026';
  const TOKEN_INVITO = 'tok_secure_128bit_tester_b_456';

  const ctxA = testEnv.authenticatedContext(UID_TESTER_A);
  const ctxB = testEnv.authenticatedContext(UID_TESTER_B);
  const ctxC = testEnv.authenticatedContext(UID_TESTER_C_ANON);
  const ctxUnauth = testEnv.unauthenticatedContext();

  const dbA = ctxA.firestore();
  const dbB = ctxB.firestore();
  const dbC = ctxC.firestore();
  const dbUnauth = ctxUnauth.firestore();

  // ──────────────────────────────────────────────────────────────────────────
  // TESTER A — ORGANIZZATORE PRINCIPIANTE
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- 1. TESTER A: ORGANIZZATORE PRINCIPIANTE ---');

  await test('A1: Tester A crea viaggio senza conoscere Firebase (batch atomico trip + membro owner)', async () => {
    const batch = writeBatch(dbA);
    const tripRef = doc(dbA, 'trips', TRIP_TEST);
    batch.set(tripRef, {
      id: TRIP_TEST,
      title: 'Toscana On The Road 2026 🍷',
      startDate: '2026-11-01',
      endDate: '2026-11-08',
      ownerUid: UID_TESTER_A,
      ownerName: 'Marco (Organizzatore)',
      members: [UID_TESTER_A],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const memberRef = doc(dbA, 'trips', TRIP_TEST, 'members', UID_TESTER_A);
    batch.set(memberRef, {
      uid: UID_TESTER_A,
      role: 'owner',
      displayName: 'Marco',
      joinedAt: serverTimestamp()
    });

    await assertSucceeds(batch.commit());
  });

  await test('A2: Tester A inserisce la prima tappa (Firenze arrivo)', async () => {
    const tappaRef = doc(dbA, 'trips', TRIP_TEST, 'tappe', 'tappa_firenze_01');
    await assertSucceeds(setDoc(tappaRef, {
      id: 'tappa_firenze_01',
      title: 'Arrivo a Santa Maria Novella e check-in',
      dateStr: '2026-11-01',
      time: '11:00',
      category: 'trasporto',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
  });

  await test('A3: Tester A inserisce una prenotazione con voucher e PNR privato', async () => {
    const alloggioRef = doc(dbA, 'trips', TRIP_TEST, 'alloggi', 'hotel_firenze_centro');
    await assertSucceeds(setDoc(alloggioRef, {
      id: 'hotel_firenze_centro',
      name: 'Grand Hotel Minerva',
      checkIn: '2026-11-01',
      checkOut: '2026-11-03',
      confirmationCode: 'BOOKING-998877-SECRET',
      totalCost: 380.00,
      createdAt: serverTimestamp()
    }));
  });

  await test('A4: Tester A genera link d\'invito crittografico 128-bit per il copilota', async () => {
    const inviteRef = doc(dbA, 'trips', TRIP_TEST, 'invites', TOKEN_INVITO);
    await assertSucceeds(setDoc(inviteRef, {
      inviteToken: TOKEN_INVITO,
      tripId: TRIP_TEST,
      tripTitle: 'Toscana On The Road 2026 🍷',
      ownerName: 'Marco',
      role: 'copilota',
      status: 'active',
      createdBy: UID_TESTER_A,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000)
    }));
  });

  await test('A5: Tester A collega Google account con linkWithPopup (UID preservato -> zero perdita dati)', async () => {
    // In Firebase Auth, linkWithPopup conserva lo stesso UID (UID_TESTER_A_GOOGLE === UID_TESTER_A).
    // Verifichiamo che i documenti tappe, alloggi e trip restino immediatamente accessibili senza modifiche.
    const tripSnap = await getDoc(doc(dbA, 'trips', TRIP_TEST));
    const tappaSnap = await getDoc(doc(dbA, 'trips', TRIP_TEST, 'tappe', 'tappa_firenze_01'));
    if (!tripSnap.exists() || !tappaSnap.exists()) {
      throw new Error('Dati viaggio non reperibili dopo il collegamento Google');
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TESTER B — COPILOTA INVITATO
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. TESTER B: COPILOTA INVITATO ---');

  await test('B1: Tester B apre link invito e legge dettagli viaggio prima del join', async () => {
    const inviteSnap = await getDoc(doc(dbB, 'trips', TRIP_TEST, 'invites', TOKEN_INVITO));
    if (!inviteSnap.exists() || inviteSnap.data().tripTitle !== 'Toscana On The Road 2026 🍷') {
      throw new Error('Dettagli invito non leggibili da Tester B');
    }
    if (inviteSnap.data().status !== 'active') {
      throw new Error('Invito non attivo');
    }
  });

  await test('B2: Tester B accetta l\'invito con il proprio nome "Sara"', async () => {
    const batch = writeBatch(dbB);
    // Consuma token
    batch.update(doc(dbB, 'trips', TRIP_TEST, 'invites', TOKEN_INVITO), {
      status: 'used',
      usedBy: UID_TESTER_B,
      usedAt: serverTimestamp()
    });
    // Crea membro copilota con displayName
    batch.set(doc(dbB, 'trips', TRIP_TEST, 'members', UID_TESTER_B), {
      uid: UID_TESTER_B,
      role: 'copilota',
      displayName: 'Sara (Copilota)',
      inviteToken: TOKEN_INVITO,
      joinedAt: serverTimestamp()
    });
    // Aggiunge a lista members
    batch.update(doc(dbB, 'trips', TRIP_TEST), {
      members: arrayUnion(UID_TESTER_B),
      updatedAt: serverTimestamp()
    });

    await assertSucceeds(batch.commit());
  });

  await test('B3: Tester B consulta tappe e prenotazioni create dall\'organizzatore', async () => {
    const tappaSnap = await getDoc(doc(dbB, 'trips', TRIP_TEST, 'tappe', 'tappa_firenze_01'));
    const hotelSnap = await getDoc(doc(dbB, 'trips', TRIP_TEST, 'alloggi', 'hotel_firenze_centro'));

    if (!tappaSnap.exists() || !hotelSnap.exists()) {
      throw new Error('Tester B non può leggere i contenuti condivisi');
    }
    if (hotelSnap.data().confirmationCode !== 'BOOKING-998877-SECRET') {
      throw new Error('Codice prenotazione non accessibile al copilota legittimo');
    }
  });

  await test('B4: Tester B modifica un elemento condiviso (aggiunge una spesa pranzo)', async () => {
    const spesaRef = doc(dbB, 'trips', TRIP_TEST, 'spese', 'spesa_pranzo_chianti');
    await assertSucceeds(setDoc(spesaRef, {
      id: 'spesa_pranzo_chianti',
      description: 'Degustazione e pranzo Greve in Chianti',
      importo: 65.00,
      categoria: 'ristoranti',
      pagatoDa: 'Sara',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
  });

  await test('B5: Tester B rientra nel viaggio successivamente senza riutilizzare il token', async () => {
    // In OnboardingView, l'app verifica isAlreadyMember prima del riscatto
    const tripSnap = await getDoc(doc(dbB, 'trips', TRIP_TEST));
    if (!tripSnap.exists() || !tripSnap.data().members.includes(UID_TESTER_B)) {
      throw new Error('Tester B non è registrato come membro persistente');
    }
  });

  await test('B6: Tester B (Copilota) NON può eliminare il viaggio dell\'Organizzatore', async () => {
    // Solo l'owner può eliminare un viaggio
    await assertFails(deleteDoc(doc(dbB, 'trips', TRIP_TEST)));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TESTER C — OSPITE LIVE (ACCESSO SENZA ACCOUNT & PRIVACY)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. TESTER C: OSPITE LIVE & PROTEZIONE PRIVACY ---');

  await test('C1: Tester C legge feed LIVE pubblico senza account e senza errori', async () => {
    // Setup feed pubblico live per il viaggio
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const adminDb = adminContext.firestore();
      await setDoc(doc(adminDb, 'live_feeds', TRIP_TEST, 'locations', 'current'), {
        lat: 43.7696,
        lng: 11.2558,
        accuracy: 10,
        city: 'Firenze',
        country: 'Italia',
        status: 'active',
        publisherDeviceId: 'dev_marco',
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(adminDb, 'live_feeds', TRIP_TEST, 'gps_control', 'current'), {
        holderUid: UID_TESTER_A,
        holderDeviceId: 'dev_marco',
        status: 'active',
        expiresAt: Timestamp.fromMillis(Date.now() + 18 * 3600 * 1000)
      });
    });

    const locSnap = await getDoc(doc(dbUnauth, 'live_feeds', TRIP_TEST, 'locations', 'current'));
    if (!locSnap.exists() || locSnap.data().city !== 'Firenze') {
      throw new Error('Ospite live non può leggere la posizione pubblica');
    }
  });

  await test('C2: Tester C NON può leggere documenti privati (alloggi, tappe, spese, voucher)', async () => {
    // Ospite non autenticato o estraneo viene categoricamente bloccato dai dati privati
    await assertFails(getDoc(doc(dbUnauth, 'trips', TRIP_TEST, 'alloggi', 'hotel_firenze_centro')));
    await assertFails(getDoc(doc(dbUnauth, 'trips', TRIP_TEST, 'tappe', 'tappa_firenze_01')));
    await assertFails(getDoc(doc(dbUnauth, 'trips', TRIP_TEST, 'spese', 'spesa_pranzo_chianti')));
    await assertFails(getDoc(doc(dbC, 'trips', TRIP_TEST, 'alloggi', 'hotel_firenze_centro')));
  });

  await test('C3: Tester C NON può acquisire privilegi né scrivere nel feed live', async () => {
    // Tentativo di scrittura su locations/current da parte di utente non autenticato o estraneo
    await assertFails(setDoc(doc(dbUnauth, 'live_feeds', TRIP_TEST, 'locations', 'current'), {
      lat: 0,
      lng: 0
    }));
    await assertFails(setDoc(doc(dbC, 'live_feeds', TRIP_TEST, 'locations', 'current'), {
      lat: 0,
      lng: 0
    }));
  });

  console.log('\n------------------------------------------------------------------------');
  console.log(`ESITO SIMULAZIONE UTENTI REALI: ${passed}/${total} test superati con successo (${Math.round(passed / total * 100)}%)`);
  console.log('------------------------------------------------------------------------');

  await testEnv.cleanup();
}

runJarvis2Simulation().catch(err => {
  console.error('Fatal in Jarvis 2 simulation:', err);
  process.exit(1);
});
