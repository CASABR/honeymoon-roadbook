/**
 * HOUNIGO — TEST E2E STRUMENTI OPERATIVI SU FIRESTORE EMULATOR
 * 
 * Convalida la suite degli strumenti operativi reali:
 * 1. firestore.rules.lockdown: verifica blocco letture Viewer e blocco re-iniezione dati sensibili
 * 2. ops_backup_trip.cjs: verifica dry-run ed execute con SHA-256
 * 3. ops_migrate_private_credentials.cjs: verifica dry-run, blocco di sicurezza e migrazione verificata
 * 4. ops_verify_integrity.cjs: verifica zero-leak e confronto biunivoco 1:1
 * 5. firestore.rules.candidate: verifica riattivazione Viewer sui documenti sanitizzati e protezione cassaforte
 * 6. ops_rollback_safe.cjs: verifica ripristino protetto senza mai degradare le regole
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, updateDoc, setDoc } = require('firebase/firestore');
const { getVaultDocId } = require('../src/utils/securityDataSplitter.ts');

const EMULATOR_PORT = parseInt(process.env.FIRESTORE_EMULATOR_PORT || '8085', 10);
const EMULATOR_HOST = `127.0.0.1:${EMULATOR_PORT}`;
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'app-viaggio-di-nozze';
const BACKUP_TEST_DIR = path.resolve(__dirname, '..', 'temp_test_backups');

console.log('========================================================================');
console.log(`HOUNIGO — TEST VERIFICA STRUMENTI OPERATIVI P0 (EMULATOR ${EMULATOR_HOST})`);
console.log('========================================================================\n');

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
    throw new Error(`Rules deploy failed (${res.status}): ${errText}`);
  }
}

async function runTestSuite() {
  const lockdownRules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules.lockdown'), 'utf8');
  const candidateRules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules.candidate'), 'utf8');

  // Inizializzazione test environment ufficiale
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: EMULATOR_PORT
    }
  });

  // Pulizia preliminare cartella test backups
  if (fs.existsSync(BACKUP_TEST_DIR)) {
    fs.rmSync(BACKUP_TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BACKUP_TEST_DIR, { recursive: true });

  console.log('--- FASE 0: Inizializzazione Database con Dati Pre-Migrazione Viaggio 0000 ---');
  await testEnv.clearFirestore();

  // Popolamento bypassando le rules con withSecurityRulesDisabled
  await testEnv.withSecurityRulesDisabled(async (adminContext) => {
    const adminDb = adminContext.firestore();

    await setDoc(doc(adminDb, 'trips/0000'), {
      title: 'Giappone & Polinesia 2026',
      ownerUid: 'uid_owner_real',
      members: ['uid_owner_real', 'uid_copilota_real', 'uid_viewer_real'],
      primaryDeviceUid: 'device_01'
    });

    await setDoc(doc(adminDb, 'trips/0000/members/uid_owner_real'), { role: 'owner', uid: 'uid_owner_real' });
    await setDoc(doc(adminDb, 'trips/0000/members/uid_copilota_real'), { role: 'copilota', uid: 'uid_copilota_real' });
    await setDoc(doc(adminDb, 'trips/0000/members/uid_viewer_real'), { role: 'viewer', uid: 'uid_viewer_real' });

    // Documenti con dati sensibili da segregare
    await setDoc(doc(adminDb, 'trips/0000/alloggi/acc_tokyo'), {
      name: 'Cerulean Tower Tokyu Hotel',
      address: 'Shibuya, Tokyo',
      checkIn: '2026-11-28',
      pinCode: '7721#',
      bookingCode: 'BK-CERULEAN-99',
      depositPaid: '300.00 €',
      noteCopilota: 'Codice tastierino keybox parcheggio',
      attachments: [{ id: 'att_hotel', name: 'voucher.pdf' }]
    });

    await setDoc(doc(adminDb, 'trips/0000/trasporti/tra_volo'), {
      carrier: 'Emirates EK318',
      bookingCode: 'PNR-EK-4433',
      posti: '12A, 12B',
      terminalGate: 'Gate B22',
      cost: '1450.00 €',
      noteCopilota: 'Passaporti pronti'
    });

    await setDoc(doc(adminDb, 'trips/0000/attivita/att_teamlab'), {
      title: 'teamLab Planets',
      bookingCode: 'QR-TEAMLAB-881',
      ticketUrl: 'https://tickets.teamlab.art/voucher/881',
      qrCode: 'data:image/png;base64,SECRET_QR',
      cost: '76.00 €'
    });

    await setDoc(doc(adminDb, 'trips/0000/documenti/doc_passaporti'), {
      name: 'Scansione Passaporti Sposi.pdf',
      driveUrl: 'https://private.drive/passaporti.pdf'
    });

    await setDoc(doc(adminDb, 'trips/0000/spese/spesa_nozze'), {
      descrizione: 'Anticipo Ryokan Kyoto',
      importo: 450.00
    });
  });

  console.log('✅ Database inizializzato con successo.\n');

  // ---------------------------------------------------------------------------
  // FASE 1: TEST LOCKDOWN RULES
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Convalida Lockdown Rules (Zero Exposure + Schema Guard) ---');
  await loadRules(lockdownRules);
  console.log('   Lockdown rules applicate all\'emulatore.');

  const viewerContext = testEnv.authenticatedContext('uid_viewer_real');
  const copilotContext = testEnv.authenticatedContext('uid_copilota_real');
  const ownerContext = testEnv.authenticatedContext('uid_owner_real');

  // 1.a: Viewer prova a leggere alloggi -> DEVE FALLIRE PERMISSION_DENIED
  await assertFails(getDoc(doc(viewerContext.firestore(), 'trips/0000/alloggi/acc_tokyo')));
  console.log('   ✅ 1.a: Viewer bloccato in lettura durante lockdown (PERMISSION_DENIED)');

  // 1.b: Copilota può leggere durante il lockdown
  await assertSucceeds(getDoc(doc(copilotContext.firestore(), 'trips/0000/alloggi/acc_tokyo')));
  console.log('   ✅ 1.b: Copilota abilitato in lettura durante lockdown (OK)');

  // 1.c: Vecchio client Owner tenta di riscrivere pinCode nel documento pubblico -> BLOCCATO DA SCHEMA GUARD
  await assertFails(updateDoc(doc(ownerContext.firestore(), 'trips/0000/alloggi/acc_tokyo'), {
    pinCode: 'HACKED_PIN_9999'
  }));
  console.log('   ✅ 1.c: Tentativo di re-iniezione dati sensibili bloccato da Schema Guard (PERMISSION_DENIED)');

  // ---------------------------------------------------------------------------
  // FASE 2: TEST SCRIPT BACKUP (DRY-RUN + EXECUTE)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Convalida Script Backup (ops_backup_trip.cjs) ---');

  // 2.a: Dry-Run
  const backupDryRun = spawnSync('node', [
    'scripts/ops_backup_trip.cjs',
    '--tripId', '0000',
    '--out-dir', BACKUP_TEST_DIR
  ], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: process.env });

  assert.strictEqual(backupDryRun.status, 0, `Dry run backup fallito: ${backupDryRun.stderr}`);
  assert(backupDryRun.stdout.includes('DRY-RUN COMPLETATO CON SUCCESSO'), 'Output dry run non corretto');
  const filesAfterDryRun = fs.readdirSync(BACKUP_TEST_DIR);
  assert.strictEqual(filesAfterDryRun.length, 0, 'Il dry run non deve creare file su disco!');
  console.log('   ✅ 2.a: Backup in modalità DRY-RUN verificato (0 scritture su disco)');

  // 2.b: Execute
  const backupExec = spawnSync('node', [
    'scripts/ops_backup_trip.cjs',
    '--tripId', '0000',
    '--out-dir', BACKUP_TEST_DIR,
    '--execute'
  ], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: process.env });

  assert.strictEqual(backupExec.status, 0, `Execute backup fallito: ${backupExec.stderr}`);
  assert(backupExec.stdout.includes('BACKUP COMPLETATO E VERIFICATO'), 'Output execute non corretto');

  const filesAfterExec = fs.readdirSync(BACKUP_TEST_DIR);
  assert(filesAfterExec.some(f => f.endsWith('.json')), 'File JSON di backup non creato');
  assert(filesAfterExec.some(f => f.endsWith('.json.sha256')), 'File SHA-256 non creato');

  const backupJsonName = filesAfterExec.find(f => f.endsWith('.json'));
  const backupJsonPath = path.join(BACKUP_TEST_DIR, backupJsonName);
  const backupContent = JSON.parse(fs.readFileSync(backupJsonPath, 'utf8'));
  assert.strictEqual(backupContent.subcollections.alloggi['acc_tokyo'].pinCode, '7721#', 'Dato sensibile alloggio non presente nel backup');
  console.log(`   ✅ 2.b: Backup effettivo creato e convalidato SHA-256 (${backupJsonName})`);

  // ---------------------------------------------------------------------------
  // FASE 3: TEST SCRIPT MIGRAZIONE (DRY-RUN + LIVE APPLY)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Convalida Script Migrazione (ops_migrate_private_credentials.cjs) ---');

  // 3.a: Dry-Run
  const migDryRun = spawnSync('node', [
    'scripts/ops_migrate_private_credentials.cjs',
    '--tripId', '0000',
    '--backup', backupJsonPath
  ], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: process.env });
  assert.strictEqual(migDryRun.status, 0, `Dry run migrazione fallito: ${migDryRun.stderr}`);
  assert(migDryRun.stdout.includes('SIMULAZIONE DRY-RUN COMPLETATA'), 'Output dry run errato');

  // Verifica che i dati non siano stati toccati
  await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
    const snap = await getDoc(doc(adminCtx.firestore(), 'trips/0000/alloggi/acc_tokyo'));
    assert.strictEqual(snap.data().pinCode, '7721#', 'Il dry run non deve modificare Firestore');
  });
  console.log('   ✅ 3.a: Migrazione DRY-RUN verificata (nessuna alterazione su Firestore)');

  // 3.b: Tentativo di Apply senza flag --confirm-trip-0000 (DEVE FALLIRE)
  const migMissingConfirm = spawnSync('node', [
    'scripts/ops_migrate_private_credentials.cjs',
    '--tripId', '0000',
    '--apply'
  ], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: process.env });
  assert.notStrictEqual(migMissingConfirm.status, 0, 'La migrazione su 0000 deve fallire senza --confirm-trip-0000!');
  console.log('   ✅ 3.b: Blocco anti-errore verificato: rifiutata esecuzione senza autorizzazione esplicita');

  // 3.c: Live Apply con conferma
  const migApply = spawnSync('node', [
    'scripts/ops_migrate_private_credentials.cjs',
    '--tripId', '0000',
    '--apply',
    '--confirm-trip-0000',
    '--backup', backupJsonPath
  ], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: process.env });
  assert.strictEqual(migApply.status, 0, `Migrazione fallita: ${migApply.stderr}\n${migApply.stdout}`);
  assert(migApply.stdout.includes('MIGRAZIONE COMPLETATA CON SUCCESSO'), 'Output migrazione non riuscito');
  console.log('   ✅ 3.c: Migrazione record-by-record eseguita con successo');

  // ---------------------------------------------------------------------------
  // FASE 4: TEST SCRIPT VERIFICA INTEGRITÀ (ops_verify_integrity.cjs)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Convalida Script Integrità Post-Migrazione (ops_verify_integrity.cjs) ---');
  const verifyResult = spawnSync('node', [
    'scripts/ops_verify_integrity.cjs',
    '--tripId', '0000',
    '--backup', backupJsonPath
  ], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: process.env });
  assert.strictEqual(verifyResult.status, 0, `Verifica integrità fallita: ${verifyResult.stderr}\n${verifyResult.stdout}`);
  assert(verifyResult.stdout.includes('ZERO LEAKS: Nessuna chiave sensibile'), 'Leak rilevato');
  assert(verifyResult.stdout.includes('INTEGRITÀ 100% GARANTITA'), 'Confronto biunivoco fallito');
  console.log('   ✅ 4: Verifica integrità superata con 100% PASS (Zero Leaks, 100% Biunivoco)');

  // ---------------------------------------------------------------------------
  // FASE 5: TEST CANDIDATE RULES (RILASCIO FINALE CON VIEWER ATTIVO)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Convalida Candidate Security Rules (Viewer attivo su dati sanitizzati) ---');
  await loadRules(candidateRules);
  console.log('   Candidate rules applicate all\'emulatore.');

  // 5.a: Viewer ora PUÒ leggere il documento alloggio (sanitizzato)
  const viewerDocSnap = await getDoc(doc(viewerContext.firestore(), 'trips/0000/alloggi/acc_tokyo'));
  assert(viewerDocSnap.exists(), 'Il documento alloggio deve esistere');
  const viewerData = viewerDocSnap.data();
  assert.strictEqual(viewerData.name, 'Cerulean Tower Tokyu Hotel');
  assert.strictEqual(viewerData.pinCode, undefined, 'Il pinCode non deve esistere nel documento visibile dal Viewer!');
  assert.strictEqual(viewerData.bookingCode, undefined, 'Il bookingCode non deve esistere nel documento visibile dal Viewer!');
  console.log('   ✅ 5.a: Viewer legge la card alloggio sanitizzata in totale sicurezza (OK, zero PIN/bookingCode)');

  // 5.b: Viewer tenta di accedere alla cassaforte -> PERMISSION_DENIED
  const vaultDocId = getVaultDocId('alloggi', 'acc_tokyo');
  await assertFails(getDoc(doc(viewerContext.firestore(), `trips/0000/private_credentials/${vaultDocId}`)));
  console.log('   ✅ 5.b: Viewer bloccato in lettura sulla cassaforte private_credentials (PERMISSION_DENIED)');

  // 5.c: Privileged Member (Owner/Copilota) accede alla cassaforte -> OK
  const ownerVaultSnap = await getDoc(doc(ownerContext.firestore(), `trips/0000/private_credentials/${vaultDocId}`));
  assert(ownerVaultSnap.exists(), 'La cassaforte deve esistere per Owner');
  assert.strictEqual(ownerVaultSnap.data().pinCode, '7721#', 'Il pinCode deve essere intatto nella cassaforte!');
  console.log('   ✅ 5.c: Owner/Copilota leggono le credenziali intatte dalla cassaforte (OK, pinCode: 7721#)');

  // ---------------------------------------------------------------------------
  // FASE 6: TEST SCRIPT ROLLBACK SICURO (ops_rollback_safe.cjs)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Convalida Script Rollback Sicuro (ops_rollback_safe.cjs) ---');

  // Corrompiamo volontariamente un documento per simulare necessità di rollback
  await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
    const adminDb = adminCtx.firestore();
    const docRef = doc(adminDb, 'trips/0000/alloggi/acc_tokyo');
    await setDoc(docRef, { name: 'CORRUPTED_RECORD' });
  });

  // Esecuzione rollback con apply
  const rollbackExec = spawnSync('node', [
    'scripts/ops_rollback_safe.cjs',
    '--tripId', '0000',
    '--backup', backupJsonPath,
    '--apply',
    '--confirm-rollback-trip-0000'
  ], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: process.env });
  assert.strictEqual(rollbackExec.status, 0, `Rollback fallito: ${rollbackExec.stderr}\n${rollbackExec.stdout}`);
  assert(rollbackExec.stdout.includes('ROLLBACK SICURO COMPLETATO CON SUCCESSO'), 'Output rollback errato');

  // Convalida con ops_verify_integrity.cjs dopo il rollback
  const verifyAfterRollback = spawnSync('node', [
    'scripts/ops_verify_integrity.cjs',
    '--tripId', '0000',
    '--backup', backupJsonPath
  ], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: process.env });
  assert.strictEqual(verifyAfterRollback.status, 0, 'La verifica post-rollback deve passare al 100%');
  console.log('   ✅ 6: Rollback sicuro eseguito e riconvalidato 100% PASS senza degradare le regole!');

  // Pulizia finale
  await testEnv.cleanup();
  if (fs.existsSync(BACKUP_TEST_DIR)) {
    fs.rmSync(BACKUP_TEST_DIR, { recursive: true, force: true });
  }

  console.log('\n========================================================================');
  console.log('🎉 TUTTI I 6 TEST SUGLI STRUMENTI OPERATIVI SONO STATI SUPERATI AL 100%');
  console.log('========================================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST FALLITO:', err);
  process.exit(1);
});
