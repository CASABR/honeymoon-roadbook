/**
 * Test Suite Ufficiale di Convalida su Firebase Emulator Reale
 * Requisiti 2 & 3: Verifica Sicurezza Inviti Copilota, Creazione Remota,
 * Coerenza ownerUid/ownerId, Ruoli e Protezione 0000.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  writeBatch,
  arrayUnion,
  Timestamp
} = require('firebase/firestore');

const projectId = 'demo-hounigo-beta-validation';
const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

async function run() {
  console.log('=================================================================');
  console.log('HOUNIGO — VERIFICA FINALE SU FIREBASE EMULATOR REALE (PORT 8085)');
  console.log('Test di Sicurezza Inviti Crittografici, Creazione Remota & 0000');
  console.log('=================================================================\n');

  let testEnv;
  try {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { rules, host: '127.0.0.1', port: 8085 }
    });
  } catch (err) {
    console.error('ERRORE: Impossibile connettersi all\'emulatore su 127.0.0.1:8085');
    console.error(err.message);
    process.exit(2);
  }

  let passed = 0;
  let total = 0;

  async function checkSuccess(promise, desc) {
    total++;
    try {
      await assertSucceeds(promise);
      passed++;
      console.log(`  [PASS ${passed.toString().padStart(2, '0')}] ${desc}`);
    } catch (err) {
      console.error(`  [FAIL ${total.toString().padStart(2, '0')}] ${desc}`);
      console.error('         Errore inatteso:', err.message);
      throw err;
    }
  }

  async function checkFails(promise, desc) {
    total++;
    try {
      await assertFails(promise);
      passed++;
      console.log(`  [PASS ${passed.toString().padStart(2, '0')}] ${desc}`);
    } catch (err) {
      console.error(`  [FAIL ${total.toString().padStart(2, '0')}] ${desc}`);
      console.error('         Operazione avrebbe dovuto FALLIRE ma ha avuto SUCCESSO!');
      throw err;
    }
  }

  // Identità verificate per i test
  const OWNER_1_UID = 'user_owner_alpha';
  const OWNER_LEGACY_UID = 'user_owner_legacy_id';
  const COPILOT_INVITEE_UID = 'user_copilot_bob';
  const HACKER_UID = 'user_hacker_eve';
  const OUTSIDER_UID = 'user_outsider_frank';
  const OWNER_0000_UID = 'cqs2OcE7WzY7XmiqVoZmM7B6Fpp2';

  const owner1Db = testEnv.authenticatedContext(OWNER_1_UID).firestore();
  const ownerLegacyDb = testEnv.authenticatedContext(OWNER_LEGACY_UID).firestore();
  const inviteeDb = testEnv.authenticatedContext(COPILOT_INVITEE_UID).firestore();
  const hackerDb = testEnv.authenticatedContext(HACKER_UID).firestore();
  const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore();
  const owner0000Db = testEnv.authenticatedContext(OWNER_0000_UID).firestore();
  const unauthDb = testEnv.unauthenticatedContext().firestore();

  // Pulizia iniziale database emulatore per garantire idempotenza dei test
  await testEnv.clearFirestore();

  // Setup del viaggio reale 0000 (preesistente) tramite context amministrativo
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, 'trips', '0000'), {
      id: '0000',
      title: 'Viaggio Originale 0000',
      ownerUid: OWNER_0000_UID,
      members: [OWNER_0000_UID]
    });
    await setDoc(doc(adminDb, 'trips', '0000', 'members', OWNER_0000_UID), {
      uid: OWNER_0000_UID,
      role: 'owner'
    });
    await setDoc(doc(adminDb, 'trips', '0000', 'tappe', 'tappa_segreta_0000'), {
      title: 'Auckland Intacta',
      secretNotes: 'Dati privati riservati agli sposi'
    });
  });

  const TRIP_1_ID = 'trip_custom_101';
  const VALID_TOKEN = 'token_valid_128bit_abc123xyz789';
  const EXPIRED_TOKEN = 'token_expired_999';
  const REVOKED_TOKEN = 'token_revoked_888';

  console.log('--- SEZIONE 1: CREAZIONE REMOTA NUOVO VIAGGIO & COERENZA OWNERUID / OWNERID ---');

  // Test 1: Creazione remota atomica con ownerUid
  const createBatch1 = writeBatch(owner1Db);
  createBatch1.set(doc(owner1Db, 'trips', TRIP_1_ID), {
    id: TRIP_1_ID,
    title: 'Giappone 2026',
    ownerUid: OWNER_1_UID,
    ownerName: 'Mario',
    members: [OWNER_1_UID],
    createdAt: Date.now()
  });
  createBatch1.set(doc(owner1Db, 'trips', TRIP_1_ID, 'members', OWNER_1_UID), {
    uid: OWNER_1_UID,
    role: 'owner',
    name: 'Mario'
  });
  await checkSuccess(createBatch1.commit(), 'Creazione remota nuovo viaggio con ownerUid e member owner');

  // Test 2: Creazione remota con ownerId (retrocompatibilità schema)
  const TRIP_LEGACY_ID = 'trip_legacy_202';
  const createBatchLegacy = writeBatch(ownerLegacyDb);
  createBatchLegacy.set(doc(ownerLegacyDb, 'trips', TRIP_LEGACY_ID), {
    id: TRIP_LEGACY_ID,
    title: 'Viaggio Legacy',
    ownerId: OWNER_LEGACY_UID,
    ownerName: 'Luigi',
    members: [OWNER_LEGACY_UID],
    createdAt: Date.now()
  });
  createBatchLegacy.set(doc(ownerLegacyDb, 'trips', TRIP_LEGACY_ID, 'members', OWNER_LEGACY_UID), {
    uid: OWNER_LEGACY_UID,
    role: 'owner',
    name: 'Luigi'
  });
  await checkSuccess(createBatchLegacy.commit(), 'Creazione remota viaggio con schema retrocompatibile ownerId');

  // Test 3: Owner con ownerId ha pieni poteri owner (es. aggiornamento info)
  await checkSuccess(
    updateDoc(doc(ownerLegacyDb, 'trips', TRIP_LEGACY_ID), { title: 'Viaggio Legacy Rinominato' }),
    'Owner con ownerId riconosciuto legittimamente da isTripOwner per modifiche'
  );

  console.log('\n--- SEZIONE 2: GENERAZIONE INVITI CRITTOGRAFICI & LIMITI ---');

  // Test 4: Owner crea invito valido (7 giorni di validità)
  const now = Date.now();
  const future7Days = Timestamp.fromMillis(now + 7 * 24 * 60 * 60 * 1000);
  await checkSuccess(
    setDoc(doc(owner1Db, 'trips', TRIP_1_ID, 'invites', VALID_TOKEN), {
      inviteToken: VALID_TOKEN,
      tripId: TRIP_1_ID,
      tripTitle: 'Giappone 2026',
      ownerName: 'Mario',
      role: 'copilota',
      createdBy: OWNER_1_UID,
      createdAt: Timestamp.fromMillis(now),
      expiresAt: future7Days,
      status: 'active',
      usedBy: null,
      usedAt: null
    }),
    'Owner genera invito crittografico valido per copilota in /invites/{token}'
  );

  // Test 5: Outsider tenta di creare invito per il viaggio dell\'owner
  await checkFails(
    setDoc(doc(outsiderDb, 'trips', TRIP_1_ID, 'invites', 'fake_token'), {
      inviteToken: 'fake_token',
      tripId: TRIP_1_ID,
      role: 'copilota',
      createdBy: OUTSIDER_UID,
      expiresAt: future7Days,
      status: 'active'
    }),
    'Estraneo NON può creare inviti per un viaggio di cui non è owner'
  );

  // Test 6: Tentativo di creare invito sul viaggio 0000 (blocco assoluto)
  await checkFails(
    setDoc(doc(owner0000Db, 'trips', '0000', 'invites', 'token_0000'), {
      inviteToken: 'token_0000',
      tripId: '0000',
      role: 'copilota',
      createdBy: OWNER_0000_UID,
      expiresAt: future7Days,
      status: 'active'
    }),
    'Protezione 0000: VIETATA la creazione di inviti sul viaggio master 0000'
  );

  console.log('\n--- SEZIONE 3: ACCESSO CON SOLO TRIPID VS ACCESSO CON TOKEN ---');

  // Test 7: Estraneo con solo tripId tenta di leggere /trips/{tripId}
  await checkFails(
    getDoc(doc(outsiderDb, 'trips', TRIP_1_ID)),
    'Estraneo con SOLO tripId NON può leggere /trips/{tripId}'
  );

  // Test 8: Estraneo tenta di leggere dati privati prima del join (tappe, spese, note)
  await checkFails(
    getDocs(collection(outsiderDb, 'trips', TRIP_1_ID, 'tappe')),
    'Estraneo NON può accedere alle sottocollezioni private (tappe) prima del join'
  );

  // Test 9: Utente invitato con token valido può leggere il singolo doc invito
  await checkSuccess(
    getDoc(doc(inviteeDb, 'trips', TRIP_1_ID, 'invites', VALID_TOKEN)),
    'Utente invitato legge con token esatto i dettagli dell\'invito prima del join'
  );

  // Test 10: Estraneo NON può enumerare o cercare token altrui (list vietata)
  await checkFails(
    getDocs(collection(outsiderDb, 'trips', TRIP_1_ID, 'invites')),
    'Estraneo NON può eseguire list/scansione della collezione /invites'
  );

  console.log('\n--- SEZIONE 4: RISCATTO ATOMICO INVITO COPILOTA (SPARK COMPATIBLE) ---');

  // Test 11: Invitee riscatta l'invito valido via writeBatch atomico
  const redeemBatch = writeBatch(inviteeDb);
  // 1. Crea member doc con role: 'copilota' e riferimento al token
  redeemBatch.set(doc(inviteeDb, 'trips', TRIP_1_ID, 'members', COPILOT_INVITEE_UID), {
    uid: COPILOT_INVITEE_UID,
    role: 'copilota',
    inviteToken: VALID_TOKEN,
    createdAt: Date.now()
  });
  // 2. Transizione stato token ad 'used' associato all'UID
  redeemBatch.update(doc(inviteeDb, 'trips', TRIP_1_ID, 'invites', VALID_TOKEN), {
    status: 'used',
    usedBy: COPILOT_INVITEE_UID,
    usedAt: Date.now()
  });
  // 3. Aggiunge il proprio UID all'array members del viaggio
  redeemBatch.update(doc(inviteeDb, 'trips', TRIP_1_ID), {
    members: arrayUnion(COPILOT_INVITEE_UID),
    updatedAt: Date.now()
  });
  await checkSuccess(redeemBatch.commit(), 'Riscatto atomico invito valido con batch: member + token used + members array');

  // Test 12: Ora il copilota riscattato è membro e può leggere il viaggio
  await checkSuccess(
    getDoc(doc(inviteeDb, 'trips', TRIP_1_ID)),
    'Copilota riscattato è ora membro e legge /trips/{tripId} con successo'
  );

  // Test 13: Il copilota riscattato può collaborare sulle tappe
  await checkSuccess(
    setDoc(doc(inviteeDb, 'trips', TRIP_1_ID, 'tappe', 'tappa_tokyo'), {
      title: 'Tokyo Shibuya',
      note: 'Inserita dal copilota Bob'
    }),
    'Copilota riscattato può scrivere nelle sottocollezioni autorizzate (tappe)'
  );

  console.log('\n--- SEZIONE 5: PROTEZIONE CONTRO TOKEN RIUSATI, SCADUTI, REVOCATI E ATTACCHI ---');

  // Test 14: Hacker tenta di riusare lo stesso token già consumato
  const hackerBatchRiuso = writeBatch(hackerDb);
  hackerBatchRiuso.set(doc(hackerDb, 'trips', TRIP_1_ID, 'members', HACKER_UID), {
    uid: HACKER_UID,
    role: 'copilota',
    inviteToken: VALID_TOKEN
  });
  hackerBatchRiuso.update(doc(hackerDb, 'trips', TRIP_1_ID, 'invites', VALID_TOKEN), {
    status: 'used',
    usedBy: HACKER_UID
  });
  hackerBatchRiuso.update(doc(hackerDb, 'trips', TRIP_1_ID), {
    members: arrayUnion(HACKER_UID)
  });
  await checkFails(hackerBatchRiuso.commit(), 'Tentativo di riusare token GIA\' UTILIZZATO viene respinto');

  // Setup invito scaduto nel passato
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, 'trips', TRIP_1_ID, 'invites', EXPIRED_TOKEN), {
      inviteToken: EXPIRED_TOKEN,
      tripId: TRIP_1_ID,
      role: 'copilota',
      createdBy: OWNER_1_UID,
      expiresAt: Timestamp.fromMillis(now - 3600000), // 1 ora fa
      status: 'active'
    });
    await setDoc(doc(adminDb, 'trips', TRIP_1_ID, 'invites', REVOKED_TOKEN), {
      inviteToken: REVOKED_TOKEN,
      tripId: TRIP_1_ID,
      role: 'copilota',
      createdBy: OWNER_1_UID,
      expiresAt: future7Days,
      status: 'revoked'
    });
  });

  // Test 15: Tentativo di riscatto token scaduto
  const hackerBatchScaduto = writeBatch(hackerDb);
  hackerBatchScaduto.set(doc(hackerDb, 'trips', TRIP_1_ID, 'members', HACKER_UID), {
    uid: HACKER_UID,
    role: 'copilota',
    inviteToken: EXPIRED_TOKEN
  });
  hackerBatchScaduto.update(doc(hackerDb, 'trips', TRIP_1_ID, 'invites', EXPIRED_TOKEN), {
    status: 'used',
    usedBy: HACKER_UID
  });
  hackerBatchScaduto.update(doc(hackerDb, 'trips', TRIP_1_ID), {
    members: arrayUnion(HACKER_UID)
  });
  await checkFails(hackerBatchScaduto.commit(), 'Tentativo di riscatto token SCADUTO viene respinto');

  // Test 16: Tentativo di riscatto token revocato
  const hackerBatchRevocato = writeBatch(hackerDb);
  hackerBatchRevocato.set(doc(hackerDb, 'trips', TRIP_1_ID, 'members', HACKER_UID), {
    uid: HACKER_UID,
    role: 'copilota',
    inviteToken: REVOKED_TOKEN
  });
  hackerBatchRevocato.update(doc(hackerDb, 'trips', TRIP_1_ID, 'invites', REVOKED_TOKEN), {
    status: 'used',
    usedBy: HACKER_UID
  });
  hackerBatchRevocato.update(doc(hackerDb, 'trips', TRIP_1_ID), {
    members: arrayUnion(HACKER_UID)
  });
  await checkFails(hackerBatchRevocato.commit(), 'Tentativo di riscatto token REVOCATO viene respinto');

  // Test 17: Auto-join non autorizzato (senza token)
  const hackerBatchNoToken = writeBatch(hackerDb);
  hackerBatchNoToken.set(doc(hackerDb, 'trips', TRIP_1_ID, 'members', HACKER_UID), {
    uid: HACKER_UID,
    role: 'copilota'
  });
  hackerBatchNoToken.update(doc(hackerDb, 'trips', TRIP_1_ID), {
    members: arrayUnion(HACKER_UID)
  });
  await checkFails(hackerBatchNoToken.commit(), 'Auto-join NON AUTORIZZATO senza token crittografico viene respinto');

  // Test 18: Tentativo di auto-promozione ad 'owner' durante il join
  const hackerBatchOwnerRole = writeBatch(hackerDb);
  hackerBatchOwnerRole.set(doc(hackerDb, 'trips', TRIP_1_ID, 'members', HACKER_UID), {
    uid: HACKER_UID,
    role: 'owner',
    inviteToken: VALID_TOKEN
  });
  await checkFails(hackerBatchOwnerRole.commit(), 'Tentativo di auto-join con role "owner" viene categoricamente respinto');

  // Test 19: Tentativo di auto-join su 0000
  const hackerBatch0000 = writeBatch(hackerDb);
  hackerBatch0000.set(doc(hackerDb, 'trips', '0000', 'members', HACKER_UID), {
    uid: HACKER_UID,
    role: 'copilota'
  });
  hackerBatch0000.update(doc(hackerDb, 'trips', '0000'), {
    members: arrayUnion(HACKER_UID)
  });
  await checkFails(hackerBatch0000.commit(), 'Tentativo di auto-join su viaggio protetto 0000 viene respinto');

  console.log('\n--- SEZIONE 6: PROTEZIONE ASSOLUTA VIAGGIO 0000 & COMPATIBILITA\' ESISTENTI ---');

  // Test 20: Estraneo NON può leggere viaggio 0000
  await checkFails(getDoc(doc(outsiderDb, 'trips', '0000')), 'Estraneo NON può leggere il viaggio master 0000');

  // Test 21: Estraneo NON può leggere le tappe private di 0000
  await checkFails(
    getDoc(doc(outsiderDb, 'trips', '0000', 'tappe', 'tappa_segreta_0000')),
    'Estraneo NON può leggere le tappe private del viaggio 0000'
  );

  // Test 22: Owner 0000 legittimo legge il viaggio 0000
  await checkSuccess(getDoc(doc(owner0000Db, 'trips', '0000')), 'Owner legittimo di 0000 legge il viaggio con successo');

  // Test 23: Owner 0000 NON può eliminare 0000
  await checkFails(deleteDoc(doc(owner0000Db, 'trips', '0000')), 'Owner NON può eliminare il viaggio master 0000');

  // Test 24: Viaggio esistente senza sottocollezione invites continua a funzionare perfettamente
  await checkSuccess(
    updateDoc(doc(owner1Db, 'trips', TRIP_1_ID), { title: 'Giappone 2026 Confermato' }),
    'Compatibilità totale: aggiornamenti ordinari funzionano senza dipendenza dalla subcollection invites'
  );

  console.log('\n-----------------------------------------------------------------');
  console.log(`RISULTATO EMULATORE: ${passed}/${total} test superati con successo (${Math.round(passed/total*100)}%)`);
  console.log('-----------------------------------------------------------------');
}

run().catch((err) => {
  console.error('\nTEST SUITE INTERROTTA PER ERRORE CRITICO:', err);
  process.exit(1);
});
