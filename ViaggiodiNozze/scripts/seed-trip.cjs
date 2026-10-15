const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function seedTrip() {
  const tripRef = db.collection('trips').doc('0000');
  
  await tripRef.set({
    id: '0000',
    inviteCode: '0000',
    title: 'Viaggio Originale',
    startDate: '2026-11-28',
    endDate: '2027-01-10',
    totalDays: 44,
    members: [], // Members start empty until someone joins/claims owner
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  console.log('Trip 0000 seeded successfully on Firestore.');
}

seedTrip().catch(console.error).finally(() => process.exit(0));
