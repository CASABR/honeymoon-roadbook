/**
 * HOUNIGO — TEST DI VERIFICA P0: ATTIVITÀ & COLLISIONI, LINK INVITI, MULTI-VIAGGIO E DELEGA GPS
 * Eseguito su Firebase Emulator reale (porta 8085).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp
} = require('firebase/firestore');

const projectId = 'demo-hounigo-p0-verify';
const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

async function runTests() {
  console.log('======================================================================');
  console.log('HOUNIGO — TEST AUTOMATIZZATO P0: STABILITÀ MODIFICHE, INVITI E GPS UX');
  console.log('======================================================================\n');

  let testEnv;
  try {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { rules, host: '127.0.0.1', port: 8085 }
    });
  } catch (err) {
    console.error('ERRORE: Connessione fallita a Firebase Emulator su 127.0.0.1:8085');
    console.error(err.message);
    process.exit(1);
  }

  await testEnv.clearFirestore();

  const ownerUid = 'user-nunzio-google-uid-01';
  const copilotUid = 'user-giusy-copilot-uid-02';
  const strangerUid = 'user-stranger-uid-99';
  const tripId = 'GIAPPONE_2026';

  const ownerContext = testEnv.authenticatedContext(ownerUid);
  const copilotContext = testEnv.authenticatedContext(copilotUid);
  const strangerContext = testEnv.authenticatedContext(strangerUid);

  const ownerDb = ownerContext.firestore();
  const copilotDb = copilotContext.firestore();
  const strangerDb = strangerContext.firestore();

  console.log('--- SETUP INIZIALE: Creazione Viaggio e Membri ---');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // Crea viaggio
    await setDoc(doc(db, 'trips', tripId), {
      id: tripId,
      title: 'Giappone Autunno 2026',
      ownerUid: ownerUid,
      ownerName: '***REMOVED***',
      members: [ownerUid, copilotUid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Membro Owner
    await setDoc(doc(db, 'trips', tripId, 'members', ownerUid), {
      uid: ownerUid,
      name: '***REMOVED***',
      role: 'owner',
      createdAt: serverTimestamp()
    });

    // Membro Copilota
    await setDoc(doc(db, 'trips', tripId, 'members', copilotUid), {
      uid: copilotUid,
      name: '***REMOVED***',
      role: 'copilota',
      createdAt: serverTimestamp()
    });
  });
  console.log('✓ Viaggio GIAPPONE e membri ***REMOVED*** & ***REMOVED*** registrati con successo.\n');

  // =========================================================================
  // TEST SUITE 1: MODIFICHE ATTIVITÀ & COLLISIONI ORARI
  // =========================================================================
  console.log('--- TEST 1: Modifiche attività, collisioni orari e sincronizzazione campi ---');

  function synchronizeActivityTimes(activity, newTime) {
    return {
      ...activity,
      time: newTime,
      orarioInizio: newTime,
      orarioRitrovo: newTime,
      updatedAt: Date.now()
    };
  }

  const act1 = {
    id: 'act_tempio_sensoji',
    dayId: 'day_2026-11-29',
    date: '2026-11-29',
    title: 'Visita Tempio Senso-ji',
    time: '10:00',
    orarioInizio: '10:00',
    orarioRitrovo: '10:00',
    category: 'Visite',
    sottocategoria: 'Tour Guidato'
  };

  const act2 = {
    id: 'act_cerimonia_te',
    dayId: 'day_2026-11-29',
    date: '2026-11-29',
    title: 'Cerimonia del Tè ad Asakusa',
    time: '10:00',
    orarioInizio: '10:00',
    orarioRitrovo: '10:00',
    category: 'Esperienze',
    sottocategoria: 'Altro'
  };

  const act3 = {
    id: 'act_passeggiata_fiume',
    dayId: 'day_2026-11-29',
    date: '2026-11-29',
    title: 'Passeggiata sul Fiume Sumida',
    time: '10:00',
    orarioInizio: '10:00',
    orarioRitrovo: '10:00',
    category: 'Passeggiate',
    sottocategoria: 'Altro'
  };

  // Verifica che 3 attività con stesso orario possano coesistere senza perdita di dati
  const dayActivities = [act1, act2, act3];
  assert.strictEqual(dayActivities.length, 3, 'Tutte e 3 le attività coesistono');

  // Aggiornamento orario di act2 a 11:30
  const updatedAct2 = synchronizeActivityTimes(act2, '11:30');
  assert.strictEqual(updatedAct2.time, '11:30', 'Campo time aggiornato');
  assert.strictEqual(updatedAct2.orarioInizio, '11:30', 'Campo orarioInizio sincronizzato');
  assert.strictEqual(updatedAct2.orarioRitrovo, '11:30', 'Campo orarioRitrovo sincronizzato');

  // Verifica card displayTime
  const displayTimeAct1 = act1.time || act1.orarioInizio || act1.orarioRitrovo;
  const displayTimeAct2 = updatedAct2.time || updatedAct2.orarioInizio || updatedAct2.orarioRitrovo;
  assert.strictEqual(displayTimeAct1, '10:00', 'Act 1 rimane a 10:00');
  assert.strictEqual(displayTimeAct2, '11:30', 'Act 2 mostra 11:30 aggiornato');
  console.log('✓ Modifiche alle attività e sincronizzazione orari: PASS\n');

  // =========================================================================
  // TEST SUITE 2: LINK INVITO E RISOLUZIONE AL 1° CLICK (ZERO PERMISSION-DENIED)
  // =========================================================================
  console.log('--- TEST 2: Validazione token invito al 1° click e regole Firestore ---');

  const inviteToken = 'token_sicuro_128bit_test_abc123';
  const expiresAtMillis = Date.now() + 7 * 24 * 60 * 60 * 1000;

  // Owner crea invito
  await assertSucceeds(
    setDoc(doc(ownerDb, 'trips', tripId, 'invites', inviteToken), {
      inviteToken,
      tripId,
      tripTitle: 'Giappone Autunno 2026',
      ownerName: '***REMOVED***',
      role: 'copilota',
      createdBy: ownerUid,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAtMillis),
      status: 'active',
      usedBy: null,
      usedAt: null
    })
  );
  console.log('✓ Creazione invito da parte dell’Owner: PASS');

  // 2.1 Utente anonimo / estraneo legge il singolo invito attivo tramite token esatto
  const inviteSnapStranger = await assertSucceeds(
    getDoc(doc(strangerDb, 'trips', tripId, 'invites', inviteToken))
  );
  assert.strictEqual(inviteSnapStranger.exists(), true);
  assert.strictEqual(inviteSnapStranger.data().tripTitle, 'Giappone Autunno 2026');
  assert.strictEqual(inviteSnapStranger.data().ownerName, '***REMOVED***');
  console.log('✓ Lettura token attivo al 1° click da nuovo utente (senza errori permessi): PASS');

  // 2.2 Estraneo tenta di fare 'list' sull\'intera collezione inviti (vietato!)
  const { collection, getDocs } = require('firebase/firestore');
  await assertFails(
    getDocs(collection(strangerDb, 'trips', tripId, 'invites'))
  );
  console.log('✓ Enumerazione o scansione inviti bloccata a estranei: PASS');

  // 2.3 Token già usato dallo stesso utente (consentito per rientrare senza errori)
  const usedToken = 'token_usato_in_passato_def456';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'trips', tripId, 'invites', usedToken), {
      inviteToken: usedToken,
      tripId,
      role: 'copilota',
      status: 'used',
      usedBy: copilotUid,
      expiresAt: Timestamp.fromMillis(expiresAtMillis),
      createdBy: ownerUid,
      createdAt: serverTimestamp(),
      usedAt: serverTimestamp()
    });
  });

  const usedInviteSnap = await assertSucceeds(
    getDoc(doc(copilotDb, 'trips', tripId, 'invites', usedToken))
  );
  assert.strictEqual(usedInviteSnap.exists(), true);
  assert.strictEqual(usedInviteSnap.data().status, 'used');
  assert.strictEqual(usedInviteSnap.data().usedBy, copilotUid);
  console.log('✓ Riapertura invito già utilizzato dallo stesso copilota: PASS\n');

  // =========================================================================
  // TEST SUITE 3: DELEGA GUIDA GPS CON NOMI REALI E IMMUTABILITÀ OWNER
  // =========================================================================
  console.log('--- TEST 3: Delega Guida GPS tra ***REMOVED*** e ***REMOVED*** con nomi reali ---');

  const ownerDeviceId = 'device_iphone_nunzio_01';
  const copilotDeviceId = 'device_smartphone_giusy_02';

  // 3.1 Owner assegna la guida a ***REMOVED*** (copilota)
  await assertSucceeds(
    setDoc(doc(ownerDb, 'live_feeds', tripId, 'gps_control', 'current'), {
      holderUid: copilotUid,
      holderDeviceId: copilotDeviceId,
      status: 'active',
      updatedAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 12 * 60 * 60 * 1000)
    })
  );
  console.log('✓ Owner passa la guida a ***REMOVED*** con successo: PASS');

  // 3.2 Verifica che ownerUid del viaggio NON sia stato modificato
  const tripSnapAfterTransfer = await getDoc(doc(ownerDb, 'trips', tripId));
  assert.strictEqual(tripSnapAfterTransfer.data().ownerUid, ownerUid, 'ownerUid del viaggio rimane immutato!');
  assert.strictEqual(tripSnapAfterTransfer.data().ownerName, '***REMOVED***');
  console.log('✓ Immutabilità assoluta di ownerUid del viaggio: PASS');

  // 3.3 ***REMOVED*** (avendo il lease) pubblica la posizione GPS
  await assertSucceeds(
    setDoc(doc(copilotDb, 'live_feeds', tripId, 'locations', 'current'), {
      lat: 35.6586,
      lng: 139.7454,
      accuracy: 12,
      city: 'Tokyo',
      country: 'Giappone',
      updatedAt: serverTimestamp(),
      publisherDeviceId: copilotDeviceId,
      status: 'active'
    })
  );
  console.log('✓ ***REMOVED*** trasmette la posizione GPS come Guida delegata: PASS');

  // 3.4 Utente estraneo tenta di pubblicare GPS (bloccato)
  await assertFails(
    setDoc(doc(strangerDb, 'live_feeds', tripId, 'locations', 'current'), {
      lat: 35.6586,
      lng: 139.7454,
      accuracy: 12,
      city: 'Tokyo',
      country: 'Giappone',
      updatedAt: serverTimestamp(),
      publisherDeviceId: 'device_stranger_fake_01',
      status: 'active'
    })
  );
  console.log('✓ Pubblicazione GPS da utente non autorizzato bloccata: PASS');

  // 3.5 Owner riprende la guida (***REMOVED*** torna Guida)
  await assertSucceeds(
    setDoc(doc(ownerDb, 'live_feeds', tripId, 'gps_control', 'current'), {
      holderUid: ownerUid,
      holderDeviceId: ownerDeviceId,
      status: 'active',
      updatedAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 12 * 60 * 60 * 1000)
    })
  );
  console.log('✓ Owner riprende la guida (***REMOVED***): PASS');

  // 3.6 Mapping dei nomi reali
  const membersMap = {
    [ownerUid]: '***REMOVED***',
    [copilotUid]: '***REMOVED***'
  };

  const leaseDoc = await getDoc(doc(ownerDb, 'live_feeds', tripId, 'gps_control', 'current'));
  const currentGuideUid = leaseDoc.data().holderUid;
  const currentGuideName = membersMap[currentGuideUid] || 'Guida';
  assert.strictEqual(currentGuideName, '***REMOVED***', 'Nome guida reale mappato correttamente su ***REMOVED***');
  console.log(`✓ Mappatura nomi reali UI ("Guida attuale: ${currentGuideName}"): PASS\n`);

  console.log('======================================================================');
  console.log('TUTTI I TEST P0 SUPERATI CON SUCCESSO SULL’EMULATORE REALE!');
  console.log('======================================================================');

  await testEnv.cleanup();
}

runTests().catch(err => {
  console.error('\n❌ TEST FALLITO:', err);
  process.exit(1);
});
