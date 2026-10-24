const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, collection, addDoc } = require('firebase/firestore');
const fs = require('fs');

async function runEmulatorMigrationTest() {
  console.log('=================================================================');
  console.log('   SIMULAZIONE TRASFERIMENTO PROPRIETÀ 0000 SU FIRESTORE EMULATOR');
  console.log('=================================================================');

  const rules = fs.readFileSync('firestore.rules', 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId: 'test-transfer-0000',
    firestore: {
      rules: rules,
      host: '127.0.0.1',
      port: 8085
    }
  });

  const OLD_ANON_OWNER = 'I6kLe9WKpXQp0IrHlxxCXEjTOMq2';
  const NEW_PERM_OWNER = 'cqs2OcE7WzY7XmiqVoZmM7B6Fpp2';
  const COPILOT_UID = 'XfKJIX3jT2d7B8dwevKOwwWNG0q1';
  const OUTSIDER_UID = 'stranger_uid_999';

  const oldOwnerDb = testEnv.authenticatedContext(OLD_ANON_OWNER).firestore();
  const newOwnerDb = testEnv.authenticatedContext(NEW_PERM_OWNER).firestore();
  const copilotDb = testEnv.authenticatedContext(COPILOT_UID).firestore();
  const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore();

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`[PASS ${total.toString().padStart(2, '0')}] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL ${total.toString().padStart(2, '0')}] ${name}:`, err.message);
    }
  }

  // 1. Setup stato iniziale con dati sintetici tramite withSecurityRulesDisabled (Admin context)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    // Documento principale 0000 con vecchio owner anonimo
    await setDoc(doc(adminDb, 'trips', '0000'), {
      id: '0000',
      title: 'Viaggio Originale 0000',
      ownerUid: OLD_ANON_OWNER,
      ownerName: 'nunzio_anon',
      members: [OLD_ANON_OWNER, COPILOT_UID]
    });
    // Copilota nella sottocollezione
    await setDoc(doc(adminDb, 'trips', '0000', 'members', COPILOT_UID), {
      uid: COPILOT_UID,
      role: 'copilota'
    });
    // Sottocollezione tappe preesistente
    await setDoc(doc(adminDb, 'trips', '0000', 'tappe', 'tappa_01'), {
      title: 'Tokyo Arrival',
      giorno: 1
    });
  });

  // TEST 1: Verifica stato iniziale
  await test('1.1 Vecchio Owner anonimo accede e legge 0000 e tappe', async () => {
    await assertSucceeds(getDoc(doc(oldOwnerDb, 'trips', '0000')));
    await assertSucceeds(getDoc(doc(oldOwnerDb, 'trips', '0000', 'tappe', 'tappa_01')));
  });

  await test('1.2 Copilota accede e legge 0000 e tappe', async () => {
    await assertSucceeds(getDoc(doc(copilotDb, 'trips', '0000')));
    await assertSucceeds(getDoc(doc(copilotDb, 'trips', '0000', 'tappe', 'tappa_01')));
  });

  await test('1.3 Nuovo Owner (non ancora migrato) NON ha accesso a 0000', async () => {
    await assertFails(getDoc(doc(newOwnerDb, 'trips', '0000')));
  });

  await test('1.4 Client non può scalare i privilegi modificando direttamente ownerUid su /trips/0000', async () => {
    await assertFails(updateDoc(doc(oldOwnerDb, 'trips', '0000'), {
      ownerUid: NEW_PERM_OWNER
    }));
  });

  // 2. Esecuzione procedura amministrativa una tantum con verifica precondizione
  await test('2.1 Procedura di migrazione verifica precondizione e trasferisce ownership', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      const snap = await getDoc(doc(adminDb, 'trips', '0000'));
      if (snap.data().ownerUid !== OLD_ANON_OWNER) {
        throw new Error('PRECONDIZIONE FALLITA: ownerUid remoto non corrisponde all\'originale.');
      }
      // Aggiornamento atomico
      await updateDoc(doc(adminDb, 'trips', '0000'), {
        ownerUid: NEW_PERM_OWNER,
        ownerName: 'nunzio',
        ownerEmail: 'nunzio114@gmail.com',
        members: [NEW_PERM_OWNER, OLD_ANON_OWNER, COPILOT_UID]
      });
      // Registrazione nuovo owner nella sottocollezione
      await setDoc(doc(adminDb, 'trips', '0000', 'members', NEW_PERM_OWNER), {
        uid: NEW_PERM_OWNER,
        role: 'owner',
        email: 'nunzio114@gmail.com'
      });
    });
  });

  // TEST 3: Verifica post-migrazione
  await test('3.1 Nuovo Owner permanente ha pieno accesso Owner a 0000', async () => {
    await assertSucceeds(getDoc(doc(newOwnerDb, 'trips', '0000')));
    // Può creare nuove sottocollezioni / elementi
    await assertSucceeds(setDoc(doc(newOwnerDb, 'trips', '0000', 'spese', 'spesa_post_migrazione'), {
      descrizione: 'Cena Tokyo',
      importo: 50
    }));
  });

  await test('3.2 Copilota mantiene inalterato accesso e integrità sottocollezioni', async () => {
    await assertSucceeds(getDoc(doc(copilotDb, 'trips', '0000')));
    await assertSucceeds(getDoc(doc(copilotDb, 'trips', '0000', 'tappe', 'tappa_01')));
    await assertSucceeds(getDoc(doc(copilotDb, 'trips', '0000', 'spese', 'spesa_post_migrazione')));
  });

  await test('3.3 Vecchio account anonimo rimane membro e non viene estromesso', async () => {
    await assertSucceeds(getDoc(doc(oldOwnerDb, 'trips', '0000')));
    await assertSucceeds(getDoc(doc(oldOwnerDb, 'trips', '0000', 'tappe', 'tappa_01')));
  });

  await test('3.4 Estraneo continua a essere totalmente respinto', async () => {
    await assertFails(getDoc(doc(outsiderDb, 'trips', '0000')));
    await assertFails(getDoc(doc(outsiderDb, 'trips', '0000', 'tappe', 'tappa_01')));
  });

  // TEST 4: Simulazione Rollback
  await test('4.1 Procedura di rollback ripristina ownerUid originale senza cancellare dati nuovi', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await updateDoc(doc(adminDb, 'trips', '0000'), {
        ownerUid: OLD_ANON_OWNER,
        members: [OLD_ANON_OWNER, NEW_PERM_OWNER, COPILOT_UID]
      });
      await updateDoc(doc(adminDb, 'trips', '0000', 'members', NEW_PERM_OWNER), {
        role: 'copilota'
      });
    });

    // Vecchio torna Owner
    await assertSucceeds(updateDoc(doc(oldOwnerDb, 'trips', '0000'), {
      title: 'Viaggio Ripristinato'
    }));

    // I dati creati durante la migrazione ('spesa_post_migrazione') sono ancora integri
    const spesaSnap = await getDoc(doc(oldOwnerDb, 'trips', '0000', 'spese', 'spesa_post_migrazione'));
    if (!spesaSnap.exists()) throw new Error('Dato creato post-migrazione perso!');
  });

  await testEnv.cleanup();
  console.log(`\nESITO: ${passed}/${total} test di simulazione superati con successo.`);
}

runEmulatorMigrationTest().catch(console.error);
