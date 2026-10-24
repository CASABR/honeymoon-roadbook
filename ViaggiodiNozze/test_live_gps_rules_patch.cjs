const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const {
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch
} = require('firebase/firestore');
const fs = require('node:fs');
const path = require('node:path');

const tripId = 'test-live-gps-rules';
const ownerUid = 'owner-gps-test';
const copilotUid = 'copilot-gps-test';
const viewerUid = 'viewer-gps-test';
const outsiderUid = 'outsider-gps-test';
const ownerDevice = 'owner-device-0001';
const copilotDevice = 'copilot-device-01';

function lease(holderUid, holderDeviceId, status = 'active', expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000)) {
  return { holderUid, holderDeviceId, status, updatedAt: serverTimestamp(), expiresAt };
}

function location(publisherDeviceId, status = 'active') {
  return {
    lat: 45.4642,
    lng: 9.19,
    accuracy: 12,
    city: 'Milano',
    country: 'Italia',
    updatedAt: serverTimestamp(),
    publisherDeviceId,
    status
  };
}

async function expectSuccess(label, promise) {
  await assertSucceeds(promise);
  console.log(`[PASS] ${label}`);
}

async function expectFailure(label, promise) {
  await assertFails(promise);
  console.log(`[PASS] ${label}`);
}

async function run() {
  const rulesPath = process.env.RULES_FILE
    ? path.resolve(process.env.RULES_FILE)
    : path.join(__dirname, '..', 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId: `demo-hounigo-live-gps-${path.basename(path.dirname(rulesPath)).toLowerCase()}`,
    firestore: { rules, host: '127.0.0.1', port: 8085 }
  });

  try {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'trips', tripId), {
        ownerUid,
        members: [ownerUid, copilotUid, viewerUid],
        title: 'Viaggio test GPS'
      });
      await setDoc(doc(db, 'trips', tripId, 'members', ownerUid), { uid: ownerUid, role: 'owner' });
      await setDoc(doc(db, 'trips', tripId, 'members', copilotUid), { uid: copilotUid, role: 'copilota' });
      await setDoc(doc(db, 'trips', tripId, 'members', viewerUid), { uid: viewerUid, role: 'viewer' });
      await setDoc(doc(db, 'live_feeds', tripId), { title: 'Live test', status: 'in_corso' });
      await setDoc(doc(db, 'trips', tripId, 'documenti', 'private'), { secret: 'documento' });
      await setDoc(doc(db, 'trips', tripId, 'spese', 'private'), { secret: 'spesa' });
    });

    const owner = testEnv.authenticatedContext(ownerUid).firestore();
    const copilot = testEnv.authenticatedContext(copilotUid).firestore();
    const viewer = testEnv.authenticatedContext(viewerUid).firestore();
    const outsider = testEnv.authenticatedContext(outsiderUid).firestore();
    const guest = testEnv.unauthenticatedContext().firestore();
    const ownerLease = doc(owner, 'live_feeds', tripId, 'gps_control', 'current');
    const ownerLocation = doc(owner, 'live_feeds', tripId, 'locations', 'current');

    await expectFailure('Viewer non crea il lease', setDoc(doc(viewer, 'live_feeds', tripId, 'gps_control', 'current'), lease(viewerUid, 'viewer-device-001')));
    await expectFailure('Estraneo non crea il lease', setDoc(doc(outsider, 'live_feeds', tripId, 'gps_control', 'current'), lease(outsiderUid, 'outside-device-01')));
    await expectFailure('Copilota non assegna autonomamente il lease', setDoc(doc(copilot, 'live_feeds', tripId, 'gps_control', 'current'), lease(copilotUid, copilotDevice)));
    await expectFailure('Owner non assegna il lease a un utente non autorizzato', setDoc(ownerLease, lease(outsiderUid, 'outside-device-01')));
    await expectSuccess('Owner attiva il proprio lease', setDoc(ownerLease, lease(ownerUid, ownerDevice)));
    await expectFailure('Viewer non legge il controllo privato GPS', getDoc(doc(viewer, 'live_feeds', tripId, 'gps_control', 'current')));
    await expectSuccess('Copilota membro legge il controllo GPS', getDoc(doc(copilot, 'live_feeds', tripId, 'gps_control', 'current')));

    await expectFailure('Dispositivo errato non pubblica coordinate', setDoc(ownerLocation, location('owner-device-wrong')));
    await expectFailure('Viewer non pubblica coordinate', setDoc(doc(viewer, 'live_feeds', tripId, 'locations', 'current'), location(ownerDevice)));
    await expectFailure('Estraneo non pubblica coordinate', setDoc(doc(outsider, 'live_feeds', tripId, 'locations', 'current'), location(ownerDevice)));
    await expectFailure('Ospite non pubblica coordinate', setDoc(doc(guest, 'live_feeds', tripId, 'locations', 'current'), location(ownerDevice)));
    await expectSuccess('Dispositivo guida pubblica la posizione', setDoc(ownerLocation, location(ownerDevice)));
    await expectFailure('Throttle rifiuta una seconda posizione immediata', setDoc(ownerLocation, { ...location(ownerDevice), lat: 45.5 }));
    await expectFailure('Schema pubblico rifiuta campi privati', setDoc(ownerLocation, { ...location(ownerDevice), privateNote: 'segreto' }));
    await expectSuccess('Ospite legge la sola posizione pubblica', getDoc(doc(guest, 'live_feeds', tripId, 'locations', 'current')));
    await expectSuccess('Viewer legge la posizione mentre la lease è attiva', getDoc(doc(viewer, 'live_feeds', tripId, 'locations', 'current')));
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'live_feeds', tripId, 'locations', 'current'), {
        ...location(ownerDevice),
        updatedAt: Timestamp.fromMillis(Date.now() - 3 * 60_000)
      });
    });
    await expectFailure('Ospite non legge una posizione offline obsoleta', getDoc(doc(guest, 'live_feeds', tripId, 'locations', 'current')));
    await expectFailure('Viewer non legge una posizione offline obsoleta', getDoc(doc(viewer, 'live_feeds', tripId, 'locations', 'current')));
    await expectSuccess('Owner conserva accesso alla posizione offline per gestione', getDoc(ownerLocation));
    await expectSuccess('Device guida ripristina una posizione pubblica aggiornata', setDoc(ownerLocation, location(ownerDevice)));
    await expectFailure('Ospite non legge documenti privati', getDoc(doc(guest, 'trips', tripId, 'documenti', 'private')));
    await expectFailure('Ospite non legge spese private', getDoc(doc(guest, 'trips', tripId, 'spese', 'private')));

    const copilotExpiry = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
    await expectSuccess('Owner trasferisce il lease al copilota', setDoc(ownerLease, lease(copilotUid, copilotDevice, 'active', copilotExpiry)));
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'live_feeds', tripId, 'locations', 'current'), {
        ...location(copilotDevice),
        updatedAt: Timestamp.fromMillis(Date.now() - 20_000)
      });
    });
    await expectFailure('Vecchio dispositivo perde immediatamente la guida', setDoc(ownerLocation, location(ownerDevice)));
    await expectSuccess('Copilota autorizzato pubblica dal device assegnato', setDoc(doc(copilot, 'live_feeds', tripId, 'locations', 'current'), location(copilotDevice)));
    const tripAfterTransfer = await getDoc(doc(owner, 'trips', tripId));
    if (tripAfterTransfer.data().ownerUid !== ownerUid) throw new Error('Il passaggio GPS ha modificato ownerUid');
    console.log('[PASS] Il passaggio guida non modifica ownerUid');

    const ownerRevokeExpiry = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
    await expectSuccess('Owner revoca la guida trasferendo il lease', setDoc(ownerLease, lease(ownerUid, ownerDevice, 'active', ownerRevokeExpiry)));
    await expectFailure('Ospite non legge la posizione del device revocato', getDoc(doc(guest, 'live_feeds', tripId, 'locations', 'current')));
    await expectFailure('Viewer non legge la posizione del device revocato', getDoc(doc(viewer, 'live_feeds', tripId, 'locations', 'current')));
    await expectFailure('Device revocato non pubblica in concorrenza', setDoc(doc(copilot, 'live_feeds', tripId, 'locations', 'current'), location(copilotDevice)));
    await expectSuccess('Owner riassegna la guida al copilota', setDoc(ownerLease, lease(copilotUid, copilotDevice, 'active', copilotExpiry)));

    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'live_feeds', tripId, 'locations', 'current'), {
        ...location(copilotDevice),
        updatedAt: Timestamp.fromMillis(Date.now() - 20_000)
      });
    });
    const pauseBatch = writeBatch(copilot);
    pauseBatch.set(doc(copilot, 'live_feeds', tripId, 'gps_control', 'current'), lease(copilotUid, copilotDevice, 'paused', copilotExpiry));
    pauseBatch.update(doc(copilot, 'live_feeds', tripId, 'locations', 'current'), { status: 'paused', updatedAt: serverTimestamp() });
    await expectSuccess('Copilota titolare sospende atomicamente la condivisione', pauseBatch.commit());
    await expectFailure('Lease sospeso blocca nuove coordinate', setDoc(doc(copilot, 'live_feeds', tripId, 'locations', 'current'), location(copilotDevice)));
    await expectFailure('Ospite non legge coordinate sospese', getDoc(doc(guest, 'live_feeds', tripId, 'locations', 'current')));
    await expectFailure('Viewer non legge coordinate sospese', getDoc(doc(viewer, 'live_feeds', tripId, 'locations', 'current')));
    await expectSuccess('Owner può verificare l ultimo punto sospeso', getDoc(ownerLocation));
    await expectSuccess('Copilota autorizzato può verificare l ultimo punto sospeso', getDoc(doc(copilot, 'live_feeds', tripId, 'locations', 'current')));
    await expectFailure('Copilota non riattiva autonomamente un lease sospeso', setDoc(doc(copilot, 'live_feeds', tripId, 'gps_control', 'current'), lease(copilotUid, copilotDevice, 'active')));

    const renewedExpiry = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
    await expectSuccess('Owner riattiva il lease del copilota', setDoc(ownerLease, lease(copilotUid, copilotDevice, 'active', renewedExpiry)));
    const stopBatch = writeBatch(copilot);
    stopBatch.set(doc(copilot, 'live_feeds', tripId, 'gps_control', 'current'), lease(copilotUid, copilotDevice, 'stopped', renewedExpiry));
    stopBatch.update(doc(copilot, 'live_feeds', tripId, 'locations', 'current'), { status: 'stopped', updatedAt: serverTimestamp() });
    await expectSuccess('Copilota titolare arresta atomicamente la condivisione', stopBatch.commit());
    await expectFailure('Lease arrestato blocca nuove coordinate', setDoc(doc(copilot, 'live_feeds', tripId, 'locations', 'current'), location(copilotDevice)));
    await expectFailure('Ospite non legge coordinate dopo l arresto', getDoc(doc(guest, 'live_feeds', tripId, 'locations', 'current')));
    await expectFailure('Viewer non legge coordinate dopo l arresto', getDoc(doc(viewer, 'live_feeds', tripId, 'locations', 'current')));
    await expectSuccess('Owner conserva accesso operativo dopo l arresto', getDoc(ownerLocation));

    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'live_feeds', tripId, 'gps_control', 'current'), {
        holderUid: copilotUid,
        holderDeviceId: copilotDevice,
        status: 'active',
        updatedAt: Timestamp.fromMillis(Date.now() - 120_000),
        expiresAt: Timestamp.fromMillis(Date.now() - 60_000)
      });
    });
    await expectFailure('Lease scaduto non autorizza nuove coordinate', setDoc(doc(copilot, 'live_feeds', tripId, 'locations', 'current'), location(copilotDevice)));
    await expectFailure('Ospite non legge coordinate con lease scaduto', getDoc(doc(guest, 'live_feeds', tripId, 'locations', 'current')));
    await expectFailure('Viewer non legge coordinate con lease scaduto', getDoc(doc(viewer, 'live_feeds', tripId, 'locations', 'current')));
    await expectSuccess('Copilota autorizzato legge il punto scaduto per gestione', getDoc(doc(copilot, 'live_feeds', tripId, 'locations', 'current')));
    await expectFailure('Documenti GPS diversi da current restano inaccessibili', setDoc(doc(owner, 'live_feeds', tripId, 'locations', 'history'), location(ownerDevice)));

    console.log(`[PASS] Suite completata con ${path.relative(process.cwd(), rulesPath)}`);
  } finally {
    await testEnv.cleanup();
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
