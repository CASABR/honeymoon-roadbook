// Read-only audit. No Firestore writes, deletes, or rule deployments exist in this script.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/utils/securityDataSplitter.ts'), 'utf8');
const exported = {};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, {exports: exported});
const sensitive = new Set(exported.SENSITIVE_KEYS);
const shared = ['alloggi', 'trasporti', 'attivita', 'tappe', 'ristoranti', 'shopping', 'giorni', 'bagagli'];
function findSensitive(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const field = prefix ? `${prefix}.${key}` : key;
    return [...(sensitive.has(key) ? [field] : []), ...findSensitive(child, field)];
  });
}
function decode(v) {
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,n]) => [k,decode(n)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  for (const k of ['stringValue', 'integerValue', 'doubleValue', 'booleanValue', 'nullValue', 'timestampValue']) if (k in v) return v[k];
  return null;
}
function populatedPaths(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const field = prefix ? `${prefix}.${key}` : key;
    const populated = child !== null && child !== '' && child !== undefined
      && (typeof child !== 'object' || Object.keys(child).length > 0);
    return [...(sensitive.has(key) && populated ? [field] : []), ...populatedPaths(child, field)];
  });
}
async function auditProduction() {
  const authPath = process.env.HOUNIGO_FIREBASE_CLI_AUTH_MODULE || path.join(process.env.APPDATA, 'npm/node_modules/firebase-tools/lib/auth.js');
  const auth = require(authPath);
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error('Existing Firebase CLI login required; no login is created by this audit.');
  const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const base = 'https://firestore.googleapis.com/v1/projects/app-viaggio-di-nozze/databases/(default)/documents';
  async function list(col) {
    const docs = []; let pageToken = '';
    do {
      const url = `${base}/${col}?pageSize=300${pageToken ? '&pageToken='+encodeURIComponent(pageToken) : ''}`;
      const res = await fetch(url, {method: 'GET', headers: {Authorization: `Bearer ${token.access_token}`}, signal: AbortSignal.timeout(20000)});
      if (!res.ok) throw new Error(`Read-only audit failed: HTTP ${res.status} at ${col}`);
      const data = await res.json();
      docs.push(...(data.documents || []).map(d => ({id: d.name.split('/').at(-1), data: Object.fromEntries(Object.entries(d.fields || {}).map(([k,v]) => [k,decode(v)]))})));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return docs;
  }
  const report = {mode: 'production-readonly', scannedAt: new Date().toISOString(), trips: [], findings: [], tripFindings: [], liveFindings: [], scannedDocuments: 0};
  for (const trip of await list('trips')) {
    report.trips.push(trip.id);
    const rootFields = findSensitive(trip.data);
    if (rootFields.length) report.tripFindings.push({path:`trips/${trip.id}`,fields:rootFields,nonEmptyFields:populatedPaths(trip.data)});
    const collections = await Promise.all(shared.map(async col => [col, await list(`trips/${trip.id}/${col}`)]));
    for (const [col, documents] of collections) for (const doc of documents) {
      report.scannedDocuments++;
      const fields = findSensitive(doc.data);
      if (fields.length) report.findings.push({path: `trips/${trip.id}/${col}/${doc.id}`, fields, nonEmptyFields: populatedPaths(doc.data)});
    }
    for (const doc of await list(`live_feeds/${trip.id}/updates`)) {
      const fields = findSensitive(doc.data);
      const allowed = ['title','text','photoUrl','timestamp','locationName','reactionCounts','deleted','deletedAt','deletedBy'];
      const unexpected = Object.keys(doc.data).filter(k => !allowed.includes(k));
      if (fields.length || unexpected.length || (doc.data.deleted && doc.data.photoUrl)) report.liveFindings.push({path: `live_feeds/${trip.id}/updates/${doc.id}`, fields, unexpected, deletedWithPhotoReference: Boolean(doc.data.deleted && doc.data.photoUrl)});
    }
  }
  for (const doc of await list('live_feeds')) {
    const allowed=['title','coverPhotoUrl','status','currentCity','lastUpdateAt','statusMessage','statusUpdatedAt'];
    const unexpected=Object.keys(doc.data).filter(k=>!allowed.includes(k));
    if(unexpected.length) report.liveFindings.push({path:`live_feeds/${doc.id}`,unexpected});
  }
  return report;
}
async function main() {
  const production = process.argv.includes('--production-readonly');
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex < 0) throw new Error('Pass --output <local-report.json>. Reports contain field paths only, never values or tokens.');
  let report;
  if (production) report = await auditProduction();
  else {
    const index = process.argv.indexOf('--snapshot');
    if (index < 0) throw new Error('Pass --snapshot <saved-backup.json> or --production-readonly.');
    const snapshot = JSON.parse(fs.readFileSync(process.argv[index + 1], 'utf8'));
    report = {mode: 'local-snapshot', source: path.basename(process.argv[index + 1]), findings: []};
    for (const col of shared) for (const doc of snapshot[col] || snapshot.collections?.[col] || []) {
      const fields = findSensitive(doc);
      if (fields.length) report.findings.push({path: `trips/0000/${col}/${doc.id}`, fields});
    }
  }
  fs.writeFileSync(process.argv[outputIndex + 1], JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify({mode:report.mode, scannedDocuments:report.scannedDocuments, affectedDocuments:report.findings.length, populatedAffectedDocuments:report.findings.filter(d=>d.nonEmptyFields?.length).length, tripFindings:report.tripFindings?.length, liveFindings:report.liveFindings?.length}));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
