const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');
const fs = require('node:fs');
const path = require('node:path');

async function run() {
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-hounigo-live-gps',
    firestore: { rules, host: '127.0.0.1', port: 8085 }
  });

  try {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'trips', 'test-live-gps'), {
        ownerUid: 'owner-test',
        members: ['owner-test', 'copilot-test'],
        title: 'Viaggio test GPS'
      });
      await setDoc(doc(db, 'trips', 'test-live-gps', 'members', 'owner-test'), { uid: 'owner-test', role: 'owner' });
      await setDoc(doc(db, 'trips', 'test-live-gps', 'members', 'copilot-test'), { uid: 'copilot-test', role: 'copilota' });
      await setDoc(doc(db, 'live_feeds', 'test-live-gps'), {
        title: 'Live test', status: 'in_corso', lastUpdateAt: Date.now()
      });
    });

    const owner = testEnv.authenticatedContext('owner-test').firestore();
    const copilot = testEnv.authenticatedContext('copilot-test').firestore();
    const outsider = testEnv.authenticatedContext('outsider-test').firestore();
    const guest = testEnv.unauthenticatedContext().firestore();
    const feed = doc(owner, 'live_feeds', 'test-live-gps');

    await assertSucceeds(getDoc(doc(guest, 'live_feeds', 'test-live-gps')));
    console.log('[PASS] Ospite legge il feed pubblico esistente');

    const gpsPayload = {
      title: 'Live test', status: 'in_corso', lastUpdateAt: Date.now(),
      liveLocation: { lat: 45.1, lng: 9.2, updatedAt: Date.now() }
    };
    await assertFails(setDoc(feed, gpsPayload));
    console.log('[PASS] Rules correnti rifiutano coordinate GPS anche dall owner');

    await assertFails(setDoc(doc(copilot, 'live_feeds', 'test-live-gps'), gpsPayload));
    console.log('[PASS] Rules correnti rifiutano coordinate GPS dal copilota');

    await assertFails(setDoc(doc(outsider, 'live_feeds', 'test-live-gps'), gpsPayload));
    console.log('[PASS] Estraneo non può pubblicare coordinate');

    await assertFails(setDoc(doc(owner, 'live_feeds', 'test-live-gps'), {
      title: 'Live test', status: 'in_corso', lastUpdateAt: Date.now(),
      gpsController: { holderUid: 'owner-test', deviceId: 'device-a', status: 'active' }
    }));
    console.log('[PASS] Rules correnti rifiutano il lease del dispositivo guida');

    await assertFails(setDoc(doc(owner, 'live_feeds', 'test-live-gps'), {
      title: 'Live test', status: 'in_corso', lastUpdateAt: Date.now(), statusMessage: 'Test'
    }));
    console.log('[PASS] Rilevata anche incompatibilità statusMessage con whitelist header corrente');
  } finally {
    await testEnv.cleanup();
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
