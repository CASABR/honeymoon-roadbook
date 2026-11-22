const assert = require('node:assert/strict');
const { initializeApp } = require('firebase/app');
const {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore,
  limit, orderBy, query, where
} = require('firebase/firestore');

const projectId = 'demo-hounigo-live-photos';
const emuBase = `http://127.0.0.1:8085/v1/projects/${projectId}/databases/(default)/documents`;

async function seedDoc(docPath, fields) {
  const res = await fetch(`${emuBase}/${docPath}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  assert.equal(res.ok, true, `Seed failed for ${docPath}: ${res.status} ${await res.text()}`);
}

async function expectDenied(promise, label) {
  let denied = false;
  try {
    await promise;
  } catch (err) {
    if (String(err?.code || err?.message).includes('permission-denied') || String(err?.message).includes('PERMISSION_DENIED')) {
      denied = true;
    } else {
      throw err;
    }
  }
  assert.equal(denied, true, `Expected permission-denied for ${label}`);
}

(async () => {
  // 1. Seed synthetic trip + private docs + Owner-published v2 LIVE photo update
  await seedDoc('trips/synth-live-photos', {
    title: { stringValue: 'Viaggio Sintetico' },
    ownerUid: { stringValue: 'owner-synth' },
    ownerId: { stringValue: 'owner-synth' }
  });
  await seedDoc('trips/synth-live-photos/private_credentials/priv_1', {
    secret: { stringValue: 'PNR-SECRET-123' }
  });
  await seedDoc('trips/synth-live-photos/documenti/doc_1', {
    title: { stringValue: 'Passaporto' }
  });
  await seedDoc('trips/synth-live-photos/alloggi/all_1', {
    name: { stringValue: 'Hotel Privato' }
  });
  await seedDoc('live_feeds/synth-live-photos', {
    title: { stringValue: 'Viaggio Sintetico' },
    status: { stringValue: 'in_corso' },
    lastUpdateAt: { integerValue: String(Date.now()) }
  });

  const photoUrl = `https://hounigo-ai.nunzio114.workers.dev/v1/live-photos/synth-live-photos/${'a'.repeat(48)}`;
  await seedDoc('live_feeds/synth-live-photos/updates/post-1', {
    title: { stringValue: 'Scatto pubblico sintetico' },
    text: { stringValue: '' },
    photoUrl: { stringValue: photoUrl },
    publicSchemaVersion: { integerValue: '2' },
    timestamp: { integerValue: String(Date.now()) },
    reactionCounts: {
      mapValue: {
        fields: {
          '❤️': { integerValue: '0' },
          '😍': { integerValue: '0' },
          '😂': { integerValue: '0' },
          '👋': { integerValue: '0' }
        }
      }
    }
  });
  console.log('PASS 1: Seeded synthetic trip + Owner v2 LIVE photo update');

  // 2. True unauthenticated External Guest via real Firebase Web SDK (no auth, no Owner privileges)
  const app = initializeApp({ apiKey: 'demo-key', projectId }, 'guest-app');
  const guestDb = getFirestore(app);
  connectFirestoreEmulator(guestDb, '127.0.0.1', 8085);

  const headerSnap = await getDoc(doc(guestDb, 'live_feeds/synth-live-photos'));
  assert.equal(headerSnap.exists(), true);

  const v2Query = query(
    collection(guestDb, 'live_feeds/synth-live-photos/updates'),
    where('publicSchemaVersion', '==', 2),
    orderBy('timestamp', 'desc'),
    limit(50)
  );
  const snap = await getDocs(v2Query);
  assert.equal(snap.size, 1);
  assert.equal(snap.docs[0].data().photoUrl, photoUrl);
  console.log('PASS 2: Unauthenticated external guest read published LIVE photo URL without Owner privileges');

  // 3. Guest must be denied private collections & unscoped list
  await expectDenied(getDocs(query(collection(guestDb, 'live_feeds/synth-live-photos/updates'), orderBy('timestamp', 'desc'), limit(50))), 'unscoped updates');
  await expectDenied(getDoc(doc(guestDb, 'trips/synth-live-photos')), 'trips root');
  await expectDenied(getDoc(doc(guestDb, 'trips/synth-live-photos/private_credentials/priv_1')), 'private_credentials');
  await expectDenied(getDoc(doc(guestDb, 'trips/synth-live-photos/documenti/doc_1')), 'documenti');
  await expectDenied(getDoc(doc(guestDb, 'trips/synth-live-photos/alloggi/all_1')), 'alloggi');
  console.log('PASS 3: External guest denied access to trips, private_credentials, documenti, alloggi, and unscoped updates');
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
