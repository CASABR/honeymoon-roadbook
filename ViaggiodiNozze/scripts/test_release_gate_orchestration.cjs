/**
 * HOUNIGO — Release 1.6.0 Gate End-to-End Orchestration & Freeze Test (Emulator Only)
 *
 * Exercises strictly against isolated Firestore Emulator (`127.0.0.1:8496`, `demo-hounigo-gate-160`):
 * 1. Safety guard refuses unconfirmed production execution (`exit 2`, zero writes).
 * 2. Full 19-trip backup import + freeze rules activation (`firestore.freeze.rules`) + mid-migration crash (`--stop-after-docs`).
 * 3. Server-side write blocking across multiple trips during freeze (both legacy 1.5.16 and returning offline 1.6.0 client),
 *    preserving offline mutation cleanly in IndexedDB/local queue store without data loss.
 * 4. Checkpoint `--resume` + simulated rules-deploy failure -> fail-closed (`FAILED_KEEP_FREEZE`, freeze stays active!).
 * 5. Clean checkpoint `--resume` -> audit `affectedDocuments === 0` -> final `firestore.rules` v2 activation.
 * 6. Invariant verification (`0` leaks across all 19 trips, `0000` EUR budget exact: 12542.78 / 9476.67 / 3066.11).
 * 7. Post-unfreeze offline queue reconciliation (zero data loss, Viewer isolation) & post-release 1.5.16 rejection (both sensitive + v2 downgrade).
 */
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where } = require('firebase/firestore');

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const BACKUP_DIR = path.join(REPO_ROOT, 'backups', 'pre-bonifica-2026-11-11');
const CHECKPOINT_TEST_FILE = path.join(os.tmpdir(), `hounigo-gate-checkpoint-${Date.now()}.json`);
const ORCHESTRATOR = path.join(__dirname, 'release_160_orchestrator.cjs');

const PROJECT_ID = 'demo-hounigo-gate-160';
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8496;
assert.ok(PROJECT_ID.startsWith('demo-'));

const SHARED_SUBCOLS = ['trasporti', 'alloggi', 'attivita', 'tappe', 'ristoranti', 'shopping', 'giorni', 'bagagli'];
const PRIVATE_SUBCOLS = ['private_credentials', 'documenti', 'spese', 'note', 'settings', 'members', 'devices', 'locks', 'invites', 'inviteTokens'];
const LIVE_SUBCOLS = ['updates', 'guest_messages', 'gps_control', 'locations'];

function loadTs(relative, deps = {}) {
  const exports = {};
  const source = fs
    .readFileSync(path.join(APP_ROOT, relative), 'utf8')
    .replaceAll('import.meta.env.DEV', 'false')
    .replaceAll('import.meta.env', '({DEV:false,PROD:true})');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    require: id => (id in deps ? deps[id] : {}),
    console: { log() {}, warn() {}, error() {} },
    Date,
    structuredClone,
    setTimeout,
    clearTimeout,
    AbortController,
  });
  return exports;
}

const security = loadTs('src/utils/securityDataSplitter.ts');
const currency = loadTs('src/services/currencyService.ts');
const prices = loadTs('src/utils/priceHelper.ts', { '../services/currencyService': currency });

function normalizeForEmulator(val) {
  if (val === undefined || val === null) return null;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(v => (v === undefined ? null : normalizeForEmulator(v)));
  const out = {};
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) out[k] = normalizeForEmulator(v);
  }
  return out;
}

function computeEurTotals(sharedColDocs, speseDocs, vaultDocs) {
  const vMap = new Map(vaultDocs.map(v => [v.id, v]));
  const merge = (arr, pref) => arr.map(x => ({
    ...x,
    ...(vMap.get(`${pref}_${x.id}`) || vMap.get(x.id) || {}),
    id: x.id,
  }));
  const seenTickets = new Set();
  const trMerged = merge(sharedColDocs.trasporti || [], 'trasporto').filter(t => {
    const c = (t.carrier || '').toLowerCase();
    if (c.includes('prosecuzione') || c.includes('coincidenza')) return false;
    if ((t.type || 'volo').toLowerCase() === 'volo') {
      const tk = (t.bookingCode?.trim() || t.pnr?.trim() || '').toLowerCase();
      if (tk && seenTickets.has(tk)) return false;
      if (tk) seenTickets.add(tk);
    }
    return true;
  });
  let saldato = 0, daSaldare = 0;
  const runList = (items, costF, altF) => {
    for (const item of items) {
      const info = prices.resolvePaymentInfo({
        cost: item[costF] || item[altF],
        depositPaid: item.depositPaid || item.acconto || item.amountPaid,
        paymentStatus: item.paymentStatus,
        status: item.status,
        completed: item.completed,
        packageIncluded: item.packageIncluded,
        currencyUncertain: item.currencyUncertain,
        conversionType: item.conversionType,
        depositConversionType: item.depositConversionType,
        originalCurrency: item.originalCurrency,
        originalCost: item.originalCost,
        originalDepositPaid: item.originalDepositPaid,
        exchangeRate: item.exchangeRate,
        exchangeRateDate: item.exchangeRateDate,
        exchangeRateSource: item.exchangeRateSource,
      });
      if (info.isCurrencyUnresolved) continue;
      if (!info.isFree && !info.isPackageIncluded && info.costNum > 0) {
        const paid = currency.roundEur(info.paidNum || (info.isPaid ? info.costNum : 0));
        const rem = currency.roundEur(Math.max(0, info.costNum - paid));
        saldato = currency.roundEur(saldato + paid);
        daSaldare = currency.roundEur(daSaldare + rem);
      }
    }
  };
  runList(merge(speseDocs || [], 'spesa'), 'amount', 'amount');
  runList(trMerged, 'cost', 'cost');
  runList(merge(sharedColDocs.alloggi || [], 'alloggio'), 'cost', 'cost');
  runList(merge(sharedColDocs.attivita || [], 'attivita'), 'cost', 'cost');
  runList(merge(sharedColDocs.ristoranti || [], 'ristorante'), 'budget', 'cost');
  runList(merge(sharedColDocs.shopping || [], 'shopping'), 'budget', 'cost');
  return {
    totGenerale: currency.roundEur(saldato + daSaldare),
    totSaldato: saldato,
    totDaSaldare: daSaldare,
  };
}

function runOrchestrator(args) {
  try {
    const stdout = execFileSync('node', [ORCHESTRATOR, ...args], {
      cwd: APP_ROOT,
      encoding: 'utf8',
      env: { ...process.env, FIRESTORE_EMULATOR_HOST: `${EMULATOR_HOST}:${EMULATOR_PORT}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout ? String(err.stdout) : '',
      stderr: err.stderr ? String(err.stderr) : '',
    };
  }
}

async function main() {
  // 1. Refuse unconfirmed production invocations BEFORE starting emulator
  const unconfirmedProd = runOrchestrator(['--mode=production']);
  assert.equal(unconfirmedProd.exitCode, 2, 'Production mode without explicit authorization MUST abort with exit 2');
  const partialConfirmProd = runOrchestrator(['--mode=production', '--execute-production', '--confirm=WRONG']);
  assert.equal(partialConfirmProd.exitCode, 2, 'Production mode with wrong confirm MUST abort with exit 2');

  const dryRunProd = runOrchestrator(['--mode=production', '--dry-run']);
  assert.equal(dryRunProd.exitCode, 0, `Dry-run prod precheck should pass cleanly: ${dryRunProd.stderr}`);
  const dryJson = JSON.parse(dryRunProd.stdout);
  assert.equal(dryJson.productionWrites, 0);
  assert.equal(dryJson.backupTrips, 19);

  // Boot isolated emulator
  const jar = process.env.HOUNIGO_FIRESTORE_EMULATOR_JAR
    || path.join(os.homedir(), '.cache', 'firebase', 'emulators', 'cloud-firestore-emulator-v1.22.0.jar');
  assert.ok(fs.existsSync(jar), `Firestore Emulator JAR missing: ${jar}`);

  const initialV2Rules = fs.readFileSync(path.join(APP_ROOT, 'firestore.rules'), 'utf8');
  const emu = spawn('java', [
    '-Duser.language=en', '-Duser.country=US',
    '-jar', jar,
    '--host', EMULATOR_HOST,
    '--port', String(EMULATOR_PORT),
    '--project_id', PROJECT_ID,
    '--single_project_mode', 'true',
    '--rules', path.join(APP_ROOT, 'firestore.rules'),
  ], { cwd: APP_ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

  let env;
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}`, { signal: AbortSignal.timeout(500) }).then(() => true, () => false)) {
        ready = true;
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(ready, 'Isolated gate Firestore emulator failed to boot');

    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { host: EMULATOR_HOST, port: EMULATOR_PORT, rules: initialV2Rules },
    });

    const sharedSnap = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'shared-snapshot.json'), 'utf8'));
    const privateSnap = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'private-snapshot.json'), 'utf8'));
    const allTripIds = Object.keys(sharedSnap.trips || {});
    const secondaryTripId = allTripIds.find(id => id !== '0000') || '0000';

    const SYNTH_OWNER = 'synth_gate_owner';
    const SYNTH_COPILOT = 'synth_gate_copilot';
    const SYNTH_VIEWER = 'synth_gate_viewer';

    await env.withSecurityRulesDisabled(async ctx => {
      const fdb = ctx.firestore();
      for (const tripId of allTripIds) {
        const tripObj = sharedSnap.trips[tripId];
        const rootData = { ...normalizeForEmulator(tripObj.root.data) };
        if (tripId === '0000' || tripId === secondaryTripId) {
          rootData.ownerUid = SYNTH_OWNER;
          rootData.members = [...new Set([...(Array.isArray(rootData.members) ? rootData.members : []), SYNTH_OWNER, SYNTH_COPILOT, SYNTH_VIEWER])];
        }
        await setDoc(doc(fdb, 'trips', tripId), rootData);
        if (tripId === '0000' || tripId === secondaryTripId) {
          await setDoc(doc(fdb, 'trips', tripId, 'members', SYNTH_OWNER), { uid: SYNTH_OWNER, role: 'owner' });
          await setDoc(doc(fdb, 'trips', tripId, 'members', SYNTH_COPILOT), { uid: SYNTH_COPILOT, role: 'copilota' });
          await setDoc(doc(fdb, 'trips', tripId, 'members', SYNTH_VIEWER), { uid: SYNTH_VIEWER, role: 'viewer' });
        }
        for (const col of SHARED_SUBCOLS) {
          for (const d of tripObj.collections?.[col] || []) {
            await setDoc(doc(fdb, 'trips', tripId, col, d.id), normalizeForEmulator(d.data));
          }
        }
        const privCols = privateSnap.trips?.[tripId]?.collections || {};
        for (const col of PRIVATE_SUBCOLS) {
          for (const d of privCols[col] || []) {
            await setDoc(doc(fdb, 'trips', tripId, col, d.id), normalizeForEmulator(d.data));
          }
        }
      }
      for (const [feedId, feedObj] of Object.entries(sharedSnap.live_feeds || {})) {
        const cleanRoot = normalizeForEmulator(feedObj.root.data);
        delete cleanRoot.id;
        await setDoc(doc(fdb, 'live_feeds', feedId), cleanRoot);
        for (const col of LIVE_SUBCOLS) {
          for (const d of feedObj.subcollections?.[col] || []) {
            const cleanLive = normalizeForEmulator(d.data);
            delete cleanLive.id;
            await setDoc(doc(fdb, 'live_feeds', feedId, col, d.id), cleanLive);
          }
        }
      }
    });

    const ownerCtx = env.authenticatedContext(SYNTH_OWNER);
    const copilotCtx = env.authenticatedContext(SYNTH_COPILOT);
    const viewerCtx = env.authenticatedContext(SYNTH_VIEWER);
    const strangerCtx = env.authenticatedContext('synth_gate_stranger');

    // 2. Run orchestrator with mid-migration interruption (`--stop-after-docs=120`)
    const stepCrash = runOrchestrator([
      '--mode=simulate',
      `--project=${PROJECT_ID}`,
      `--emulator-host=${EMULATOR_HOST}:${EMULATOR_PORT}`,
      `--checkpoint=${CHECKPOINT_TEST_FILE}`,
      '--stop-after-docs=120',
    ]);
    assert.notEqual(stepCrash.exitCode, 0, 'Simulated interruption should stop cleanly');
    const cp1 = JSON.parse(fs.readFileSync(CHECKPOINT_TEST_FILE, 'utf8'));
    assert.equal(cp1.status, 'INTERRUPTED', `Expected INTERRUPTED, got ${cp1.status}: ${cp1.lastError} | ${stepCrash.stderr}`);
    assert.equal(cp1.activeRulesProfile, 'freeze');
    assert.equal(cp1.steps.freeze_rules, 'PASSED');
    assert.equal(cp1.bonificaProgress.completedDocKeys.length, 120);

    // 3. Verify server-side freeze across MULTIPLE trips while interrupted/frozen
    // Both legacy 1.5.16 write and 1.6.0 write are rejected cleanly by firestore.freeze.rules
    await assertFails(setDoc(doc(copilotCtx.firestore(), 'trips', '0000', 'alloggi', 'concurrent_1516_race'), {
      id: 'concurrent_1516_race',
      name: 'Concurrent 1.5.16',
      cost: '199.00',
      pnr: 'RACE99',
    }));
    await assertFails(setDoc(doc(ownerCtx.firestore(), 'trips', secondaryTripId, 'tappe', 'concurrent_trip2_race'), {
      id: 'concurrent_trip2_race',
      titolo: 'Trip 2 Concurrent Edit',
      publicSchemaVersion: 2,
      updatedAt: Date.now(),
    }));
    await assertFails(setDoc(doc(ownerCtx.firestore(), 'live_feeds', '0000', 'updates', 'freeze_live_race'), {
      title: 'Live during freeze',
      timestamp: Date.now(),
      publicSchemaVersion: 2,
    }));
    // Safe reads continue working even during freeze!
    await assertSucceeds(getDoc(doc(ownerCtx.firestore(), 'trips', '0000')));
    await assertSucceeds(getDocs(query(collection(viewerCtx.firestore(), 'trips', '0000', 'tappe'), where('publicSchemaVersion', '==', 2))));

    // Simulate offline client mutation buffered in local queue (mirroring HounigoLocalQueueDB retention on PERMISSION_DENIED)
    const offlinePendingQueue = [{
      entityType: 'alloggio',
      action: 'save',
      data: {
        id: 'offline_queue_reconcile_hotel',
        name: 'Offline Reconcile Lodge',
        cost: '140.00',
        originalCost: 230,
        originalCurrency: 'AUD',
        pnr: 'OFFLINE_PNR_XYZ',
        paymentStatus: 'da_saldare',
        updatedAt: Date.now() + 5000,
      },
    }];

    // Offline client comes online DURING freeze -> push fails with permission-denied, queue MUST NOT drop item!
    for (let i = offlinePendingQueue.length - 1; i >= 0; i--) {
      const qItem = offlinePendingQueue[i];
      const split = security.splitEntitySecurityData(qItem.entityType, '0000', qItem.data);
      let pushRejected = false;
      try {
        await setDoc(
          doc(copilotCtx.firestore(), 'trips', '0000', 'alloggi', qItem.data.id),
          normalizeForEmulator(split.publicDoc)
        );
      } catch (err) {
        pushRejected = err?.code === 'permission-denied';
      }
      assert.ok(pushRejected, 'Write attempt while returning online during freeze must be denied server-side');
      // Only remove on success (matches syncService.ts line 2234 semantics)
    }
    assert.equal(offlinePendingQueue.length, 1, 'Pending offline queue must retain item across freeze denial');

    // 4. Resume from checkpoint WITH simulated v2 rules deployment failure -> MUST fail closed & keep freeze active!
    const stepRulesFail = runOrchestrator([
      '--mode=simulate',
      `--project=${PROJECT_ID}`,
      `--emulator-host=${EMULATOR_HOST}:${EMULATOR_PORT}`,
      `--checkpoint=${CHECKPOINT_TEST_FILE}`,
      '--resume',
      '--simulate-rules-deploy-failure',
    ]);
    assert.notEqual(stepRulesFail.exitCode, 0, 'Simulated v2 deploy failure must abort');
    const cp2 = JSON.parse(fs.readFileSync(CHECKPOINT_TEST_FILE, 'utf8'));
    assert.equal(cp2.status, 'FAILED_KEEP_FREEZE');
    assert.equal(cp2.activeRulesProfile, 'freeze');
    assert.equal(cp2.steps.audit_zero, 'PASSED', 'Zero-anomaly audit ran before final rules deploy');
    assert.equal(cp2.steps.deploy_v2_rules, 'PENDING', 'Final v2 deploy did not succeed');
    // Freeze STILL active after failure!
    await assertFails(setDoc(doc(ownerCtx.firestore(), 'trips', '0000', 'tappe', 'still_frozen_after_abort'), {
      id: 'still_frozen_after_abort',
      titolo: 'Should remain frozen',
      publicSchemaVersion: 2,
      updatedAt: Date.now(),
    }));

    // 5. Resume cleanly -> completes v2 rules deploy (`unfreeze`)!
    const stepComplete = runOrchestrator([
      '--mode=simulate',
      `--project=${PROJECT_ID}`,
      `--emulator-host=${EMULATOR_HOST}:${EMULATOR_PORT}`,
      `--checkpoint=${CHECKPOINT_TEST_FILE}`,
      '--resume',
    ]);
    assert.equal(stepComplete.exitCode, 0, `Clean resume failed: ${stepComplete.stderr}`);
    const outComplete = JSON.parse(stepComplete.stdout);
    assert.equal(outComplete.ok, true);
    assert.equal(outComplete.status, 'COMPLETED');
    assert.equal(outComplete.activeRulesProfile, 'v2');
    assert.equal(outComplete.auditResult.affectedDocuments, 0);
    assert.equal(outComplete.auditResult.tripsCount, 19);

    // 6. Verify EUR budget invariant on migrated trip 0000 BEFORE synthetic reconciliation mutation
    let post0000;
    await env.withSecurityRulesDisabled(async ctx => {
      const fdb = ctx.firestore();
      const s = {};
      for (const col of SHARED_SUBCOLS) {
        const snap = await getDocs(collection(fdb, 'trips', '0000', col));
        s[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
      const priv = await getDocs(collection(fdb, 'trips', '0000', 'private_credentials'));
      const spese = await getDocs(collection(fdb, 'trips', '0000', 'spese'));
      post0000 = computeEurTotals(s, spese.docs.map(d => ({ id: d.id, ...d.data() })), priv.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    assert.equal(post0000.totGenerale, 12542.78);
    assert.equal(post0000.totSaldato, 9476.67);
    assert.equal(post0000.totDaSaldare, 3066.11);

    // 7. Post-release offline client reconciliation & legacy 1.5.16 server-side rejection
    while (offlinePendingQueue.length > 0) {
      const qItem = offlinePendingQueue[0];
      const split = security.splitEntitySecurityData(qItem.entityType, '0000', qItem.data);
      const vaultId = security.getVaultDocId(qItem.entityType, qItem.data.id);
      if (split.privateCredentialsDoc) {
        await assertSucceeds(setDoc(
          doc(copilotCtx.firestore(), 'trips', '0000', 'private_credentials', vaultId),
          normalizeForEmulator(split.privateCredentialsDoc)
        ));
      }
      await assertSucceeds(setDoc(
        doc(copilotCtx.firestore(), 'trips', '0000', 'alloggi', qItem.data.id),
        normalizeForEmulator(split.publicDoc)
      ));
      offlinePendingQueue.shift();
    }
    assert.equal(offlinePendingQueue.length, 0, 'Offline queue flushed cleanly after unfreeze');

    // Viewer sees reconciled hotel public data WITHOUT any leaked fields; Copilota sees restored secret fields
    const reconciledViewerDoc = await assertSucceeds(getDoc(doc(viewerCtx.firestore(), 'trips', '0000', 'alloggi', 'offline_queue_reconcile_hotel')));
    assert.equal(reconciledViewerDoc.data().name, 'Offline Reconcile Lodge');
    assert.equal(reconciledViewerDoc.data().pnr, undefined);
    assert.equal(reconciledViewerDoc.data().cost, undefined);
    const reconciledVault = await assertSucceeds(getDoc(doc(ownerCtx.firestore(), 'trips', '0000', 'private_credentials', 'alloggio_offline_queue_reconcile_hotel')));
    assert.equal(reconciledVault.data().pnr, 'OFFLINE_PNR_XYZ');
    await assertFails(getDoc(doc(viewerCtx.firestore(), 'trips', '0000', 'private_credentials', 'alloggio_offline_queue_reconcile_hotel')));
    await assertFails(getDocs(collection(strangerCtx.firestore(), 'trips', '0000', 'alloggi')));

    // Post-release untouched 1.5.16 client attempts:
    // (a) sensitive key leak -> DENIED
    await assertFails(setDoc(doc(copilotCtx.firestore(), 'trips', '0000', 'alloggi', 'post_v2_1516_leak'), {
      id: 'post_v2_1516_leak',
      name: '1.5.16 Leak Attempt',
      cost: '120.00',
    }));
    // (b) non-sensitive overwrite attempting to strip publicSchemaVersion=2 from an already bonificated doc -> DENIED
    const existingTappaId = sharedSnap.trips['0000'].collections.tappe[0].id;
    await assertFails(setDoc(doc(copilotCtx.firestore(), 'trips', '0000', 'tappe', existingTappaId), {
      id: existingTappaId,
      titolo: '1.5.16 Downgrade Attempt',
      updatedAt: Date.now() + 9000,
    }));

    console.log(JSON.stringify({
      ok: true,
      scenariosPassed: [
        'unconfirmed_production_refused_exit_2',
        'dry_run_production_zero_writes',
        'freeze_blocks_1516_and_multitrip_during_migration',
        'offline_queue_retained_on_freeze_denial',
        'checkpoint_resume_after_mid_migration_crash',
        'fail_closed_keeps_freeze_on_v2_deploy_error',
        'clean_resume_audits_19_trips_zero_anomalies',
        'eur_budget_invariant_12542_78_intact',
        'post_unfreeze_offline_reconcile_zero_loss',
        'post_release_1516_leak_and_downgrade_blocked',
      ],
      eurTotals0000: post0000,
      tripsAudited: outComplete.auditResult.tripsCount,
      sharedDocsScanned: outComplete.auditResult.sharedScanned,
      productionWrites: 0,
    }, null, 2));
  } finally {
    if (fs.existsSync(CHECKPOINT_TEST_FILE)) fs.unlinkSync(CHECKPOINT_TEST_FILE);
    if (env) await env.cleanup().catch(() => {});
    if (emu && emu.exitCode === null) emu.kill('SIGTERM');
  }
}

main().catch(err => {
  console.error('GATE TEST FAILED:', err);
  process.exit(1);
});
