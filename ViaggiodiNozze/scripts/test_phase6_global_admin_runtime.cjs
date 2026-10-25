/**
 * HOUNIGO — TEST FASE 6: CONSOLE ADMIN GLOBALE & PRIVILEGI FIRESTORE RUNTIME
 * Convalida su Firebase Emulator reale (porta 8085).
 * 
 * Scenari testati:
 * 1. Utente normale non può leggere tutti i viaggi (getDocs su /trips).
 * 2. Un owner di viaggio non diventa automaticamente admin globale.
 * 3. Il client non può creare o modificare autonomamente documenti /system_admins.
 * 4. Il client non può leggere direttamente /system_admins (allow read, write: if false).
 * 5. Amministratore autorizzato (presente in /system_admins) può scansionare /trips.
 * 6. Amministratore autorizzato può leggere metadati utenti in /users.
 * 7. Revoca privilegi: la rimozione del doc da /system_admins revoca istantaneamente l'accesso a /trips.
 */

const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs
} = require('firebase/firestore');

const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const projectId = 'demo-phase6-global-admin';

async function runPhase6() {
  console.log('========================================================================');
  console.log('HOUNIGO — FASE 6: ADMIN GLOBALE, WHITELIST SYSTEM_ADMINS E RUNTIME RULES');
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

  const UID_NORMAL = 'user_normal_777';
  const UID_OWNER = 'trip_owner_888';
  const UID_ADMIN = 'authorized_admin_999';

  const normalCtx = testEnv.authenticatedContext(UID_NORMAL);
  const ownerCtx = testEnv.authenticatedContext(UID_OWNER);
  const adminCtx = testEnv.authenticatedContext(UID_ADMIN);

  const dbNormal = normalCtx.firestore();
  const dbOwner = ownerCtx.firestore();
  const dbAdmin = adminCtx.firestore();

  // Setup dati iniziali
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'trips', 'trip_sample_01'), {
      title: 'Viaggio Alpha',
      ownerUid: UID_OWNER,
      members: [UID_OWNER]
    });
    await setDoc(doc(adminDb, 'trips', 'trip_sample_02'), {
      title: 'Viaggio Beta',
      ownerUid: 'another_owner',
      members: ['another_owner']
    });
    await setDoc(doc(adminDb, 'users', UID_NORMAL), {
      email: 'normal@test.com',
      displayName: 'Normal User'
    });
  });

  console.log('--- 1. BLOCCO UTENTE NORMALE ---');
  await test('1. Utente normale non può eseguire list (/trips)', async () => {
    await assertFails(getDocs(collection(dbNormal, 'trips')));
  });

  console.log('\n--- 2. BLOCCO PROPRIETARIO DI SINGOLO VIAGGIO ---');
  await test('2. Owner di viaggio locale non può eseguire list (/trips)', async () => {
    // Può leggere il proprio viaggio con getDoc
    await assertSucceeds(getDoc(doc(dbOwner, 'trips', 'trip_sample_01')));
    // Ma non può scansionare la collezione globale
    await assertFails(getDocs(collection(dbOwner, 'trips')));
  });

  console.log('\n--- 3. PROTEZIONE COLLEZIONE SYSTEM_ADMINS ---');
  await test('3.1: Client normale non può creare doc in /system_admins', async () => {
    await assertFails(setDoc(doc(dbNormal, 'system_admins', UID_NORMAL), { enabled: true }));
  });

  await test('3.2: Client normale non può leggere /system_admins', async () => {
    await assertFails(getDoc(doc(dbNormal, 'system_admins', UID_NORMAL)));
  });

  console.log('\n--- 4. AMMINISTRATORE AUTORIZZATO ---');
  // Abilitazione admin via backend (simulazione Firestore Console manuale)
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'system_admins', UID_ADMIN), {
      enabled: true,
      role: 'superadmin',
      addedAt: new Date()
    });
  });

  await test('4.1: Amministratore in whitelist system_admins esegue scansione /trips con successo', async () => {
    const snap = await assertSucceeds(getDocs(collection(dbAdmin, 'trips')));
    if (snap.docs.length < 2) {
      throw new Error(`Attesi almeno 2 viaggi, trovati ${snap.docs.length}`);
    }
  });

  await test('4.2: Amministratore in whitelist system_admins può leggere /users altrui', async () => {
    const userSnap = await assertSucceeds(getDoc(doc(dbAdmin, 'users', UID_NORMAL)));
    if (!userSnap.exists() || userSnap.data().email !== 'normal@test.com') {
      throw new Error('Dati utente non letti correttamente');
    }
  });

  console.log('\n--- 5. REVOCA PRIVILEGI ---');
  await test('5. Rimozione documento /system_admins/{uid} revoca istantaneamente i privilegi', async () => {
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const adminDb = adminContext.firestore();
      await deleteDoc(doc(adminDb, 'system_admins', UID_ADMIN));
    });

    // Subito dopo la rimozione, la query /trips deve fallire categoricamente
    await assertFails(getDocs(collection(dbAdmin, 'trips')));
  });

  console.log('\n------------------------------------------------------------------------');
  console.log(`ESITO FASE 6: ${passed}/${total} test superati con successo (${Math.round(passed / total * 100)}%)`);
  console.log('------------------------------------------------------------------------');

  await testEnv.cleanup();
}

runPhase6().catch(err => {
  console.error('Fatal in Phase 6:', err);
  process.exit(1);
});
