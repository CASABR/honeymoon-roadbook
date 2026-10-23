const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch
} = require('firebase/firestore');

const projectId = 'demo-hounigo-collaboration';
const rules = fs.readFileSync(path.join(__dirname, 'firestore.rules'), 'utf8');

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: '127.0.0.1', port: 8085 }
  });

  const owner = testEnv.authenticatedContext('owner-a').firestore();
  const copilot = testEnv.authenticatedContext('copilot-a').firestore();
  const outsider = testEnv.authenticatedContext('outsider').firestore();
  const ownerB = testEnv.authenticatedContext('owner-b').firestore();
  const legacyOwner = testEnv.authenticatedContext('legacy-owner').firestore();
  const legacyCopilot = testEnv.authenticatedContext('legacy-copilot').firestore();
  const historicalUid = testEnv.authenticatedContext('historical-uid').firestore();
  const newUid = testEnv.authenticatedContext('new-google-uid').firestore();
  const admin = testEnv.authenticatedContext('admin-a').firestore();

  try {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'trips', 'trip-a'), {
        ownerUid: 'owner-a', members: ['owner-a', 'copilot-a'], title: 'Trip A'
      });
      await setDoc(doc(db, 'trips', 'trip-a', 'members', 'owner-a'), { uid: 'owner-a', role: 'owner' });
      await setDoc(doc(db, 'trips', 'trip-a', 'members', 'copilot-a'), { uid: 'copilot-a', role: 'copilota' });
      await setDoc(doc(db, 'trips', 'trip-b'), {
        ownerUid: 'owner-b', members: ['owner-b'], title: 'Trip B'
      });
      await setDoc(doc(db, 'trips', 'trip-b', 'members', 'owner-b'), { uid: 'owner-b', role: 'owner' });
      await setDoc(doc(db, 'trips', 'legacy-trip'), {
        ownerUid: 'legacy-owner', members: ['legacy-owner', 'legacy-copilot'], title: 'Legacy trip'
      });
      await setDoc(doc(db, 'trips', 'legacy-uid-trip'), {
        ownerUid: 'historical-uid', members: ['historical-uid'], title: 'Legacy UID trip'
      });
      await setDoc(doc(db, 'system_admins', 'admin-a'), { createdForTest: true });
    });

    await assertSucceeds(setDoc(doc(owner, 'trips', 'trip-a', 'tappe', 'owner-write'), { title: 'Owner write' }));
    await assertSucceeds(setDoc(doc(copilot, 'trips', 'trip-a', 'tappe', 'copilot-write'), { title: 'Copilot write' }));
    await assertFails(getDoc(doc(outsider, 'trips', 'trip-a')));
    await assertFails(getDocs(collection(copilot, 'trips')));
    await assertSucceeds(getDoc(doc(legacyOwner, 'trips', 'legacy-trip')));
    await assertSucceeds(getDoc(doc(legacyCopilot, 'trips', 'legacy-trip')));
    await assertSucceeds(getDoc(doc(historicalUid, 'trips', 'legacy-uid-trip')));
    await assertFails(getDoc(doc(newUid, 'trips', 'legacy-uid-trip')));
    await assertSucceeds(getDocs(collection(admin, 'trips')));
    await assertFails(getDoc(doc(copilot, 'trips', 'trip-b')));
    await assertFails(updateDoc(doc(copilot, 'trips', 'trip-a'), { members: arrayUnion('outsider') }));
    await assertFails(setDoc(doc(copilot, 'trips', 'trip-a', 'members', 'outsider'), { uid: 'outsider', role: 'owner' }));

    const addCopilotBatch = writeBatch(owner);
    addCopilotBatch.update(doc(owner, 'trips', 'trip-a'), { members: arrayUnion('copilot-new') });
    addCopilotBatch.set(doc(owner, 'trips', 'trip-a', 'members', 'copilot-new'), {
      uid: 'copilot-new', role: 'copilota'
    });
    await assertSucceeds(addCopilotBatch.commit());

    const newCopilot = testEnv.authenticatedContext('copilot-new').firestore();
    await assertSucceeds(getDoc(doc(newCopilot, 'trips', 'trip-a')));

    const revokeCopilotBatch = writeBatch(owner);
    revokeCopilotBatch.update(doc(owner, 'trips', 'trip-a'), { members: arrayRemove('copilot-a') });
    revokeCopilotBatch.delete(doc(owner, 'trips', 'trip-a', 'members', 'copilot-a'));
    await assertSucceeds(revokeCopilotBatch.commit());
    await assertFails(getDoc(doc(copilot, 'trips', 'trip-a')));
    await assertFails(setDoc(doc(copilot, 'trips', 'trip-a', 'tappe', 'after-revoke'), { title: 'Denied' }));

    await assertSucceeds(getDoc(doc(ownerB, 'trips', 'trip-b')));
    console.log('Firestore Emulator collaboration rules: 13/13 passed.');
  } finally {
    await testEnv.cleanup();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
