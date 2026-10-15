const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function inspectTrips() {
  console.log('--- Inspecting Trips Collection ---');
  const tripsSnapshot = await db.collection('trips').get();
  
  if (tripsSnapshot.empty) {
    console.log('No trips found.');
  } else {
    tripsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`- Trip ID: ${doc.id}`);
      console.log(`  Name: ${data.name}`);
      console.log(`  OwnerUid: ${data.ownerUid}`);
      console.log(`  Members:`, data.members);
      console.log('-------------------------');
    });
  }

  console.log('\n--- Inspecting Trip 0000 ---');
  const trip0000Ref = db.collection('trips').doc('0000');
  const trip0000Snap = await trip0000Ref.get();
  
  if (trip0000Snap.exists) {
    console.log('Trip 0000 data:', JSON.stringify(trip0000Snap.data(), null, 2));
  } else {
    console.log('Trip 0000 does NOT exist.');
  }

  console.log('\n--- Inspecting Invite Tokens ---');
  const tokensSnapshot = await db.collection('invite_tokens').get();
  console.log(`Found ${tokensSnapshot.size} invite_tokens in root collection.`);
  
  const tokenGroupSnapshot = await db.collectionGroup('invite_tokens').get();
  console.log(`Found ${tokenGroupSnapshot.size} invite_tokens via collectionGroup query.`);

  console.log('Done.');
}

inspectTrips().catch(console.error).finally(() => process.exit(0));
