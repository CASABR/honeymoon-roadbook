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
  let testEnv;
  try {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { rules, host: '127.0.0.1', port: 8085 }
    });
  } catch (err) {
    console.error('=================================================================');
    console.error('ESITO TEST EMULATOR FIRESTORE: NON SUPERATO (EMULATOR NON ATTIVO)');
    console.error('Motivo: Impossibile connettersi all\'emulatore Firestore su 127.0.0.1:8085.');
    console.error(err.message);
    console.error('=================================================================');
    process.exitCode = 2;
    return;
  }

  let passedCount = 0;
  async function testSucceeds(promise, desc) {
    await assertSucceeds(promise);
    passedCount++;
    console.log(`  [PASS ${passedCount.toString().padStart(2, '0')}] ${desc}`);
  }
  async function testFails(promise, desc) {
    await assertFails(promise);
    passedCount++;
    console.log(`  [PASS ${passedCount.toString().padStart(2, '0')}] ${desc}`);
  }

  // Ruoli verificati per la matrice di test
  const adminAuthorized = testEnv.authenticatedContext('admin-a').firestore();
  const adminClaim = testEnv.authenticatedContext('admin-claim-user', { admin: true }).firestore();
  const unauthAdmin = testEnv.authenticatedContext('unauthorized-user').firestore();
  const owner = testEnv.authenticatedContext('owner-a').firestore();
  const copilot = testEnv.authenticatedContext('copilot-a').firestore();
  const outsider = testEnv.authenticatedContext('outsider').firestore();
  const ownerB = testEnv.authenticatedContext('owner-b').firestore();
  const owner0000 = testEnv.authenticatedContext('owner-0000').firestore();
  const unauth = testEnv.unauthenticatedContext().firestore();

  try {
    // Inizializzazione dati di test con regole disabilitate
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      
      // Viaggio A
      await setDoc(doc(db, 'trips', 'trip-a'), {
        ownerUid: 'owner-a', members: ['owner-a', 'copilot-a'], title: 'Trip A'
      });
      await setDoc(doc(db, 'trips', 'trip-a', 'members', 'owner-a'), { uid: 'owner-a', role: 'owner' });
      await setDoc(doc(db, 'trips', 'trip-a', 'members', 'copilot-a'), { uid: 'copilot-a', role: 'copilota' });

      // Viaggio B
      await setDoc(doc(db, 'trips', 'trip-b'), {
        ownerUid: 'owner-b', members: ['owner-b'], title: 'Trip B'
      });
      await setDoc(doc(db, 'trips', 'trip-b', 'members', 'owner-b'), { uid: 'owner-b', role: 'owner' });

      // Viaggio protetto 0000
      await setDoc(doc(db, 'trips', '0000'), {
        ownerUid: 'owner-0000', members: ['owner-0000'], title: 'Viaggio Reale 0000'
      });
      await setDoc(doc(db, 'trips', '0000', 'members', 'owner-0000'), { uid: 'owner-0000', role: 'owner' });

      // Whitelist Admin Globale
      await setDoc(doc(db, 'system_admins', 'admin-a'), { createdForTest: true });
    });

    console.log('\n--- BLOCCO 1: QUERY GLOBALI SU /trips (Admin Autorizzato vs Non Autorizzato) ---');
    await testSucceeds(getDocs(collection(adminAuthorized, 'trips')), 'Admin whitelist (/system_admins) esegue query globale collection(trips)');
    await testSucceeds(getDocs(collection(adminClaim, 'trips')), 'Admin con custom claim (admin: true) esegue query globale');
    await testFails(getDocs(collection(unauthAdmin, 'trips')), 'Utente autenticato ordinario NON autorizzato a query globale');
    await testFails(getDocs(collection(copilot, 'trips')), 'Copilota di un viaggio NON autorizzato a query globale');
    await testFails(getDocs(collection(owner, 'trips')), 'Organizzatore NON autorizzato a query globale su tutti i viaggi');
    await testFails(getDocs(collection(outsider, 'trips')), 'Estraneo NON autorizzato a query globale');
    await testFails(getDocs(collection(unauth, 'trips')), 'Utente non autenticato NON autorizzato a query globale');

    console.log('\n--- BLOCCO 2: ACCESSO PUNTUALE E ISOLAMENTO TRA VIAGGI ---');
    await testSucceeds(getDoc(doc(owner, 'trips', 'trip-a')), 'Organizzatore legge il proprio viaggio trip-a');
    await testSucceeds(getDoc(doc(copilot, 'trips', 'trip-a')), 'Copilota legge il viaggio di cui fa parte trip-a');
    await testSucceeds(getDoc(doc(adminAuthorized, 'trips', 'trip-a')), 'Admin autorizzato legge trip-a');
    await testFails(getDoc(doc(copilot, 'trips', 'trip-b')), 'Isolamento: Copilota di trip-a NON può leggere trip-b');
    await testFails(getDoc(doc(owner, 'trips', 'trip-b')), 'Isolamento: Organizzatore di trip-a NON può leggere trip-b');
    await testFails(getDoc(doc(outsider, 'trips', 'trip-a')), 'Estraneo NON può leggere trip-a');
    await testSucceeds(getDoc(doc(ownerB, 'trips', 'trip-b')), 'Organizzatore B legge trip-b');
    await testSucceeds(getDoc(doc(adminAuthorized, 'trips', 'trip-b')), 'Admin autorizzato legge trip-b');

    console.log('\n--- BLOCCO 3: ACCESSO LEGACY E PROTEZIONE DEL VIAGGIO 0000 ---');
    await testSucceeds(getDoc(doc(owner0000, 'trips', '0000')), 'Membro autorizzato di 0000 legge il viaggio reale');
    await testSucceeds(getDoc(doc(adminAuthorized, 'trips', '0000')), 'Admin autorizzato legge il viaggio 0000');
    await testFails(getDoc(doc(outsider, 'trips', '0000')), 'Estraneo NON può accedere al viaggio 0000');
    await testFails(getDoc(doc(copilot, 'trips', '0000')), 'Copilota di altro viaggio NON può accedere a 0000');
    await testFails(getDoc(doc(owner, 'trips', '0000')), 'Organizzatore di altro viaggio NON può accedere a 0000');
    await testFails(deleteDoc(doc(owner0000, 'trips', '0000')), 'Protezione 0000: Organizzatore NON può eliminare 0000');
    await testFails(deleteDoc(doc(adminAuthorized, 'trips', '0000')), 'Protezione 0000: Admin NON può eliminare 0000');
    await testFails(deleteDoc(doc(outsider, 'trips', '0000')), 'Protezione 0000: Estraneo NON può eliminare 0000');

    console.log('\n--- BLOCCO 4: SOTTOCOLLEZIONI E SOTTOCOLLEZIONE devices ---');
    await testSucceeds(setDoc(doc(owner, 'trips', 'trip-a', 'tappe', 'tappa-1'), { title: 'Tappa 1' }), 'Organizzatore scrive su sottocollezione tappe');
    await testSucceeds(setDoc(doc(copilot, 'trips', 'trip-a', 'tappe', 'tappa-2'), { title: 'Tappa 2' }), 'Copilota scrive su sottocollezione tappe');
    await testSucceeds(setDoc(doc(owner, 'trips', 'trip-a', 'devices', 'dev-owner'), { role: 'owner', lastSeen: Date.now() }), 'Organizzatore scrive su sottocollezione devices');
    await testSucceeds(setDoc(doc(copilot, 'trips', 'trip-a', 'devices', 'dev-copilot'), { role: 'copilota', lastSeen: Date.now() }), 'Copilota scrive su sottocollezione devices');
    await testSucceeds(getDoc(doc(copilot, 'trips', 'trip-a', 'devices', 'dev-owner')), 'Copilota legge doc in devices');
    await testFails(setDoc(doc(outsider, 'trips', 'trip-a', 'devices', 'dev-outsider'), { role: 'outsider', lastSeen: Date.now() }), 'Estraneo NON può scrivere su devices');
    await testFails(getDoc(doc(outsider, 'trips', 'trip-a', 'devices', 'dev-owner')), 'Estraneo NON può leggere da devices');

    console.log('\n--- BLOCCO 5: TENTATIVI DI AUTO-PROMOZIONE ED ESCALATION ---');
    await testFails(updateDoc(doc(copilot, 'trips', 'trip-a', 'members', 'copilot-a'), { role: 'owner' }), 'Copilota NON può promuoversi a owner su members');
    await testFails(updateDoc(doc(copilot, 'trips', 'trip-a'), { ownerUid: 'copilot-a' }), 'Copilota NON può alterare ownerUid del viaggio');
    await testFails(updateDoc(doc(owner, 'trips', 'trip-a'), { ownerUid: 'another-uid' }), 'Organizzatore NON può alterare ownerUid (immutabile)');
    await testFails(updateDoc(doc(copilot, 'trips', 'trip-a'), { members: arrayUnion('outsider') }), 'Copilota NON può aggiungere membri al viaggio');
    await testFails(setDoc(doc(copilot, 'trips', 'trip-a', 'members', 'outsider'), { uid: 'outsider', role: 'owner' }), 'Copilota NON può creare membri owner');
    await testFails(deleteDoc(doc(copilot, 'trips', 'trip-a')), 'Copilota NON può eliminare il viaggio');
    await testFails(deleteDoc(doc(outsider, 'trips', 'trip-a')), 'Estraneo NON può eliminare il viaggio');
    await testFails(updateDoc(doc(adminAuthorized, 'trips', 'trip-a'), { title: 'Admin title' }), 'Admin NON ha permessi di modifica su trips (minimo privilegio)');
    await testFails(deleteDoc(doc(adminAuthorized, 'trips', 'trip-a')), 'Admin NON ha permessi di eliminazione su trips (minimo privilegio)');

    console.log('\n--- BLOCCO 6: DIVIETO DI SCRITTURA CLIENT SU /system_admins ---');
    await testFails(setDoc(doc(outsider, 'system_admins', 'outsider'), { created: true }), 'Estraneo NON può scrivere su system_admins');
    await testFails(setDoc(doc(copilot, 'system_admins', 'copilot-a'), { created: true }), 'Copilota NON può scrivere su system_admins');
    await testFails(setDoc(doc(owner, 'system_admins', 'owner-a'), { created: true }), 'Organizzatore NON può scrivere su system_admins');
    await testFails(setDoc(doc(adminAuthorized, 'system_admins', 'new-admin'), { created: true }), 'Admin stesso NON può scrivere da client su system_admins');
    await testFails(deleteDoc(doc(adminAuthorized, 'system_admins', 'admin-a')), 'Admin stesso NON può cancellare da client su system_admins');
    await testFails(getDocs(collection(adminAuthorized, 'system_admins')), 'Nessun client può eseguire list su system_admins');

    console.log('\n--- BLOCCO 7: AGGIUNTA E REVOCA COPILOTI VIA BATCH (Spark Nativo) ---');
    const addBatch = writeBatch(owner);
    addBatch.update(doc(owner, 'trips', 'trip-a'), { members: arrayUnion('copilot-new') });
    addBatch.set(doc(owner, 'trips', 'trip-a', 'members', 'copilot-new'), {
      uid: 'copilot-new', role: 'copilota'
    });
    await testSucceeds(addBatch.commit(), 'Owner aggiunge copilota via writeBatch atomico (members array + members subdoc)');

    const newCopilot = testEnv.authenticatedContext('copilot-new').firestore();
    await testSucceeds(getDoc(doc(newCopilot, 'trips', 'trip-a')), 'Nuovo copilota aggiunto legge trip-a con successo');

    const revokeBatch = writeBatch(owner);
    revokeBatch.update(doc(owner, 'trips', 'trip-a'), { members: arrayRemove('copilot-a') });
    revokeBatch.delete(doc(owner, 'trips', 'trip-a', 'members', 'copilot-a'));
    await testSucceeds(revokeBatch.commit(), 'Owner revoca copilota via writeBatch atomico');

    await testFails(getDoc(doc(copilot, 'trips', 'trip-a')), 'Copilota revocato perde immediatamente accesso in lettura al viaggio');
    await testFails(setDoc(doc(copilot, 'trips', 'trip-a', 'devices', 'dev-after-revoke'), { role: 'copilota' }), 'Copilota revocato perde accesso in scrittura alle sottocollezioni');

    console.log('\n=================================================================');
    console.log(`EMULATOR TEST COMPLETATI: ${passedCount}/46 ASSERZIONI SUPERATE CON SUCCESSO!`);
    console.log('=================================================================\n');
  } finally {
    await testEnv.cleanup();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
