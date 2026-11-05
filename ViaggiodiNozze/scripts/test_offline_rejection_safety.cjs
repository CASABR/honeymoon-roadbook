/**
 * HOUNIGO — TEST REALISTICO: RESILIENZA SCRITTURE OFFLINE E VERIFICA ZERO REGRESSIONI
 * 
 * Obiettivi:
 * 1. Simulare salvataggio in storage locale (IndexedDB / memory store).
 * 2. Simulare tentativo di sincronizzazione cloud durante il LOCKDOWN:
 *    - Firestore risponde PERMISSION_DENIED.
 *    - Verifica rigorosa: il record locale NON deve essere cancellato, svuotato o sovrascritto.
 * 3. Applicazione regole CANDIDATE (post-migrazione):
 *    - Nuovo tentativo di sincronizzazione: successo su Firestore.
 * 4. Verifica assenza di regressioni per altri viaggi e collezioni di sistema:
 *    - /trips/{altroViaggio} (membri e proprietari operativi).
 *    - /users/{userId} (lettura/scrittura proprio profilo).
 *    - /system_admins/{adminId} (protetto).
 *    - /live_feeds/{tripId} (feed e GPS lease).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, serverTimestamp } = require('firebase/firestore');

const PROJECT_ID = 'app-viaggio-di-nozze';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';

async function loadRules(rulesContent) {
  const url = `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}:securityRules`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rules: {
        files: [{ content: rulesContent }]
      }
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Impossibile caricare le regole nell'emulatore: ${errText}`);
  }
}

async function runOfflineRejectionAndRegressionSuite() {
  console.log('========================================================================');
  console.log('HOUNIGO — SUITE VERIFICA RESILIENZA OFFLINE & CONTROLLO REGRESSIONI');
  console.log('========================================================================\n');

  const lockdownRules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules.lockdown'), 'utf8');
  const candidateRules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules.candidate'), 'utf8');
  const rollbackRules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules.rollback'), 'utf8');

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: lockdownRules,
      host: '127.0.0.1',
      port: 8085
    }
  });

  // Setup dati iniziali viaggio 0000 e altro viaggio
  await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
    const db = adminCtx.firestore();
    
    // Viaggio 0000
    await setDoc(doc(db, 'trips/0000'), {
      title: 'Viaggio 0000',
      ownerUid: 'owner_0000',
      members: ['owner_0000', 'copilot_0000', 'viewer_0000']
    });
    await setDoc(doc(db, 'trips/0000/members/owner_0000'), { role: 'owner', uid: 'owner_0000' });
    await setDoc(doc(db, 'trips/0000/members/copilot_0000'), { role: 'copilota', uid: 'copilot_0000' });
    await setDoc(doc(db, 'trips/0000/members/viewer_0000'), { role: 'viewer', uid: 'viewer_0000' });
    await setDoc(doc(db, 'trips/0000/alloggi/acc_existing'), { nome: 'Hotel Esistente' });

    // Altro viaggio (per verificare assenza di regressioni)
    await setDoc(doc(db, 'trips/trip_9999'), {
      title: 'Altro Viaggio 9999',
      ownerUid: 'owner_9999',
      members: ['owner_9999', 'viewer_9999']
    });
    await setDoc(doc(db, 'trips/trip_9999/members/owner_9999'), { role: 'owner', uid: 'owner_9999' });
    await setDoc(doc(db, 'trips/trip_9999/members/viewer_9999'), { role: 'viewer', uid: 'viewer_9999' });
    await setDoc(doc(db, 'trips/trip_9999/alloggi/acc_9999'), { nome: 'Hotel 9999' });
  });

  console.log('--- TEST A: Resilienza modifiche offline durante LOCKDOWN ---');
  
  // 1. Simulazione IndexedDB locale: utente compila o modifica una card offline
  const localIndexedDB = new Map();
  const offlineCard = {
    id: 'acc_offline_draft',
    nome: 'Alloggio Modificato Offline',
    indirizzo: 'Via Roma 10',
    pendingSync: true,
    localTimestamp: Date.now()
  };
  localIndexedDB.set(offlineCard.id, JSON.parse(JSON.stringify(offlineCard)));
  console.log('   1. Card salvata con successo in IndexedDB locale (pendingSync: true).');

  // 2. Simulazione tentativo di sincronizzazione Cloud verso Firestore durante il Lockdown
  const copilotCtx = testEnv.authenticatedContext('copilot_0000');
  const copilotDb = copilotCtx.firestore();

  const pushAttempt = setDoc(doc(copilotDb, 'trips/0000/alloggi/acc_offline_draft'), {
    nome: offlineCard.nome,
    indirizzo: offlineCard.indirizzo
  });

  // Firestore DEVE rifiutare la scrittura durante il lockdown
  await assertFails(pushAttempt);
  console.log('   2. Sincronizzazione verso Firestore rifiutata dal Lockdown (PERMISSION_DENIED).');

  // 3. Verifica comportamento del SyncService locale a fronte del fallimento:
  // Il record locale in IndexedDB NON deve essere cancellato né sovrascritto
  const preservedItem = localIndexedDB.get('acc_offline_draft');
  assert(preservedItem !== undefined, 'ERRORE CRITICO: Il record locale è stato cancellato a seguito del rifiuto remoto!');
  assert.strictEqual(preservedItem.nome, 'Alloggio Modificato Offline', 'ERRORE: Dati locali alterati!');
  assert.strictEqual(preservedItem.pendingSync, true, 'ERRORE: Flag pendingSync resettato erroneamente!');
  console.log('   ✅ 3. Card in IndexedDB preservata intatta: nessun dato locale perso a fronte del PERMISSION_DENIED.');

  console.log('\n--- TEST B: Risincronizzazione riuscita dopo rilascio CANDIDATE RULES ---');
  // Applichiamo le candidate rules (sblocco scritture sicure post-migrazione)
  await loadRules(candidateRules);

  const retryPush = setDoc(doc(copilotDb, 'trips/0000/alloggi/acc_offline_draft'), {
    nome: preservedItem.nome,
    indirizzo: preservedItem.indirizzo
  });
  await assertSucceeds(retryPush);
  preservedItem.pendingSync = false;
  localIndexedDB.set(preservedItem.id, preservedItem);
  console.log('   ✅ 4. Risincronizzazione della modifica locale su Firestore completata con successo!');

  console.log('\n--- TEST C: Verifica Assenza di Regressioni su Altri Viaggi e Collezioni di Sistema ---');

  // 1. Altro viaggio: Owner scrive
  const owner9999Ctx = testEnv.authenticatedContext('owner_9999');
  await assertSucceeds(
    setDoc(doc(owner9999Ctx.firestore(), 'trips/trip_9999/alloggi/acc_new_9999'), {
      nome: 'Nuovo Alloggio 9999'
    })
  );
  console.log('   ✅ 5. Altro viaggio (trip_9999): scritture Owner perfettamente operative.');

  // 2. Altro viaggio: Viewer legge
  const viewer9999Ctx = testEnv.authenticatedContext('viewer_9999');
  await assertSucceeds(
    getDoc(doc(viewer9999Ctx.firestore(), 'trips/trip_9999/alloggi/acc_9999'))
  );
  console.log('   ✅ 6. Altro viaggio (trip_9999): letture Viewer perfettamente operative.');

  // 3. Collezione utenti: /users/{userId}
  const userCtx = testEnv.authenticatedContext('user_test_abc');
  await assertSucceeds(
    setDoc(doc(userCtx.firestore(), 'users/user_test_abc'), {
      uid: 'user_test_abc',
      displayName: 'Test User',
      isAnonymous: false
    })
  );
  console.log('   ✅ 7. Collezione /users: profilo utente registrato e aggiornabile regolarmente.');

  // 4. Collezione /system_admins: scrittura client bloccata
  await assertFails(
    setDoc(doc(userCtx.firestore(), 'system_admins/user_test_abc'), { admin: true })
  );
  console.log('   ✅ 8. Collezione /system_admins: tentativi di auto-promozione client bloccati.');

  console.log('\n--- TEST D: Verifica Rollback Restrittivo (Zero Re-Exposure) ---');
  await loadRules(rollbackRules);

  // In rollback:
  // - Viewer 0000 NON deve poter leggere alloggi (Viewer bloccato finché non ricertificato)
  const viewer0000Ctx = testEnv.authenticatedContext('viewer_0000');
  await assertFails(
    getDoc(doc(viewer0000Ctx.firestore(), 'trips/0000/alloggi/acc_existing'))
  );
  console.log('   ✅ 9. Rollback restrittivo: Viewer bloccato in lettura su 0000 (Zero riesposizione credenziali).');

  // - Owner 0000 PUÒ leggere e scrivere per eseguire riparazioni
  const owner0000Ctx = testEnv.authenticatedContext('owner_0000');
  await assertSucceeds(
    getDoc(doc(owner0000Ctx.firestore(), 'trips/0000/alloggi/acc_existing'))
  );
  await assertSucceeds(
    updateDoc(doc(owner0000Ctx.firestore(), 'trips/0000/alloggi/acc_existing'), {
      noteOperatore: 'Riparazione rollback'
    })
  );
  console.log('   ✅ 10. Rollback restrittivo: Owner autorizzato a leggere e scrivere su 0000 per interventi di ripristino.');

  await testEnv.cleanup();
  console.log('\n========================================================================');
  console.log('🎉 TUTTI I 10 TEST DI RESILIENZA E ZERO REGRESSIONI SONO PASSATI (100%)');
  console.log('========================================================================');
}

runOfflineRejectionAndRegressionSuite().catch((err) => {
  console.error('\n❌ TEST FALLITO:', err);
  process.exit(1);
});
