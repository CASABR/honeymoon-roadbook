const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const fs = require('fs');

async function testConcurrentRollback() {
  console.log('=== TEST EMULATOR: ROLLBACK CON MODIFICHE CONCORRENTI ===');
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId: 'test-concurrent-rollback',
    firestore: { rules, host: '127.0.0.1', port: 8085 }
  });

  const OLD_OWNER = 'I6kLe9WKpXQp0IrHlxxCXEjTOMq2';
  const NEW_OWNER = 'cqs2OcE7WzY7XmiqVoZmM7B6Fpp2';

  // 1. Setup iniziale
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'trips', '0000'), {
      id: '0000',
      ownerUid: OLD_OWNER,
      members: [OLD_OWNER]
    });
    await setDoc(doc(db, 'trips', '0000', 'alloggi', 'hotel_01'), {
      nome: 'Hotel Originale'
    });
  });

  // 2. Migrazione a NEW_OWNER
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await updateDoc(doc(db, 'trips', '0000'), {
      ownerUid: NEW_OWNER,
      members: [NEW_OWNER, OLD_OWNER]
    });
    await setDoc(doc(db, 'trips', '0000', 'members', NEW_OWNER), {
      uid: NEW_OWNER,
      role: 'owner'
    });
    await setDoc(doc(db, 'trips', '0000', 'members', OLD_OWNER), {
      uid: OLD_OWNER,
      role: 'copilota'
    });
  });

  // 3. Modifiche concorrenti post-migrazione (da newOwner e copilota)
  const newOwnerDb = testEnv.authenticatedContext(NEW_OWNER).firestore();
  await assertSucceeds(setDoc(doc(newOwnerDb, 'trips', '0000', 'spese', 'nuova_spesa_100'), {
    importo: 100,
    descrizione: 'Treno Shinkansen'
  }));
  await assertSucceeds(updateDoc(doc(newOwnerDb, 'trips', '0000', 'alloggi', 'hotel_01'), {
    checkIn: '15:00'
  }));

  // 4. Esecuzione Rollback mirato
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Il rollback ripristina SOLO ownerUid e i ruoli in members, SENZA sovrascrivere o eliminare collezioni
    await updateDoc(doc(db, 'trips', '0000'), {
      ownerUid: OLD_OWNER,
      members: [OLD_OWNER, NEW_OWNER]
    });
    await updateDoc(doc(db, 'trips', '0000', 'members', NEW_OWNER), {
      role: 'copilota'
    });
    await updateDoc(doc(db, 'trips', '0000', 'members', OLD_OWNER), {
      role: 'owner'
    });
  });

  // 5. Verifica integrità post-rollback
  const oldOwnerDb = testEnv.authenticatedContext(OLD_OWNER).firestore();
  const tripSnap = await getDoc(doc(oldOwnerDb, 'trips', '0000'));
  console.log('- Trip ownerUid dopo rollback:', tripSnap.data().ownerUid === OLD_OWNER ? 'OLD_OWNER (OK)' : 'FAIL');

  const spesaSnap = await getDoc(doc(oldOwnerDb, 'trips', '0000', 'spese', 'nuova_spesa_100'));
  console.log('- Spesa creata post-migrazione conservata:', spesaSnap.exists() ? 'CONSERVATA (OK)' : 'PERSA (FAIL)');

  const hotelSnap = await getDoc(doc(oldOwnerDb, 'trips', '0000', 'alloggi', 'hotel_01'));
  console.log('- Modifica hotel conservata:', hotelSnap.data().checkIn === '15:00' ? 'CONSERVATA (OK)' : 'PERSA (FAIL)');

  await testEnv.cleanup();
  console.log('=== ESITO TEST CONCORRENTE: SUPERATO ===');
}

testConcurrentRollback().catch(console.error);
