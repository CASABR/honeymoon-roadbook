/**
 * test_security_gps_and_rate_limit.cjs
 *
 * Test di sicurezza mirati su Firestore Emulator per la release 1.5.10:
 * 1. Scritture GPS non autorizzate (Anonimo, Stranger, Viewer) -> PERMISSION_DENIED.
 * 2. Falsificazione del ruolo guida (spoofing holderUid/deviceId, furto titolarità) -> PERMISSION_DENIED.
 * 3. Accesso ai dati privati (private_credentials da Viewer/Stranger) -> PERMISSION_DENIED.
 * 4. Verifica eccezione 15 secondi su GPS:
 *    - Seconda scrittura <15s con status 'active' -> PERMISSION_DENIED.
 *    - Transizione da 'paused' ad 'active' (riattivazione manuale) -> SUCCESS.
 *    - Scrittura successiva <15s da 'active' ad 'active' -> Tassativamente PERMISSION_DENIED (impossibile aggirare il rate-limit).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, serverTimestamp, Timestamp } = require('firebase/firestore');

const root = path.resolve(__dirname, '..');
const rulesPath = path.join(root, 'firestore.rules');
const jar = process.env.HOUNIGO_FIRESTORE_EMULATOR_JAR || path.join(os.homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');
const EMULATOR_PORT = 8196;
const PROJECT_ID = 'demo-hounigo-gps-security';

const OWNER_UID = 'owner_nunzio_sec';
const COPILOT_UID = 'copilot_giusy_sec';
const VIEWER_UID = 'viewer_guest_sec';
const STRANGER_UID = 'stranger_hacker_sec';

(async () => {
  console.log('--- TEST DI SICUREZZA GPS LIVE & PROTEZIONE RATE-LIMIT (EMULATOR) ---');
  assert.ok(fs.existsSync(jar), `Jar emulatore mancante a ${jar}`);
  assert.ok(fs.existsSync(rulesPath), `firestore.rules mancante a ${rulesPath}`);

  const emu = spawn('java', [
    '-Duser.language=en', '-Duser.country=US',
    '-jar', jar,
    '--host', '127.0.0.1',
    '--port', String(EMULATOR_PORT),
    '--project_id', PROJECT_ID,
    '--rules', rulesPath
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });

  let ready = false;
  emu.stdout.on('data', d => { if (d.toString().includes('Dev App Server is now running')) ready = true; });

  let testEnv;
  try {
    for (let i = 0; i < 40; i++) {
      if (ready) break;
      await new Promise(r => setTimeout(r, 250));
    }
    assert.ok(ready, 'Emulatore Firestore non avviato su porta ' + EMULATOR_PORT);
    console.log(`✓ Firestore Emulator attivo su 127.0.0.1:${EMULATOR_PORT}`);

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { host: '127.0.0.1', port: EMULATOR_PORT }
    });

    // Inizializzazione contesto Admin (bypassa le regole per setup)
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const dbAdmin = adminContext.firestore();
      await setDoc(doc(dbAdmin, 'trips/0000'), {
        ownerUid: OWNER_UID,
        members: [OWNER_UID, COPILOT_UID, VIEWER_UID],
        title: 'Viaggio Sicurezza Test'
      });
      await setDoc(doc(dbAdmin, `trips/0000/members/${OWNER_UID}`), { uid: OWNER_UID, role: 'owner' });
      await setDoc(doc(dbAdmin, `trips/0000/members/${COPILOT_UID}`), { uid: COPILOT_UID, role: 'copilota' });
      await setDoc(doc(dbAdmin, `trips/0000/members/${VIEWER_UID}`), { uid: VIEWER_UID, role: 'viewer' });
      await setDoc(doc(dbAdmin, 'trips/0000/private_credentials/vault_secret_01'), {
        bookingCode: 'CONF-SECRET-999',
        pnr: 'PNR-999',
        updatedAt: Date.now()
      });
    });

    const dbOwner = testEnv.authenticatedContext(OWNER_UID).firestore();
    const dbCopilot = testEnv.authenticatedContext(COPILOT_UID).firestore();
    const dbViewer = testEnv.authenticatedContext(VIEWER_UID).firestore();
    const dbStranger = testEnv.authenticatedContext(STRANGER_UID).firestore();
    const dbAnon = testEnv.unauthenticatedContext().firestore();

    const devOwner = 'device_owner_iphone_sec';
    const devCopilot = 'device_copilot_iphone_sec';
    const devStranger = 'device_stranger_phone_sec';

    console.log('\n--- 1. SCENARI NEGATIVI: SCRITTURE GPS NON AUTORIZZATE ---');
    // 1.1 Utente anonimo tenta di scrivere su locations/current
    await assert.rejects(async () => {
      await setDoc(doc(dbAnon, 'live_feeds/0000/locations/current'), {
        lat: 35.6812, lng: 139.7671, accuracy: 10,
        updatedAt: serverTimestamp(), publisherDeviceId: 'dev_anon', status: 'active'
      });
    }, /PERMISSION_DENIED|permission-denied/);
    console.log('✅ [PASS] 1.1: Anonimo respinto da scritture GPS (PERMISSION_DENIED)');

    // 1.2 Utente estraneo (Stranger) tenta di scrivere su locations/current
    await assert.rejects(async () => {
      await setDoc(doc(dbStranger, 'live_feeds/0000/locations/current'), {
        lat: 35.6812, lng: 139.7671, accuracy: 10,
        updatedAt: serverTimestamp(), publisherDeviceId: devStranger, status: 'active'
      });
    }, /PERMISSION_DENIED|permission-denied/);
    console.log('✅ [PASS] 1.2: Stranger respinto da scritture GPS (PERMISSION_DENIED)');

    // 1.3 Viewer (membro semplice) tenta di scrivere lease o locations
    await assert.rejects(async () => {
      await setDoc(doc(dbViewer, 'live_feeds/0000/locations/current'), {
        lat: 35.6812, lng: 139.7671, accuracy: 10,
        updatedAt: serverTimestamp(), publisherDeviceId: 'dev_viewer', status: 'active'
      });
    }, /PERMISSION_DENIED|permission-denied/);
    console.log('✅ [PASS] 1.3: Viewer respinto da posizioni GPS (PERMISSION_DENIED)');

    console.log('\n--- 2. SCENARI NEGATIVI: FALSIFICAZIONE RUOLO GUIDA & SPOOFING ---');
    // Owner assegna il lease a se stesso
    await setDoc(doc(dbOwner, 'live_feeds/0000/gps_control/current'), {
      holderUid: OWNER_UID,
      holderDeviceId: devOwner,
      status: 'active',
      expiresAt: Timestamp.fromMillis(Date.now() + 3600000),
      updatedAt: serverTimestamp()
    });

    // 2.1 Copilota NON delegato tenta di pubblicare coordinate mentre il lease è dell'Owner
    await assert.rejects(async () => {
      await setDoc(doc(dbCopilot, 'live_feeds/0000/locations/current'), {
        lat: 35.6812, lng: 139.7671, accuracy: 10,
        updatedAt: serverTimestamp(), publisherDeviceId: devCopilot, status: 'active'
      });
    }, /PERMISSION_DENIED|permission-denied/);
    console.log('✅ [PASS] 2.1: Copilota senza delega respinto da pubblicazione GPS (PERMISSION_DENIED)');

    // 2.2 Attaccante impersona deviceId dell'Owner ma con UID estraneo
    await assert.rejects(async () => {
      await setDoc(doc(dbStranger, 'live_feeds/0000/locations/current'), {
        lat: 35.6812, lng: 139.7671, accuracy: 10,
        updatedAt: serverTimestamp(), publisherDeviceId: devOwner, status: 'active'
      });
    }, /PERMISSION_DENIED|permission-denied/);
    console.log('✅ [PASS] 2.2: Attaccante con deviceId spoofed respinto (PERMISSION_DENIED)');

    // 2.3 Copilota tenta di rubare la titolarità (ownerUid) del viaggio
    await assert.rejects(async () => {
      await updateDoc(doc(dbCopilot, 'trips/0000'), {
        ownerUid: COPILOT_UID
      });
    }, /PERMISSION_DENIED|permission-denied/);
    console.log('✅ [PASS] 2.3: Tentativo di alterare ownerUid bloccato (PERMISSION_DENIED)');

    console.log('\n--- 3. SCENARI NEGATIVI: ACCESSO AI DATI PRIVATI (CASSAFORTE) ---');
    // 3.1 Stranger tenta di leggere la cassaforte
    await assert.rejects(async () => {
      await getDoc(doc(dbStranger, 'trips/0000/private_credentials/vault_secret_01'));
    }, /PERMISSION_DENIED|permission-denied/);
    console.log('✅ [PASS] 3.1: Lettura cassaforte da Stranger bloccata (PERMISSION_DENIED)');

    // 3.2 Viewer tenta di leggere la cassaforte
    await assert.rejects(async () => {
      await getDoc(doc(dbViewer, 'trips/0000/private_credentials/vault_secret_01'));
    }, /PERMISSION_DENIED|permission-denied/);
    console.log('✅ [PASS] 3.2: Lettura cassaforte da Viewer bloccata (PERMISSION_DENIED)');

    // 3.3 Copilota privilegiato può accedere legittimamente alla cassaforte
    const copilotDoc = await getDoc(doc(dbCopilot, 'trips/0000/private_credentials/vault_secret_01'));
    assert.strictEqual(copilotDoc.exists(), true);
    assert.strictEqual(copilotDoc.data().bookingCode, 'CONF-SECRET-999');
    console.log('✅ [PASS] 3.3: Copilota verificato accede regolarmente alla cassaforte');

    console.log('\n--- 4. VERIFICA ECCEZIONE 15 SECONDI & RIGOROSO RATE-LIMIT ---');
    // 4.1 Owner (guida legittima) pubblica la prima posizione
    await setDoc(doc(dbOwner, 'live_feeds/0000/locations/current'), {
      lat: 35.6812, lng: 139.7671, accuracy: 10,
      city: 'Tokyo', country: 'Japan',
      updatedAt: serverTimestamp(), publisherDeviceId: devOwner, status: 'active'
    });
    console.log('✅ [PASS] 4.1: Prima scrittura posizione guida attiva riuscita');

    // 4.2 Owner tenta SUBITO una seconda scrittura (< 15s) in status 'active' con stesso deviceId: BLOCCATA
    await assert.rejects(async () => {
      await updateDoc(doc(dbOwner, 'live_feeds/0000/locations/current'), {
        lat: 35.6815, lng: 139.7675, accuracy: 10,
        city: 'Tokyo', country: 'Japan',
        updatedAt: serverTimestamp(), publisherDeviceId: devOwner, status: 'active'
      });
    }, /PERMISSION_DENIED|permission-denied/);
    console.log('✅ [PASS] 4.2: Rate-limit 15s su active confermato: seconda scrittura respinta (PERMISSION_DENIED)');

    // 4.3 Owner mette in pausa la condivisione (aggiornamento del lease e location a paused)
    await updateDoc(doc(dbOwner, 'live_feeds/0000/gps_control/current'), {
      status: 'paused',
      updatedAt: serverTimestamp()
    });
    await updateDoc(doc(dbOwner, 'live_feeds/0000/locations/current'), {
      status: 'paused',
      updatedAt: serverTimestamp()
    });
    console.log('✅ [PASS] 4.3: Transizione a paused completata');

    // 4.4 Riattivazione da paused ad active: l'eccezione resource.data.status != 'active'
    // consente la riattivazione immediata (senza dover attendere 15s dalla pausa)
    await updateDoc(doc(dbOwner, 'live_feeds/0000/gps_control/current'), {
      status: 'active',
      updatedAt: serverTimestamp()
    });
    await updateDoc(doc(dbOwner, 'live_feeds/0000/locations/current'), {
      lat: 35.6820, lng: 139.7680, accuracy: 10,
      city: 'Tokyo', country: 'Japan',
      updatedAt: serverTimestamp(), publisherDeviceId: devOwner, status: 'active'
    });
    console.log('✅ [PASS] 4.4: Riattivazione da paused ad active riuscita (eccezione attiva per sblocco)');

    // 4.5 SUBITO DOPO la riattivazione, la guida tenta una scrittura ravvicinata (< 15s) in status 'active':
    // Poiché resource.data.status è ORA 'active', la regola IMPONE di nuovo updatedAt <= request.time - 15s!
    await assert.rejects(async () => {
      await updateDoc(doc(dbOwner, 'live_feeds/0000/locations/current'), {
        lat: 35.6825, lng: 139.7685, accuracy: 10,
        city: 'Tokyo', country: 'Japan',
        updatedAt: serverTimestamp(), publisherDeviceId: devOwner, status: 'active'
      });
    }, /PERMISSION_DENIED|permission-denied/);
    console.log('✅ [PASS] 4.5: Impossibilità di aggirare il limite: successiva scrittura active respinta (PERMISSION_DENIED)');

    console.log('\n====================================================================');
    console.log('✓✓✓ TUTTI I 12 TEST DI SICUREZZA GPS E RATE-LIMITING SUPERATI! ✓✓✓');
    console.log('====================================================================');
  } finally {
    if (testEnv) await testEnv.cleanup();
    emu.kill('SIGTERM');
  }
})();
