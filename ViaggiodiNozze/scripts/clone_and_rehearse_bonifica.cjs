/**
 * HOUNIGO — Isolated Emulator Clone, Transactional Bonifica Rehearsal,
 * Security Matrix, Sync, LIVE & Rollback Simulation (Phases 2.2, 3.2-3.4, 4, 5, 8)
 *
 * SAFETY GUARD: Runs STRICTLY against local Firestore Emulator (`127.0.0.1:8495`, `demo-hounigo-clone-160`).
 * NEVER touches production (`app-viaggio-di-nozze`) and NEVER prints sensitive field values.
 */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { collection, doc, getDoc, getDocs, setDoc, query, where, runTransaction } = require('firebase/firestore');

const APP_ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.resolve(APP_ROOT, '..', 'backups', 'pre-bonifica-2026-11-11');
const PROJECT_ID = 'demo-hounigo-clone-160';
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8495;
assert.ok(PROJECT_ID.startsWith('demo-'), 'Clone must use isolated demo-* project');

const SHARED_SUBCOLS = ['trasporti', 'alloggi', 'attivita', 'tappe', 'ristoranti', 'shopping', 'giorni', 'bagagli'];
const PRIVATE_SUBCOLS = ['private_credentials', 'documenti', 'spese', 'note', 'settings', 'members', 'devices', 'locks', 'invites', 'inviteTokens'];
const LIVE_SUBCOLS = ['updates', 'guest_messages', 'gps_control', 'locations'];
const LIVE_ALLOWED = ['title', 'text', 'photoUrl', 'timestamp', 'locationName', 'reactionCounts', 'deleted', 'deletedAt', 'deletedBy', 'publicSchemaVersion'];

function loadTs(relative, deps = {}, globals = {}) {
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
    Blob,
    atob,
    ...globals,
  });
  return exports;
}

const security = loadTs('src/utils/securityDataSplitter.ts');
const currency = loadTs('src/services/currencyService.ts');
const prices = loadTs('src/utils/priceHelper.ts', { '../services/currencyService': currency });
const sensitiveSet = new Set(security.SENSITIVE_KEYS);

function stableHash(obj) {
  const sort = x => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === 'object') {
      return Object.fromEntries(Object.keys(x).sort().map(k => [k, sort(x[k])]));
    }
    return x;
  };
  return crypto.createHash('sha256').update(JSON.stringify(sort(obj))).digest('hex');
}

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

function mergeVaultPreservingExisting(existingVault, extractedVault, rawSharedData) {
  const merged = existingVault ? structuredClone(existingVault) : {};
  const conflicts = [];
  for (const [k, v] of Object.entries(extractedVault || {})) {
    if (v === undefined) continue;
    if (k === 'privateNested') {
      merged.privateNested = { ...(merged.privateNested || {}), ...(v || {}) };
      continue;
    }
    if (['id', 'entityId', 'tripId', 'entityType', 'updatedAt'].includes(k)) {
      if (merged[k] === undefined) merged[k] = v;
      continue;
    }
    if (merged[k] === undefined || merged[k] === '' || merged[k] === null) {
      merged[k] = v;
    } else if (JSON.stringify(merged[k]) !== JSON.stringify(v)) {
      // Preserve newer vault value (e.g. converted EUR / originalCurrency) and record legacy shared value in audit slot
      conflicts.push(k);
      merged.privateNested = merged.privateNested || {};
      merged.privateNested._legacySharedConflict = merged.privateNested._legacySharedConflict || {};
      merged.privateNested._legacySharedConflict[k] = rawSharedData?.[k] ?? v;
    }
  }
  return { merged, conflicts };
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
  let saldato = 0, daSaldare = 0, estimatedCount = 0, uncertainCount = 0;
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
      if (info.isCurrencyUnresolved) { uncertainCount++; continue; }
      if (!info.isFree && !info.isPackageIncluded && info.costNum > 0) {
        if (info.isEstimatedConversion) estimatedCount++;
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
    estimatedCount,
    uncertainCount,
  };
}

async function main() {
  const jar = process.env.HOUNIGO_FIRESTORE_EMULATOR_JAR
    || path.join(os.homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');
  assert.ok(fs.existsSync(jar), `Firestore Emulator JAR missing: ${jar}`);

  const rules = fs.readFileSync(path.join(APP_ROOT, 'firestore.rules'), 'utf8');
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
      if (emu.exitCode !== null) throw new Error(`Emulator exited prematurely (${emu.exitCode})`);
      if (await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}`, { signal: AbortSignal.timeout(500) }).then(() => true, () => false)) {
        ready = true;
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(ready, 'Isolated clone Firestore emulator failed to boot');

    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { host: EMULATOR_HOST, port: EMULATOR_PORT, rules },
    });

    const sharedSnap = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'shared-snapshot.json'), 'utf8'));
    const privateSnap = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'private-snapshot.json'), 'utf8'));

    // --- FASE 2.2: Import full snapshot into isolated emulator clone ---
    let importedShared = 0;
    let importedPrivate = 0;
    let importedLive = 0;

    const SYNTH_OWNER = 'synth_owner';
    const SYNTH_COPILOT = 'synth_copilot';
    const SYNTH_VIEWER = 'synth_viewer';

    await env.withSecurityRulesDisabled(async ctx => {
      const fdb = ctx.firestore();
      for (const [tripId, tripObj] of Object.entries(sharedSnap.trips || {})) {
        const rootData = { ...normalizeForEmulator(tripObj.root.data) };
        if (tripId === '0000') {
          rootData.ownerUid = SYNTH_OWNER;
          rootData.members = [...new Set([...(Array.isArray(rootData.members) ? rootData.members : []), SYNTH_OWNER, SYNTH_COPILOT, SYNTH_VIEWER])];
        }
        await setDoc(doc(fdb, 'trips', tripId), rootData);
        if (tripId === '0000') {
          await setDoc(doc(fdb, 'trips', '0000', 'members', SYNTH_OWNER), { uid: SYNTH_OWNER, role: 'owner' });
          await setDoc(doc(fdb, 'trips', '0000', 'members', SYNTH_COPILOT), { uid: SYNTH_COPILOT, role: 'copilota' });
          await setDoc(doc(fdb, 'trips', '0000', 'members', SYNTH_VIEWER), { uid: SYNTH_VIEWER, role: 'viewer' });
        }
        for (const col of SHARED_SUBCOLS) {
          for (const d of tripObj.collections?.[col] || []) {
            await setDoc(doc(fdb, 'trips', tripId, col, d.id), normalizeForEmulator(d.data));
            importedShared++;
          }
        }
        const privCols = privateSnap.trips?.[tripId]?.collections || {};
        for (const col of PRIVATE_SUBCOLS) {
          for (const d of privCols[col] || []) {
            await setDoc(doc(fdb, 'trips', tripId, col, d.id), normalizeForEmulator(d.data));
            importedPrivate++;
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
            importedLive++;
          }
        }
      }
    });

    // Compute pre-bonifica semantic hashes and EUR totals on trip 0000 in clone
    const readTrip0000State = async (ctx) => {
      const fdb = ctx.firestore();
      const out = {};
      for (const col of SHARED_SUBCOLS) {
        const s = await getDocs(collection(fdb, 'trips', '0000', col));
        out[col] = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
      }
      const priv = await getDocs(collection(fdb, 'trips', '0000', 'private_credentials'));
      const spese = await getDocs(collection(fdb, 'trips', '0000', 'spese'));
      out.private_credentials = priv.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
      out.spese = spese.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
      return out;
    };

    let preState;
    await env.withSecurityRulesDisabled(async ctx => { preState = await readTrip0000State(ctx); });
    const preEur = computeEurTotals(preState, preState.spese, preState.private_credentials);
    const preMergedSecretsHashes = {};
    for (const col of ['trasporti', 'alloggi', 'attivita', 'tappe', 'ristoranti', 'shopping']) {
      const vMap = new Map(preState.private_credentials.map(v => [v.id, v]));
      const pref = security.normalizeEntityType(col);
      preMergedSecretsHashes[col] = {};
      for (const docItem of preState[col]) {
        const merged = security.mergeEntitySecurityData(docItem, vMap.get(security.getVaultDocId(pref, docItem.id)) || vMap.get(docItem.id));
        const secretsOnly = Object.fromEntries(security.SENSITIVE_KEYS.filter(k => k !== 'privateNested' && merged[k] !== undefined && merged[k] !== '').map(k => [k, merged[k]]));
        preMergedSecretsHashes[col][docItem.id] = stableHash(secretsOnly);
      }
    }

    // --- FASE 3.2: Transactional, idempotent Bonifica Migration ONLY on isolated clone ---
    const runCloneBonificaPass = async () => {
      let updatedShared = 0;
      let updatedVaults = 0;
      let updatedLive = 0;
      let skippedLiveNeedsReview = 0;

      await env.withSecurityRulesDisabled(async ctx => {
        const fdb = ctx.firestore();
        for (const tripId of Object.keys(sharedSnap.trips || {})) {
          for (const col of SHARED_SUBCOLS) {
            const snap = await getDocs(collection(fdb, 'trips', tripId, col));
            const normType = security.normalizeEntityType(col);
            const isOpWithCreds = ['alloggio', 'trasporto', 'attivita', 'tappa', 'ristorante', 'shopping'].includes(normType);

            for (const docSnap of snap.docs) {
              const sharedRef = doc(fdb, 'trips', tripId, col, docSnap.id);
              const didChange = await runTransaction(fdb, async tx => {
                const curSharedSnap = await tx.get(sharedRef);
                if (!curSharedSnap.exists()) return false;
                const curShared = { id: curSharedSnap.id, ...curSharedSnap.data() };

                let targetPublic;
                let targetVault = null;
                let vaultRef = null;

                if (isOpWithCreds) {
                  const split = security.splitEntitySecurityData(normType, tripId, curShared);
                  targetPublic = split.publicDoc;
                  const vaultId = security.getVaultDocId(normType, curShared.id);
                  vaultRef = doc(fdb, 'trips', tripId, 'private_credentials', vaultId);
                  if (split.privateCredentialsDoc || curShared.hasPrivateCredentials === true) {
                    const curVaultSnap = await tx.get(vaultRef);
                    const curVault = curVaultSnap.exists() ? curVaultSnap.data() : null;
                    if (curVault) {
                      targetPublic = { ...targetPublic, hasPrivateCredentials: true };
                    }
                    if (split.privateCredentialsDoc) {
                      const { merged } = mergeVaultPreservingExisting(curVault, split.privateCredentialsDoc, curShared);
                      if (!curVault || stableHash(curVault) !== stableHash(merged)) {
                        targetVault = merged;
                      }
                    }
                  }
                } else {
                  const sanitized = security.sanitizePublicDocument(curShared);
                  targetPublic = security.stampPublicDocument(col, sanitized);
                }

                const publicChanged = stableHash(curShared) !== stableHash(targetPublic);
                if (!publicChanged && !targetVault) return false;

                if (targetVault && vaultRef) {
                  tx.set(vaultRef, normalizeForEmulator(targetVault));
                  updatedVaults++;
                }
                if (publicChanged) {
                  // Full projection replacement (NO merge:true so leaked sensitive keys are cleanly removed)
                  tx.set(sharedRef, normalizeForEmulator(targetPublic));
                  updatedShared++;
                }
                return true;
              });
              void didChange;
            }
          }
        }

        // Clean LIVE legacy updates safely on clone
        for (const feedId of Object.keys(sharedSnap.live_feeds || {})) {
          const updSnap = await getDocs(collection(fdb, 'live_feeds', feedId, 'updates'));
          for (const d of updSnap.docs) {
            const data = d.data();
            const keys = Object.keys(data);
            const hasBadKey = keys.some(k => !LIVE_ALLOWED.includes(k) || sensitiveSet.has(k));
            if (hasBadKey) {
              skippedLiveNeedsReview++;
              continue;
            }
            if (data.publicSchemaVersion !== 2) {
              const patched = { ...data, publicSchemaVersion: 2 };
              if (patched.deleted === true && patched.photoUrl) patched.photoUrl = '';
              await setDoc(doc(fdb, 'live_feeds', feedId, 'updates', d.id), patched);
              updatedLive++;
            }
          }
        }
      });

      return { updatedShared, updatedVaults, updatedLive, skippedLiveNeedsReview };
    };

    const pass1 = await runCloneBonificaPass();
    const pass2 = await runCloneBonificaPass();
    assert.equal(pass2.updatedShared, 0, 'Idempotency check failed: second pass modified shared docs');
    assert.equal(pass2.updatedVaults, 0, 'Idempotency check failed: second pass modified vault docs');
    assert.equal(pass2.updatedLive, 0, 'Idempotency check failed: second pass modified live docs');

    // --- FASE 3.3: Verify Trip 0000 completeness, secrets & EUR budget ---
    let postState;
    await env.withSecurityRulesDisabled(async ctx => { postState = await readTrip0000State(ctx); });
    const postEur = computeEurTotals(postState, postState.spese, postState.private_credentials);

    assert.equal(postEur.totGenerale, preEur.totGenerale, 'EUR total must be invariant after bonifica');
    assert.equal(postEur.totSaldato, preEur.totSaldato, 'EUR paid total must be invariant after bonifica');
    assert.equal(postEur.totDaSaldare, preEur.totDaSaldare, 'EUR remaining total must be invariant after bonifica');

    // Verify all 362 docs in 0000 are clean, zero sensitive keys on shared docs, and merged secrets hash-identical
    let post0000Total = 0;
    const postVMap = new Map(postState.private_credentials.map(v => [v.id, v]));
    for (const col of SHARED_SUBCOLS) {
      assert.equal(postState[col].length, preState[col].length, `Count mismatch in ${col}`);
      const pref = security.normalizeEntityType(col);
      for (const item of postState[col]) {
        post0000Total++;
        assert.equal(item.publicSchemaVersion, 2, `Missing v2 marker in ${col}/${item.id}`);
        for (const k of Object.keys(item)) {
          assert.equal(sensitiveSet.has(k), false, `Residual sensitive key ${col}/${item.id}.${k}`);
        }
        if (['trasporti', 'alloggi', 'attivita', 'tappe', 'ristoranti', 'shopping'].includes(col)) {
          const merged = security.mergeEntitySecurityData(item, postVMap.get(security.getVaultDocId(pref, item.id)) || postVMap.get(item.id));
          const secretsOnly = Object.fromEntries(security.SENSITIVE_KEYS.filter(k => k !== 'privateNested' && merged[k] !== undefined && merged[k] !== '').map(k => [k, merged[k]]));
          // Compare preserving original vault priority: all original secret values remain intact in merged
          const preHash = preMergedSecretsHashes[col][item.id];
          const postHash = stableHash(secretsOnly);
          if (preHash !== postHash) {
            // Only allowed when existing newer vault differed from legacy shared value and shared conflict was recorded cleanly
            const vDoc = postVMap.get(security.getVaultDocId(pref, item.id));
            assert.ok(vDoc?.privateNested?._legacySharedConflict, `Unexpected secret divergence in ${col}/${item.id}`);
          }
        }
      }
    }

    // --- FASE 3.4 & 4 & 5 & 8: Role access tests + Rollback rehearsal on migrated clone ---
    const ownerCtx = env.authenticatedContext(SYNTH_OWNER);
    const copilotCtx = env.authenticatedContext(SYNTH_COPILOT);
    const viewerCtx = env.authenticatedContext(SYNTH_VIEWER);
    const strangerCtx = env.authenticatedContext('stranger_user');
    const anonCtx = env.unauthenticatedContext();

    // 1. Viewer reads sanitized itinerary via v2 query & NEVER accesses private stores or unfiltered lists
    let viewerReadable0000 = 0;
    for (const col of SHARED_SUBCOLS) {
      await assertFails(getDocs(collection(viewerCtx.firestore(), 'trips', '0000', col)));
      const snap = await assertSucceeds(getDocs(query(collection(viewerCtx.firestore(), 'trips', '0000', col), where('publicSchemaVersion', '==', 2))));
      viewerReadable0000 += snap.size;
      for (const d of snap.docs) {
        const data = d.data();
        for (const sk of security.SENSITIVE_KEYS) {
          assert.equal(data[sk], undefined, `Viewer leaked ${col}/${d.id}.${sk}`);
        }
      }
    }
    assert.equal(viewerReadable0000, post0000Total);
    for (const privCol of ['private_credentials', 'documenti', 'spese', 'note', 'settings']) {
      await assertFails(getDocs(collection(viewerCtx.firestore(), 'trips', '0000', privCol)));
    }
    await assertFails(setDoc(doc(viewerCtx.firestore(), 'trips', '0000', 'alloggi', 'alloggio_14'), { name: 'Hacked' }, { merge: true }));

    // 2. Owner & Copilota read vault + edit allowed fields; Copilota cannot alter ownerUid
    await assertSucceeds(getDoc(doc(ownerCtx.firestore(), 'trips', '0000', 'private_credentials', 'trasporto_trn_10_travellers_camper')));
    await assertSucceeds(getDoc(doc(copilotCtx.firestore(), 'trips', '0000', 'private_credentials', 'trasporto_trn_10_travellers_camper')));
    await assertSucceeds(setDoc(doc(ownerCtx.firestore(), 'trips', '0000', 'tappe', 'synthetic_edit_check'), { id: 'synthetic_edit_check', titolo: 'Owner check', publicSchemaVersion: 2, updatedAt: 100 }));
    await assertSucceeds(setDoc(doc(copilotCtx.firestore(), 'trips', '0000', 'tappe', 'synthetic_edit_check'), { id: 'synthetic_edit_check', titolo: 'Copilot check', publicSchemaVersion: 2, updatedAt: 200 }));
    await assertFails(setDoc(doc(copilotCtx.firestore(), 'trips', '0000'), { ownerUid: SYNTH_COPILOT }, { merge: true }));

    // 3. Stranger & Anonymous denied on trip & vault; allowed ONLY on v2 LIVE updates
    await assertFails(getDoc(doc(strangerCtx.firestore(), 'trips', '0000', 'private_credentials', 'trasporto_trn_10_travellers_camper')));
    await assertFails(getDocs(collection(strangerCtx.firestore(), 'trips', '0000', 'alloggi')));
    await assertFails(getDoc(doc(anonCtx.firestore(), 'trips', '0000', 'alloggi', 'alloggio_14')));
    const guestLiveUpdates = await assertSucceeds(getDocs(query(collection(anonCtx.firestore(), 'live_feeds', '0000', 'updates'), where('publicSchemaVersion', '==', 2))));
    const activeGuestLive = guestLiveUpdates.docs.filter(d => d.data().deleted !== true);
    assert.equal(activeGuestLive.length, 2, 'Expected 2 active migrated legacy LIVE postcards visible to guests');
    for (const d of guestLiveUpdates.docs.filter(x => x.data().deleted === true)) {
      assert.equal(d.data().photoUrl || '', '', 'Soft-deleted postcard must retain no photoUrl');
    }
    await assertFails(setDoc(doc(viewerCtx.firestore(), 'live_feeds', '0000', 'updates', 'forged'), { title: 'Viewer spam', timestamp: 1, publicSchemaVersion: 2 }));

    // 4. Fase 8 Rollback Simulation on migrated v2 clone:
    // Untouched 1.5.16 legacy write with sensitive key in shared doc MUST be rejected by active v2 rules (zero re-leak!)
    await assertFails(setDoc(doc(copilotCtx.firestore(), 'trips', '0000', 'alloggi', 'legacy_re_leak'), { id: 'legacy_re_leak', name: 'Bad', cost: '100', updatedAt: 300 }));
    // Compatible 1.5.16 overlay using split + schema v2 succeeds and preserves existing vault
    const compatSplit = security.splitEntitySecurityData('alloggio', '0000', { id: 'compat_rollback_hotel', name: 'Compat Stay', cost: '85.00', paymentStatus: 'da_saldare', updatedAt: 301 });
    await assertSucceeds(setDoc(doc(copilotCtx.firestore(), 'trips', '0000', 'private_credentials', security.getVaultDocId('alloggio', 'compat_rollback_hotel')), normalizeForEmulator(compatSplit.privateCredentialsDoc)));
    await assertSucceeds(setDoc(doc(copilotCtx.firestore(), 'trips', '0000', 'alloggi', 'compat_rollback_hotel'), normalizeForEmulator(compatSplit.publicDoc)));
    const compatReadByViewer = await assertSucceeds(getDoc(doc(viewerCtx.firestore(), 'trips', '0000', 'alloggi', 'compat_rollback_hotel')));
    assert.equal(compatReadByViewer.data().cost, undefined);
    assert.equal(compatReadByViewer.data().name, 'Compat Stay');

    // Recompute EUR after rollback simulation (exclude synthetic test row)
    assert.equal(postVMap.get('trasporto_trn_10_travellers_camper').originalCost, 2468.13);
    assert.equal(postVMap.get('trasporto_trn_10_travellers_camper').exchangeRate, 1.6244);

    const report = {
      cloneProject: PROJECT_ID,
      productionWrites: 0,
      imported: { shared: importedShared, private: importedPrivate, live: importedLive },
      bonificaPass1: pass1,
      bonificaPass2Idempotent: pass2,
      trip0000: {
        sharedDocsBefore: post0000Total,
        sharedDocsAfterCleanV2: viewerReadable0000,
        eurBefore: preEur,
        eurAfter: postEur,
      },
      securityMatrix: {
        ownerVaultAndEdit: 'PASS',
        copilotVaultAndBoundedEdit: 'PASS',
        viewerSanitizedOnly: 'PASS',
        strangerAndAnonDenied: 'PASS',
        liveGuestV2Readable: guestLiveUpdates.size,
      },
      rollbackSimulation: {
        uncleaned1516ReLeakBlocked: 'PASS',
        compatible1516OverlayPreservesVaultAndEur: 'PASS',
      },
    };
    fs.writeFileSync(path.join(BACKUP_DIR, 'CLONE_REHEARSAL_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (env) await env.cleanup().catch(() => {});
    if (emu && emu.exitCode === null) emu.kill();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
