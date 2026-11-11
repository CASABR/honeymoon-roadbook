/**
 * HOUNIGO — Read-Only Classification & Dry-Run Plan on Local Snapshot (Phase 3.1)
 *
 * Reads ONLY local `backups/pre-bonifica-2026-11-11/shared-snapshot.json` and `private-snapshot.json`.
 * NEVER prints confidential field values; outputs counts & field names only.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const APP_ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.resolve(APP_ROOT, '..', 'backups', 'pre-bonifica-2026-11-11');

function loadTs(relative) {
  const exports = {};
  const source = fs.readFileSync(path.join(APP_ROOT, relative), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: () => ({}), console });
  return exports;
}

const security = loadTs('src/utils/securityDataSplitter.ts');
const sensitiveSet = new Set(security.SENSITIVE_KEYS);
const SHARED_SUBCOLS = ['trasporti', 'alloggi', 'attivita', 'tappe', 'ristoranti', 'shopping', 'giorni', 'bagagli'];

function collectSensitiveFieldPaths(val, prefix = '') {
  if (!val || typeof val !== 'object') return [];
  if (Array.isArray(val)) return val.flatMap((v, idx) => collectSensitiveFieldPaths(v, `${prefix}[${idx}]`));
  const out = [];
  for (const [k, v] of Object.entries(val)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (sensitiveSet.has(k)) out.push(p);
    if (v && typeof v === 'object') out.push(...collectSensitiveFieldPaths(v, p));
  }
  return out;
}

const sharedSnap = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'shared-snapshot.json'), 'utf8'));
const privateSnap = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, 'private-snapshot.json'), 'utf8'));

const summary = {
  analyzedAt: new Date().toISOString(),
  sourceCapturedAt: sharedSnap.capturedAt,
  totalSharedDocs: 0,
  totalProblematicWithSensitive: 0,
  trip0000SharedDocs: 0,
  trip0000ProblematicWithSensitive: 0,
  categories: {
    already_v2_clean: 0,
    clean_legacy_needs_marker: 0,
    dirty_sensitive_needs_bonifica: 0,
    legacy_unknown_fields_needs_classification: 0,
  },
  sensitiveFieldCounts: {},
  unsupportedFieldCounts: {},
  vaultConflictCount: 0,
  liveSummary: { feeds: 0, updatesTotal: 0, updatesPublishableLegacy: 0, updatesNeedsReview: 0, guestMessagesTotal: 0 },
  tripRootSensitiveFields: [],
  byTrip: {},
};

const planItems = [];

for (const [tripId, tripEntry] of Object.entries(sharedSnap.trips || {})) {
  const privVaultDocs = privateSnap.trips?.[tripId]?.collections?.private_credentials || [];
  const vaultById = new Map(privVaultDocs.map(d => [d.id, d.data]));

  const rootSensitive = collectSensitiveFieldPaths(tripEntry.root?.data);
  if (rootSensitive.length > 0) {
    summary.tripRootSensitiveFields.push({ tripId, fields: rootSensitive });
  }

  summary.byTrip[tripId] = {
    total: 0,
    already_v2_clean: 0,
    clean_legacy_needs_marker: 0,
    dirty_sensitive_needs_bonifica: 0,
    legacy_unknown_fields_needs_classification: 0,
  };

  for (const col of SHARED_SUBCOLS) {
    const docs = tripEntry.collections?.[col] || [];
    const allowed = security.PUBLIC_DATA_SCHEMAS[col] || [];

    for (const rec of docs) {
      summary.totalSharedDocs++;
      summary.byTrip[tripId].total++;
      if (tripId === '0000') summary.trip0000SharedDocs++;

      const data = rec.data;
      const sensitivePaths = collectSensitiveFieldPaths(data);
      const unsupportedKeys = Object.keys(data).filter(
        k => !sensitiveSet.has(k) && (!allowed.includes(k) || !security.publicValueIsSupported(k, data[k]))
      );
      const hasUnapprovedDocRef =
        (data.linkedDocumentId != null && !(Array.isArray(data.publicDocumentIds) && data.publicDocumentIds.includes(data.linkedDocumentId))) ||
        (Array.isArray(data.linkedDocumentIds) && data.linkedDocumentIds.some(id => !(Array.isArray(data.publicDocumentIds) && data.publicDocumentIds.includes(id))));

      for (const sp of sensitivePaths) {
        const key = `${col}.${sp}`;
        summary.sensitiveFieldCounts[key] = (summary.sensitiveFieldCounts[key] || 0) + 1;
      }
      for (const uk of unsupportedKeys) {
        const key = `${col}.${uk}`;
        summary.unsupportedFieldCounts[key] = (summary.unsupportedFieldCounts[key] || 0) + 1;
      }

      const normType = security.normalizeEntityType(col);
      const vaultId = security.getVaultDocId(normType, data.id);
      const existingVault = vaultById.get(vaultId) || vaultById.get(data.id) || null;
      let hasVaultDivergence = false;
      if (existingVault) {
        for (const k of sensitivePaths.map(p => p.split('.')[0])) {
          if (existingVault[k] !== undefined && data[k] !== undefined && JSON.stringify(existingVault[k]) !== JSON.stringify(data[k])) {
            hasVaultDivergence = true;
          }
        }
      }
      if (hasVaultDivergence) summary.vaultConflictCount++;

      let classification;
      if (sensitivePaths.length > 0 || hasUnapprovedDocRef) {
        classification = 'dirty_sensitive_needs_bonifica';
        summary.totalProblematicWithSensitive++;
        if (tripId === '0000') summary.trip0000ProblematicWithSensitive++;
      } else if (unsupportedKeys.length > 0 || data.publicSchemaVersion === 0) {
        classification = 'legacy_unknown_fields_needs_classification';
      } else if (data.publicSchemaVersion === 2) {
        classification = 'already_v2_clean';
      } else {
        classification = 'clean_legacy_needs_marker';
      }

      summary.categories[classification]++;
      summary.byTrip[tripId][classification]++;

      planItems.push({
        path: `trips/${tripId}/${col}/${rec.id}`,
        tripId,
        collection: col,
        docId: rec.id,
        vaultId,
        classification,
        hasExistingVault: Boolean(existingVault),
        hasVaultDivergence,
        sensitiveFieldNames: sensitivePaths,
        unsupportedFieldNames: unsupportedKeys,
        hasUnapprovedDocRef,
      });
    }
  }
}

for (const [feedId, feedEntry] of Object.entries(sharedSnap.live_feeds || {})) {
  summary.liveSummary.feeds++;
  const updates = feedEntry.subcollections?.updates || [];
  const guestMsgs = feedEntry.subcollections?.guest_messages || [];
  summary.liveSummary.updatesTotal += updates.length;
  summary.liveSummary.guestMessagesTotal += guestMsgs.length;
  for (const u of updates) {
    const keys = Object.keys(u.data).filter(k => k !== 'id');
    const allowed = ['title', 'text', 'photoUrl', 'timestamp', 'locationName', 'reactionCounts', 'deleted', 'deletedAt', 'deletedBy', 'publicSchemaVersion'];
    const bad = keys.filter(k => !allowed.includes(k) || sensitiveSet.has(k));
    if (bad.length === 0 && !u.data.deleted) summary.liveSummary.updatesPublishableLegacy++;
    else summary.liveSummary.updatesNeedsReview++;
  }
}

const outPath = path.join(BACKUP_DIR, 'BONIFICA_DRYRUN_REPORT.json');
fs.writeFileSync(outPath, JSON.stringify({ summary, itemsCount: planItems.length, items: planItems }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));

