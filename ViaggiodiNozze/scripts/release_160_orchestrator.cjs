/**
 * HOUNIGO — Coordinated Release 1.6.0 Gate Orchestrator (Resumable & Fail-Closed)
 *
 * SAFETY DEFAULTS:
 * - Defaults strictly to `--mode=simulate` (emulator only, `demo-*` project).
 * - Production mutations NEVER run unless `--mode=production --execute-production --confirm=RELEASE_160_AUTHORIZED`
 *   are ALL explicitly passed on the command line.
 * - Never prints PNR, credentials, private values, tokens, or sensitive document contents.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const DEFAULT_BACKUP_DIR = path.join(REPO_ROOT, 'backups', 'pre-bonifica-2026-11-11');
const ROLLBACK_DIR = path.join(REPO_ROOT, 'backups', 'rollback-compat-1.5.16-v2');
const ROLLBACK_ZIP = path.join(ROLLBACK_DIR, 'rollback-compatible-1.5.16-v2-dist.zip');
const ROLLBACK_SHA256 = 'd6973cd31f1621da89aa77f8836b43680237d70d6b3dbf84efb7fa92b4296d44';
const DEFAULT_CHECKPOINT = path.join(REPO_ROOT, 'backups', 'release-gate-checkpoint-160.json');

const SHARED_SUBCOLS = ['trasporti', 'alloggi', 'attivita', 'tappe', 'ristoranti', 'shopping', 'giorni', 'bagagli'];
const LIVE_ALLOWED = ['title', 'text', 'photoUrl', 'timestamp', 'locationName', 'reactionCounts', 'deleted', 'deletedAt', 'deletedBy', 'publicSchemaVersion'];
const PROD_PROJECT = 'app-viaggio-di-nozze';
const GH_PAGES_URL = 'https://casabr.github.io/honeymoon-roadbook/';

const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const FIREBASE_CLI_JS = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');

function runNpm(args, cwd) {
  return execFileSync(NPM_BIN, args, {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}

function runFirebase(args, cwd) {
  if (fs.existsSync(FIREBASE_CLI_JS)) {
    return execFileSync(process.execPath, [FIREBASE_CLI_JS, ...args], { cwd, stdio: 'pipe' });
  }
  return execFileSync(NPX_BIN, ['firebase', ...args], {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}

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
const SENSITIVE_SET = new Set(security.SENSITIVE_KEYS);

async function computeTrip0000SnapshotMetrics(client) {
  const cols = {};
  for (const col of SHARED_SUBCOLS) {
    cols[col] = (await client.listCollection(`trips/0000/${col}`)).map(d => d.data);
  }
  const spese = (await client.listCollection('trips/0000/spese')).map(d => d.data);
  const vaults = (await client.listCollection('trips/0000/private_credentials')).map(d => d.data);
  const vMap = new Map(vaults.map(v => [v.id, v]));
  const merge = (arr, pref) => arr.map(x => ({
    ...x,
    ...(vMap.get(`${pref}_${x.id}`) || vMap.get(x.id) || {}),
    id: x.id,
  }));
  const seenTickets = new Set();
  const trMerged = merge(cols.trasporti || [], 'trasporto').filter(t => {
    const c = (t.carrier || '').toLowerCase();
    if (c.includes('prosecuzione') || c.includes('coincidenza')) return false;
    if ((t.type || 'volo').toLowerCase() === 'volo') {
      const tk = (t.bookingCode?.trim() || t.pnr?.trim() || '').toLowerCase();
      if (tk && seenTickets.has(tk)) return false;
      if (tk) seenTickets.add(tk);
    }
    return true;
  });
  let saldato = 0;
  let daSaldare = 0;
  let uncertainCount = 0;
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
        const paid = currency.roundEur(info.paidNum || (info.isPaid ? info.costNum : 0));
        const rem = currency.roundEur(Math.max(0, info.costNum - paid));
        saldato = currency.roundEur(saldato + paid);
        daSaldare = currency.roundEur(daSaldare + rem);
      }
    }
  };
  runList(merge(spese || [], 'spesa'), 'amount', 'amount');
  runList(trMerged, 'cost', 'cost');
  runList(merge(cols.alloggi || [], 'alloggio'), 'cost', 'cost');
  runList(merge(cols.attivita || [], 'attivita'), 'cost', 'cost');
  runList(merge(cols.ristoranti || [], 'ristorante'), 'budget', 'cost');
  runList(merge(cols.shopping || [], 'shopping'), 'budget', 'cost');
  const sharedCount0000 = SHARED_SUBCOLS.reduce((sum, c) => sum + (cols[c]?.length || 0), 0);
  return {
    sharedCount0000,
    vaultCount0000: vaults.length,
    speseCount0000: spese.length,
    totGenerale: currency.roundEur(saldato + daSaldare),
    totSaldato: saldato,
    totDaSaldare: daSaldare,
    uncertainCount,
  };
}

function parseArgs(argv) {
  const opts = {
    mode: 'simulate',
    dryRun: false,
    executeProduction: false,
    confirm: '',
    project: '',
    emulatorHost: process.env.FIRESTORE_EMULATOR_HOST || '',
    checkpoint: DEFAULT_CHECKPOINT,
    backupDir: DEFAULT_BACKUP_DIR,
    resume: false,
    stopAfterDocs: Infinity,
    simulateRulesDeployFailure: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] || '';
    if (a.startsWith('--mode=')) opts.mode = a.slice(7);
    else if (a === '--mode') opts.mode = next();
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--execute-production') opts.executeProduction = true;
    else if (a.startsWith('--confirm=')) opts.confirm = a.slice(10);
    else if (a === '--confirm') opts.confirm = next();
    else if (a.startsWith('--project=')) opts.project = a.slice(10);
    else if (a === '--project') opts.project = next();
    else if (a.startsWith('--emulator-host=')) opts.emulatorHost = a.slice(16);
    else if (a === '--emulator-host') opts.emulatorHost = next();
    else if (a.startsWith('--checkpoint=')) opts.checkpoint = path.resolve(a.slice(13));
    else if (a === '--checkpoint') opts.checkpoint = path.resolve(next());
    else if (a.startsWith('--backup-dir=')) opts.backupDir = path.resolve(a.slice(13));
    else if (a === '--backup-dir') opts.backupDir = path.resolve(next());
    else if (a === '--resume') opts.resume = true;
    else if (a.startsWith('--stop-after-docs=')) opts.stopAfterDocs = Number(a.slice(18));
    else if (a === '--stop-after-docs') opts.stopAfterDocs = Number(next());
    else if (a === '--simulate-rules-deploy-failure') opts.simulateRulesDeployFailure = true;
  }
  if (!opts.project) {
    opts.project = opts.mode === 'production' ? PROD_PROJECT : 'demo-hounigo-gate-160';
  }
  return opts;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

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

function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) {
    return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, n]) => [k, decodeValue(n)]));
  }
  return null;
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, decodeValue(v)]));
}

function encodeValue(val, existingRaw) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { nullValue: null };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') {
    if (existingRaw && 'timestampValue' in existingRaw && existingRaw.timestampValue === val) {
      return { timestampValue: val };
    }
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    const rawArr = existingRaw?.arrayValue?.values || [];
    return {
      arrayValue: {
        values: val.filter(v => v !== undefined).map((v, idx) => encodeValue(v, rawArr[idx])),
      },
    };
  }
  if (typeof val === 'object') {
    const rawMap = existingRaw?.mapValue?.fields || {};
    return { mapValue: { fields: encodeFields(val, rawMap) } };
  }
  return { stringValue: String(val) };
}

function encodeFields(obj, existingRawFields = {}) {
  const fields = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined) continue;
    fields[k] = encodeValue(v, existingRawFields[k]);
  }
  return fields;
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
      conflicts.push(k);
      merged.privateNested = merged.privateNested || {};
      merged.privateNested._legacySharedConflict = merged.privateNested._legacySharedConflict || {};
      merged.privateNested._legacySharedConflict[k] = rawSharedData?.[k] ?? v;
    }
  }
  return { merged, conflicts };
}

function saveCheckpoint(checkpointPath, state) {
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  const tmp = `${checkpointPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, checkpointPath);
}

function createInitialCheckpoint(opts) {
  return {
    release: '1.6.0',
    mode: opts.mode,
    projectId: opts.project,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeRulesProfile: 'unknown',
    steps: {
      prechecks: 'PENDING',
      backup: 'PENDING',
      indexes: 'PENDING',
      frontend_160: 'PENDING',
      freeze_rules: 'PENDING',
      bonifica: 'PENDING',
      audit_zero: 'PENDING',
      deploy_v2_rules: 'PENDING',
      reopen_verify: 'PENDING',
    },
    bonificaProgress: {
      completedDocKeys: [],
      stats: {
        tripsScanned: 0,
        sharedUpdated: 0,
        vaultsUpdated: 0,
        liveUpdated: 0,
        skippedLiveNeedsReview: 0,
        docsProcessed: 0,
      },
    },
    auditResult: null,
    rollbackPackage: {
      zipPath: ROLLBACK_ZIP,
      sha256: ROLLBACK_SHA256,
    },
    lastError: null,
  };
}

function getFirebaseCliToken() {
  const authPath = process.env.HOUNIGO_FIREBASE_CLI_AUTH_MODULE
    || path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'auth.js');
  const auth = require(authPath);
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error('Firebase CLI authentication missing or expired.');
  }
  return auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
}

function createFirestoreClient(opts, token) {
  const isSim = opts.mode === 'simulate';
  const origin = isSim ? `http://${opts.emulatorHost}` : 'https://firestore.googleapis.com';
  const docRoot = `projects/${opts.project}/databases/(default)/documents`;
  const base = `${origin}/v1/${docRoot}`;
  const authHeader = isSim ? 'Bearer owner' : `Bearer ${token}`;

  async function req(url, method = 'GET', body) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { ok: res.ok, status: res.status, json };
  }

  async function listCollection(colPath) {
    const docs = [];
    let pageToken = '';
    do {
      const url = `${base}/${colPath}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const r = await req(url, 'GET');
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`Firestore GET failed (${r.status}) at ${colPath}`);
      for (const d of r.json?.documents || []) {
        const id = d.name.split('/').at(-1);
        docs.push({
          id,
          rawFields: d.fields || {},
          data: { id, ...decodeFields(d.fields) },
        });
      }
      pageToken = r.json?.nextPageToken || '';
    } while (pageToken);
    return docs;
  }

  async function runTransaction(fn) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const begin = await req(`${base}:beginTransaction`, 'POST', { options: { readWrite: {} } });
      if (!begin.ok || !begin.json?.transaction) {
        throw new Error(`beginTransaction failed (${begin.status})`);
      }
      const txId = begin.json.transaction;
      const writes = [];
      const tx = {
        async get(docPath) {
          const r = await req(`${base}:batchGet`, 'POST', {
            documents: [`${docRoot}/${docPath}`],
            transaction: txId,
          });
          if (!r.ok) throw new Error(`tx.get failed (${r.status}) for ${docPath}`);
          const entry = Array.isArray(r.json) ? r.json[0] : r.json;
          if (!entry?.found) return { exists: false, rawFields: {}, data: null };
          const id = entry.found.name.split('/').at(-1);
          return {
            exists: true,
            rawFields: entry.found.fields || {},
            data: { id, ...decodeFields(entry.found.fields) },
          };
        },
        set(docPath, obj, existingRawFields = {}) {
          const clean = { ...obj };
          delete clean.id;
          writes.push({
            update: {
              name: `${docRoot}/${docPath}`,
              fields: encodeFields(clean, existingRawFields),
            },
          });
        },
      };

      let result;
      try {
        result = await fn(tx);
      } catch (err) {
        await req(`${base}:rollback`, 'POST', { transaction: txId }).catch(() => {});
        throw err;
      }
      if (writes.length === 0) {
        await req(`${base}:rollback`, 'POST', { transaction: txId }).catch(() => {});
        return result;
      }
      const committed = await req(`${base}:commit`, 'POST', { transaction: txId, writes });
      if (committed.status === 409) continue;
      if (!committed.ok) throw new Error(`commit failed (${committed.status})`);
      return result;
    }
    throw new Error('Transaction aborted after maximum retries');
  }

  return { req, listCollection, runTransaction, origin };
}

function verifyBackupDir(backupDir) {
  const manifestPath = path.join(backupDir, 'MANIFEST.json');
  const sumsPath = path.join(backupDir, 'SHA256SUMS.txt');
  assert.ok(fs.existsSync(manifestPath), `Backup MANIFEST missing: ${manifestPath}`);
  assert.ok(fs.existsSync(sumsPath), `Backup SHA256SUMS missing: ${sumsPath}`);
  const lines = fs.readFileSync(sumsPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length >= 3, 'Expected checksummed backup files');
  for (const line of lines) {
    const [expectedHash, relName] = line.trim().split(/\s+/);
    const target = path.join(backupDir, relName);
    assert.ok(fs.existsSync(target), `Backup artifact missing: ${relName}`);
    assert.equal(sha256File(target), expectedHash, `Backup SHA-256 mismatch: ${relName}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.ok(manifest.counts?.tripsCount >= 1, 'Backup manifest reports zero trips');
  return manifest;
}

function assertPreconditions(opts) {
  if (!['simulate', 'production'].includes(opts.mode)) {
    throw new Error(`Unsupported mode: ${opts.mode}`);
  }
  if (opts.mode === 'production') {
    assert.equal(opts.project, PROD_PROJECT, 'Production mode must target app-viaggio-di-nozze');
    if (opts.simulateRulesDeployFailure) {
      throw new Error('--simulate-rules-deploy-failure is strictly forbidden in production mode');
    }
    if (!opts.dryRun) {
      if (!opts.executeProduction || opts.confirm !== 'RELEASE_160_AUTHORIZED') {
        const err = new Error('REFUSING production mutations without --execute-production --confirm=RELEASE_160_AUTHORIZED');
        err.exitCode = 2;
        throw err;
      }
    }
  } else {
    assert.ok(opts.project.startsWith('demo-'), 'Simulation project MUST start with demo-');
    if (!opts.dryRun) {
      assert.ok(opts.emulatorHost && !opts.emulatorHost.includes('googleapis.com'), 'Simulation requires local FIRESTORE_EMULATOR_HOST');
    }
  }

  const freezeRulesPath = path.join(APP_ROOT, 'firestore.freeze.rules');
  const v2RulesPath = path.join(APP_ROOT, 'firestore.rules');
  const rootV2RulesPath = path.join(REPO_ROOT, 'firestore.rules');
  const storageRulesPath = path.join(APP_ROOT, 'storage.rules');
  const indexesPath = path.join(APP_ROOT, 'firestore.indexes.json');

  for (const p of [freezeRulesPath, v2RulesPath, rootV2RulesPath, storageRulesPath, indexesPath, ROLLBACK_ZIP]) {
    assert.ok(fs.existsSync(p), `Missing required release file: ${path.relative(REPO_ROOT, p)}`);
  }
  assert.equal(sha256File(v2RulesPath), sha256File(rootV2RulesPath), 'Root and app firestore.rules parity mismatch');
  assert.equal(sha256File(ROLLBACK_ZIP), ROLLBACK_SHA256, 'Compatible rollback 1.5.16 ZIP SHA-256 mismatch');
  assert.ok(fs.readFileSync(freezeRulesPath, 'utf8').includes('allow write: if false; // LOCKED DURING RELEASE 1.6.0 FREEZE'));
}

async function deployRulesProfile(opts, rulesFile, client) {
  const rulesText = fs.readFileSync(rulesFile, 'utf8');
  if (opts.mode === 'simulate') {
    const res = await fetch(`${client.origin}/emulator/v1/projects/${opts.project}:securityRules`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rulesText }] } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`Emulator rules deploy failed (${res.status}) for ${path.basename(rulesFile)}`);
    }
    return;
  }
  if (rulesFile.endsWith('firestore.freeze.rules')) {
    const tmpBackup = `${path.join(REPO_ROOT, 'firestore.rules')}.pre_freeze_bak`;
    const rootRules = path.join(REPO_ROOT, 'firestore.rules');
    fs.copyFileSync(rootRules, tmpBackup);
    try {
      fs.copyFileSync(rulesFile, rootRules);
      runFirebase(['deploy', '--only', 'firestore:rules', '--project', opts.project], REPO_ROOT);
    } finally {
      fs.copyFileSync(tmpBackup, rootRules);
      fs.unlinkSync(tmpBackup);
    }
  } else {
    runFirebase(['deploy', '--only', 'firestore:rules', '--project', opts.project], REPO_ROOT);
  }
}

async function auditPostBonificaZeroAnomalies(client) {
  const trips = await client.listCollection('trips');
  const liveFeeds = await client.listCollection('live_feeds');
  const anomalies = [];
  let sharedScanned = 0;
  let liveScanned = 0;

  for (const t of trips) {
    for (const col of SHARED_SUBCOLS) {
      const docs = await client.listCollection(`trips/${t.id}/${col}`);
      const allowed = new Set(security.PUBLIC_DATA_SCHEMAS[col] || []);
      for (const d of docs) {
        sharedScanned++;
        const dirtySensitive = Object.keys(d.data).filter(k => SENSITIVE_SET.has(k));
        const unsupported = Object.keys(d.data).filter(k => !allowed.has(k));
        if (d.data.publicSchemaVersion !== 2 || dirtySensitive.length > 0 || unsupported.length > 0) {
          anomalies.push({
            path: `trips/${t.id}/${col}/${d.id}`,
            missingV2: d.data.publicSchemaVersion !== 2,
            sensitiveKeyCount: dirtySensitive.length,
            unsupportedKeyCount: unsupported.length,
          });
        }
      }
    }
  }

  for (const f of liveFeeds) {
    const updates = await client.listCollection(`live_feeds/${f.id}/updates`);
    for (const u of updates) {
      liveScanned++;
      const badKeys = Object.keys(u.data).filter(k => k !== 'id' && (!LIVE_ALLOWED.includes(k) || SENSITIVE_SET.has(k)));
      if (u.data.publicSchemaVersion !== 2 || badKeys.length > 0) {
        anomalies.push({
          path: `live_feeds/${f.id}/updates/${u.id}`,
          missingV2: u.data.publicSchemaVersion !== 2,
          badKeyCount: badKeys.length,
        });
      }
    }
  }

  return {
    tripsCount: trips.length,
    liveFeedsCount: liveFeeds.length,
    sharedScanned,
    liveScanned,
    affectedDocuments: anomalies.length,
    samplePaths: anomalies.slice(0, 10),
  };
}

async function runResumableBonifica(opts, client, state) {
  const completedSet = new Set(state.bonificaProgress.completedDocKeys || []);
  const stats = state.bonificaProgress.stats;
  const trips = await client.listCollection('trips');
  const liveFeeds = await client.listCollection('live_feeds');
  stats.tripsScanned = trips.length;

  let processedThisRun = 0;

  for (const trip of trips) {
    for (const col of SHARED_SUBCOLS) {
      const docs = await client.listCollection(`trips/${trip.id}/${col}`);
      const normType = security.normalizeEntityType(col);
      const isOpWithCreds = ['alloggio', 'trasporto', 'attivita', 'tappa', 'ristorante', 'shopping'].includes(normType);

      for (const item of docs) {
        const docKey = `trips/${trip.id}/${col}/${item.id}`;
        if (completedSet.has(docKey)) continue;

        if (processedThisRun >= opts.stopAfterDocs) {
          state.status = 'INTERRUPTED';
          state.lastError = `Simulated interruption after ${opts.stopAfterDocs} docs`;
          saveCheckpoint(opts.checkpoint, state);
          const err = new Error(state.lastError);
          err.isSimulatedInterruption = true;
          throw err;
        }

        const outcome = await client.runTransaction(async tx => {
          const sharedPath = `trips/${trip.id}/${col}/${item.id}`;
          const curSnap = await tx.get(sharedPath);
          if (!curSnap.exists) return { sharedChanged: false, vaultChanged: false };
          const curShared = curSnap.data;

          let targetPublic;
          let targetVault = null;
          let vaultPath = null;
          let curVaultRaw = {};

          if (isOpWithCreds) {
            const split = security.splitEntitySecurityData(normType, trip.id, curShared);
            targetPublic = split.publicDoc;
            const vaultId = security.getVaultDocId(normType, curShared.id);
            vaultPath = `trips/${trip.id}/private_credentials/${vaultId}`;
            if (split.privateCredentialsDoc || curShared.hasPrivateCredentials === true) {
              const curVaultSnap = await tx.get(vaultPath);
              const curVault = curVaultSnap.exists ? curVaultSnap.data : null;
              curVaultRaw = curVaultSnap.rawFields || {};
              if (curVault) targetPublic = { ...targetPublic, hasPrivateCredentials: true };
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
          if (!publicChanged && !targetVault) return { sharedChanged: false, vaultChanged: false };

          if (targetVault && vaultPath) {
            tx.set(vaultPath, targetVault, curVaultRaw);
          }
          if (publicChanged) {
            tx.set(sharedPath, targetPublic, curSnap.rawFields);
          }
          return { sharedChanged: publicChanged, vaultChanged: Boolean(targetVault) };
        });

        if (outcome.sharedChanged) stats.sharedUpdated++;
        if (outcome.vaultChanged) stats.vaultsUpdated++;
        stats.docsProcessed++;
        processedThisRun++;
        completedSet.add(docKey);
        state.bonificaProgress.completedDocKeys = [...completedSet];
        if (processedThisRun % 25 === 0) saveCheckpoint(opts.checkpoint, state);
      }
    }
  }

  for (const feed of liveFeeds) {
    const updates = await client.listCollection(`live_feeds/${feed.id}/updates`);
    for (const upd of updates) {
      const docKey = `live_feeds/${feed.id}/updates/${upd.id}`;
      if (completedSet.has(docKey)) continue;

      const outcome = await client.runTransaction(async tx => {
        const curSnap = await tx.get(docKey);
        if (!curSnap.exists) return 'noop';
        const data = curSnap.data;
        const bad = Object.keys(data).some(k => k !== 'id' && (!LIVE_ALLOWED.includes(k) || SENSITIVE_SET.has(k)));
        if (bad) return 'needs_review';
        if (data.publicSchemaVersion === 2 && !(data.deleted === true && data.photoUrl)) return 'noop';
        const patched = { ...data, publicSchemaVersion: 2 };
        if (patched.deleted === true && patched.photoUrl) patched.photoUrl = '';
        tx.set(docKey, patched, curSnap.rawFields);
        return 'updated';
      });

      if (outcome === 'needs_review') stats.skippedLiveNeedsReview++;
      else if (outcome === 'updated') stats.liveUpdated++;
      completedSet.add(docKey);
      state.bonificaProgress.completedDocKeys = [...completedSet];
    }
  }

  saveCheckpoint(opts.checkpoint, state);
}

async function verifyLiveRulesSha256(project, releaseId, expectedFilePath, token) {
  const expectedSha = sha256File(expectedFilePath);
  const relRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${project}/releases/${encodeURIComponent(releaseId)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }
  );
  if (!relRes.ok) throw new Error(`Rules release check failed (${relRes.status}) for ${releaseId}`);
  const relJson = await relRes.json();
  const rsRes = await fetch(
    `https://firebaserules.googleapis.com/v1/${relJson.rulesetName}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }
  );
  if (!rsRes.ok) throw new Error(`Ruleset fetch failed (${rsRes.status}) for ${relJson.rulesetName}`);
  const rsJson = await rsRes.json();
  const liveContent = rsJson?.source?.files?.[0]?.content || '';
  const liveSha = crypto.createHash('sha256').update(liveContent).digest('hex');
  assert.equal(liveSha, expectedSha, `Live ruleset SHA mismatch for ${releaseId}`);
  return { releaseId, rulesetName: relJson.rulesetName, sha256: liveSha };
}

async function waitForIndexesReady(project, token) {
  const deadline = Date.now() + 300000;
  while (true) {
    const idxRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/-/indexes`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }
    );
    if (!idxRes.ok) throw new Error(`Index status check failed (${idxRes.status})`);
    const idxJson = await idxRes.json();
    const list = idxJson.indexes || [];
    const pending = list.filter(i => i.state !== 'READY');
    if (list.length >= 2 && pending.length === 0) {
      return list.map(i => ({ name: i.name.split('/').slice(-3).join('/'), state: i.state }));
    }
    if (Date.now() >= deadline) {
      throw new Error(`Firestore indexes not READY before timeout (total=${list.length}, pending=${pending.length})`);
    }
    await new Promise(r => setTimeout(r, 10000));
  }
}

async function deployAndVerifyFrontend160() {
  runNpm(['run', 'build'], APP_ROOT);
  execFileSync(process.execPath, [path.join(__dirname, 'test_public_bundle_privacy.cjs')], { cwd: APP_ROOT, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(__dirname, 'test_release_versioning.cjs')], { cwd: APP_ROOT, stdio: 'pipe' });

  const builtHtml = fs.readFileSync(path.join(APP_ROOT, 'dist', 'index.html'), 'utf8');
  const scriptMatch = /(assets\/index-[A-Za-z0-9_-]+\.js)/.exec(builtHtml);
  assert.ok(scriptMatch, 'Built dist/index.html missing main index-*.js asset');
  const assetRelPath = scriptMatch[1];
  const expectedAssetSha = sha256File(path.join(APP_ROOT, 'dist', assetRelPath));

  runNpm(['run', 'deploy'], APP_ROOT);

  const deadline = Date.now() + 180000;
  while (true) {
    const htmlRes = await fetch(`${GH_PAGES_URL}?cb=${Date.now()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    if (htmlRes && htmlRes.ok) {
      const liveHtml = await htmlRes.text();
      if (liveHtml.includes(assetRelPath)) {
        const assetRes = await fetch(`${GH_PAGES_URL}${assetRelPath}?cb=${Date.now()}`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        }).catch(() => null);
        if (assetRes && assetRes.ok) {
          const liveAssetBuf = Buffer.from(await assetRes.arrayBuffer());
          const liveAssetSha = crypto.createHash('sha256').update(liveAssetBuf).digest('hex');
          assert.equal(liveAssetSha, expectedAssetSha, 'Live GitHub Pages JS bundle SHA mismatch against local dist');
          return { url: GH_PAGES_URL, asset: assetRelPath, sha256: liveAssetSha };
        }
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for GitHub Pages to serve ${assetRelPath}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  assertPreconditions(opts);

  let state = opts.resume && fs.existsSync(opts.checkpoint)
    ? JSON.parse(fs.readFileSync(opts.checkpoint, 'utf8'))
    : createInitialCheckpoint(opts);

  state.status = 'RUNNING';
  state.lastError = null;
  saveCheckpoint(opts.checkpoint, state);

  const tokenObj = opts.mode === 'production' ? await getFirebaseCliToken() : { access_token: 'emulator-owner' };
  const token = tokenObj.access_token;

  if (opts.dryRun) {
    const manifest = verifyBackupDir(opts.backupDir);
    const result = {
      ok: true,
      mode: opts.mode,
      dryRun: true,
      projectId: opts.project,
      productionWrites: 0,
      backupTrips: manifest.counts.tripsCount,
      backupSharedDocs: manifest.counts.sharedDocsTotal,
      rollbackZipSha256: ROLLBACK_SHA256,
      freezeRulesReady: true,
      v2RulesParity: true,
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const client = createFirestoreClient(opts, token);

  try {
    // 1. Prechecks
    state.steps.prechecks = 'PASSED';
    saveCheckpoint(opts.checkpoint, state);

    // 2. Backup verification (capture live snapshot first if prod)
    if (state.steps.backup !== 'PASSED') {
      if (opts.mode === 'production') {
        execFileSync('node', [path.join(__dirname, 'snapshot_readonly_backup.cjs')], { cwd: APP_ROOT, stdio: 'pipe' });
      }
      verifyBackupDir(opts.backupDir);
      state.steps.backup = 'PASSED';
      saveCheckpoint(opts.checkpoint, state);
    }

    // 3. Indexes READY check
    if (state.steps.indexes !== 'PASSED') {
      if (opts.mode === 'production') {
        runFirebase(['deploy', '--only', 'firestore:indexes', '--project', opts.project], REPO_ROOT);
        state.indexesVerified = await waitForIndexesReady(opts.project, token);
      }
      state.steps.indexes = 'PASSED';
      saveCheckpoint(opts.checkpoint, state);
    }

    // 4. Freeze concurrent client writes across ALL 19 trips BEFORE bonifica
    if (state.steps.freeze_rules !== 'PASSED') {
      await deployRulesProfile(opts, path.join(APP_ROOT, 'firestore.freeze.rules'), client);
      if (opts.mode === 'production') {
        state.freezeRulesVerification = await verifyLiveRulesSha256(
          opts.project,
          'cloud.firestore',
          path.join(APP_ROOT, 'firestore.freeze.rules'),
          token
        );
        // Verify unauthenticated/client write is blocked server-side while public LIVE header read works if present
        const unauthWrite = await fetch(
          `https://firestore.googleapis.com/v1/projects/${opts.project}/databases/(default)/documents/trips/0000/alloggi/freeze_probe_blocked`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { name: { stringValue: 'blocked' } } }),
            signal: AbortSignal.timeout(15000),
          }
        );
        assert.equal(unauthWrite.status, 403, 'Freeze rules must reject unauthenticated/client write with 403');
      }
      state.activeRulesProfile = 'freeze';
      state.steps.freeze_rules = 'PASSED';
      saveCheckpoint(opts.checkpoint, state);
    }

    // 5. Frontend 1.6.0 bridge build & deploy verification
    if (state.steps.frontend_160 !== 'PASSED') {
      if (opts.mode === 'production') {
        state.frontendVerification = await deployAndVerifyFrontend160();
      } else {
        assert.ok(fs.existsSync(path.join(APP_ROOT, 'src', 'utils', 'securityDataSplitter.ts')));
      }
      state.steps.frontend_160 = 'PASSED';
      saveCheckpoint(opts.checkpoint, state);
    }

    // Capture baseline Trip 0000 metrics while frozen BEFORE bonifica writes
    if (!state.preBonificaMetrics0000) {
      state.preBonificaMetrics0000 = await computeTrip0000SnapshotMetrics(client);
      saveCheckpoint(opts.checkpoint, state);
    }

    // 6. Resumable transactional bonifica across ALL trips + LIVE
    if (state.steps.bonifica !== 'PASSED') {
      await runResumableBonifica(opts, client, state);
      state.steps.bonifica = 'PASSED';
      saveCheckpoint(opts.checkpoint, state);
    }

    // 7. Zero-anomaly & EUR invariant read-only gate BEFORE unlocking writes
    const audit = await auditPostBonificaZeroAnomalies(client);
    const postMetrics0000 = await computeTrip0000SnapshotMetrics(client);
    state.auditResult = audit;
    state.postBonificaMetrics0000 = postMetrics0000;
    const pre = state.preBonificaMetrics0000;
    assert.equal(postMetrics0000.sharedCount0000, pre.sharedCount0000, 'Trip 0000 shared count changed during bonifica');
    assert.equal(postMetrics0000.speseCount0000, pre.speseCount0000, 'Trip 0000 spese count changed during bonifica');
    assert.equal(postMetrics0000.totGenerale, pre.totGenerale, 'Trip 0000 EUR totGenerale changed during bonifica');
    assert.equal(postMetrics0000.totSaldato, pre.totSaldato, 'Trip 0000 EUR totSaldato changed during bonifica');
    assert.equal(postMetrics0000.totDaSaldare, pre.totDaSaldare, 'Trip 0000 EUR totDaSaldare changed during bonifica');
    assert.equal(postMetrics0000.uncertainCount, pre.uncertainCount, 'Trip 0000 uncertainCount changed during bonifica');
    if (audit.affectedDocuments !== 0) {
      state.steps.audit_zero = 'FAILED';
      state.status = 'FAILED_KEEP_FREEZE';
      state.lastError = `Audit detected ${audit.affectedDocuments} remaining anomalies; keeping freeze rules active`;
      saveCheckpoint(opts.checkpoint, state);
      throw new Error(state.lastError);
    }
    state.steps.audit_zero = 'PASSED';
    saveCheckpoint(opts.checkpoint, state);

    // 8. Controlled unfreeze: deploy final Firestore v2 + Storage rules
    if (state.steps.deploy_v2_rules !== 'PASSED') {
      if (opts.simulateRulesDeployFailure) {
        throw new Error('Simulated v2 rules deployment failure (fail-closed: freeze rules preserved)');
      }
      await deployRulesProfile(opts, path.join(APP_ROOT, 'firestore.rules'), client);
      if (opts.mode === 'production') {
        state.v2RulesVerification = await verifyLiveRulesSha256(
          opts.project,
          'cloud.firestore',
          path.join(APP_ROOT, 'firestore.rules'),
          token
        );
        const bRes = await (await fetch(
          `https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(opts.project)}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }
        )).json();
        const buckets = Array.isArray(bRes?.items) ? bRes.items : [];
        if (buckets.length > 0) {
          runFirebase(['deploy', '--only', 'storage', '--project', opts.project], REPO_ROOT);
          const relList = await (await fetch(
            `https://firebaserules.googleapis.com/v1/projects/${opts.project}/releases`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }
          )).json();
          const storageRel = (relList.releases || []).find(r => r.name.includes('firebase.storage'));
          if (storageRel) {
            const storageShort = storageRel.name.split('/releases/')[1];
            state.storageRulesVerification = await verifyLiveRulesSha256(
              opts.project,
              storageShort,
              path.join(APP_ROOT, 'storage.rules'),
              token
            );
          } else {
            state.storageRulesVerification = { status: 'DEPLOYED_UNVERIFIED_RELEASE_NAME' };
          }
        } else {
          state.storageRulesVerification = {
            status: 'NOT_PROVISIONED_ON_FIREBASE',
            reason: 'No Firebase Storage bucket initialized on project; storage.rules verified locally and ready',
          };
        }
      }
      state.activeRulesProfile = 'v2';
      state.steps.deploy_v2_rules = 'PASSED';
      saveCheckpoint(opts.checkpoint, state);
    }

    // 9. Reopen & rollback package verification
    assert.equal(sha256File(ROLLBACK_ZIP), ROLLBACK_SHA256);
    state.steps.reopen_verify = 'PASSED';
    state.status = 'COMPLETED';
    saveCheckpoint(opts.checkpoint, state);

    console.log(JSON.stringify({
      ok: true,
      mode: opts.mode,
      projectId: opts.project,
      status: state.status,
      activeRulesProfile: state.activeRulesProfile,
      indexesVerified: state.indexesVerified || [],
      freezeRulesVerification: state.freezeRulesVerification || null,
      frontendVerification: state.frontendVerification || null,
      v2RulesVerification: state.v2RulesVerification || null,
      storageRulesVerification: state.storageRulesVerification || null,
      preBonificaMetrics0000: state.preBonificaMetrics0000 || null,
      postBonificaMetrics0000: state.postBonificaMetrics0000 || null,
      stats: state.bonificaProgress.stats,
      auditResult: state.auditResult,
      rollbackZipSha256: ROLLBACK_SHA256,
    }, null, 2));
  } catch (err) {
    if (!err.isSimulatedInterruption) {
      state.status = state.activeRulesProfile === 'freeze' ? 'FAILED_KEEP_FREEZE' : 'FAILED';
      state.lastError = err.message;
      saveCheckpoint(opts.checkpoint, state);
    }
    console.error(JSON.stringify({
      ok: false,
      status: state.status,
      activeRulesProfile: state.activeRulesProfile,
      error: err.message,
      checkpoint: opts.checkpoint,
    }));
    process.exit(err.exitCode || 1);
  }
}

main().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(err.exitCode || 1);
});
