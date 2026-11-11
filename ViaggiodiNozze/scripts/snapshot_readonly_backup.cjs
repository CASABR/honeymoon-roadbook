/**
 * HOUNIGO — Read-Only Complete Firestore Snapshot & Integrity Verifier
 *
 * STRICTLY READ-ONLY (`GET` requests only). Never writes, patches, deletes, or prints private values.
 * Stores separated shared vs private backups under gitignored `backups/pre-bonifica-2026-11-11/`.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'backups', 'pre-bonifica-2026-11-11');
const PROJECT_ID = 'app-viaggio-di-nozze';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const SHARED_SUBCOLS = ['trasporti', 'alloggi', 'attivita', 'tappe', 'ristoranti', 'shopping', 'giorni', 'bagagli'];
const PRIVATE_SUBCOLS = ['private_credentials', 'documenti', 'spese', 'note', 'settings', 'members', 'devices', 'locks', 'invites', 'inviteTokens'];
const LIVE_SUBCOLS = ['updates', 'guest_messages', 'gps_control', 'locations'];

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

async function listCollection(colPath, token) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${BASE}/${colPath}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(25000),
    });
    if (res.status === 404) return [];
    if (!res.ok) {
      throw new Error(`Read-only GET failed (${res.status}) at ${colPath}`);
    }
    const json = await res.json();
    for (const d of json.documents || []) {
      docs.push({
        id: d.name.split('/').at(-1),
        path: d.name.slice(d.name.indexOf('/documents/') + 11),
        createTime: d.createTime || null,
        updateTime: d.updateTime || null,
        rawFields: d.fields || {},
        data: { id: d.name.split('/').at(-1), ...decodeFields(d.fields) },
      });
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return docs;
}

function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const authPath = process.env.HOUNIGO_FIREBASE_CLI_AUTH_MODULE
    || path.join(process.env.APPDATA, 'npm/node_modules/firebase-tools/lib/auth.js');
  const auth = require(authPath);
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error('Existing Firebase CLI auth required for read-only snapshot.');
  }
  const tok = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const token = tok.access_token;

  const trips = await listCollection('trips', token);
  const liveFeeds = await listCollection('live_feeds', token);

  const sharedSnapshot = {
    sourceProject: PROJECT_ID,
    capturedAt: new Date().toISOString(),
    schemaTarget: 2,
    trips: {},
    live_feeds: {},
  };

  const privateSnapshot = {
    sourceProject: PROJECT_ID,
    capturedAt: sharedSnapshot.capturedAt,
    trips: {},
  };

  const counts = {
    tripsCount: trips.length,
    liveFeedsCount: liveFeeds.length,
    sharedDocsTotal: 0,
    privateDocsTotal: 0,
    liveDocsTotal: 0,
    byTrip: {},
  };

  for (const trip of trips) {
    const tripId = trip.id;
    sharedSnapshot.trips[tripId] = {
      root: { id: trip.id, createTime: trip.createTime, updateTime: trip.updateTime, rawFields: trip.rawFields, data: trip.data },
      collections: {},
    };
    privateSnapshot.trips[tripId] = { collections: {} };
    counts.byTrip[tripId] = { shared: {}, private: {}, live: {} };

    const sharedEntries = await Promise.all(
      SHARED_SUBCOLS.map(async col => [col, await listCollection(`trips/${tripId}/${col}`, token)])
    );
    for (const [col, docs] of sharedEntries) {
      sharedSnapshot.trips[tripId].collections[col] = docs;
      counts.byTrip[tripId].shared[col] = docs.length;
      counts.sharedDocsTotal += docs.length;
    }

    const privEntries = await Promise.all(
      PRIVATE_SUBCOLS.map(async col => [col, await listCollection(`trips/${tripId}/${col}`, token)])
    );
    for (const [col, docs] of privEntries) {
      privateSnapshot.trips[tripId].collections[col] = docs;
      counts.byTrip[tripId].private[col] = docs.length;
      counts.privateDocsTotal += docs.length;
    }
  }

  for (const feed of liveFeeds) {
    const feedId = feed.id;
    const sub = {};
    const liveEntries = await Promise.all(
      LIVE_SUBCOLS.map(async col => [col, await listCollection(`live_feeds/${feedId}/${col}`, token)])
    );
    counts.byTrip[feedId] = counts.byTrip[feedId] || { shared: {}, private: {}, live: {} };
    for (const [col, docs] of liveEntries) {
      sub[col] = docs;
      counts.byTrip[feedId].live[col] = docs.length;
      counts.liveDocsTotal += docs.length;
    }
    sharedSnapshot.live_feeds[feedId] = {
      root: { id: feed.id, createTime: feed.createTime, updateTime: feed.updateTime, rawFields: feed.rawFields, data: feed.data },
      subcollections: sub,
    };
  }

  // Build plain decoded 0000 compat snapshot for test_release_160_compatibility.cjs
  const t0Shared = sharedSnapshot.trips['0000']?.collections || {};
  const t0Priv = privateSnapshot.trips['0000']?.collections || {};
  const compat0000 = {
    sourceProject: PROJECT_ID,
    capturedAt: sharedSnapshot.capturedAt,
    trasporti: (t0Shared.trasporti || []).map(d => d.data),
    alloggi: (t0Shared.alloggi || []).map(d => d.data),
    attivita: (t0Shared.attivita || []).map(d => d.data),
    tappe: (t0Shared.tappe || []).map(d => d.data),
    ristoranti: (t0Shared.ristoranti || []).map(d => d.data),
    shopping: (t0Shared.shopping || []).map(d => d.data),
    giorni: (t0Shared.giorni || []).map(d => d.data),
    bagagli: (t0Shared.bagagli || []).map(d => d.data),
    private_credentials: (t0Priv.private_credentials || []).map(d => d.data),
  };

  const sharedPath = path.join(OUT_DIR, 'shared-snapshot.json');
  const privatePath = path.join(OUT_DIR, 'private-snapshot.json');
  const compatPath = path.join(OUT_DIR, 'trip-0000-compat-snapshot.json');
  fs.writeFileSync(sharedPath, JSON.stringify(sharedSnapshot, null, 2));
  fs.writeFileSync(privatePath, JSON.stringify(privateSnapshot, null, 2));
  fs.writeFileSync(compatPath, JSON.stringify(compat0000, null, 2));

  // Verify readability + SHA-256 integrity after write
  const reReadShared = JSON.parse(fs.readFileSync(sharedPath, 'utf8'));
  const reReadPrivate = JSON.parse(fs.readFileSync(privatePath, 'utf8'));
  const reReadCompat = JSON.parse(fs.readFileSync(compatPath, 'utf8'));
  assert.equal(Object.keys(reReadShared.trips).length, trips.length);
  assert.equal(Object.keys(reReadPrivate.trips).length, trips.length);
  assert.equal(reReadCompat.trasporti.length, (t0Shared.trasporti || []).length);

  const hashes = {
    'shared-snapshot.json': sha256File(sharedPath),
    'private-snapshot.json': sha256File(privatePath),
    'trip-0000-compat-snapshot.json': sha256File(compatPath),
  };

  const manifest = {
    capturedAt: sharedSnapshot.capturedAt,
    sourceProject: PROJECT_ID,
    mode: 'read-only-rest',
    productionWrites: 0,
    counts,
    files: hashes,
    verifiedReadable: true,
  };
  const manifestPath = path.join(OUT_DIR, 'MANIFEST.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  hashes['MANIFEST.json'] = sha256File(manifestPath);

  const shaLines = Object.entries(hashes).map(([f, h]) => `${h}  ${f}`).join('\n') + '\n';
  fs.writeFileSync(path.join(OUT_DIR, 'SHA256SUMS.txt'), shaLines);

  // Print ONLY counts & hashes — NEVER private content or credentials
  console.log(JSON.stringify({
    outDir: 'backups/pre-bonifica-2026-11-11',
    tripsCount: counts.tripsCount,
    liveFeedsCount: counts.liveFeedsCount,
    sharedDocsTotal: counts.sharedDocsTotal,
    privateDocsTotal: counts.privateDocsTotal,
    liveDocsTotal: counts.liveDocsTotal,
    hashes,
    productionWrites: 0,
  }, null, 2));
})();

