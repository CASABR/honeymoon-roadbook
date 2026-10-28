import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const auditDirectory = process.argv[2] || 'docs/audit/roadbook-0000-2026-10-28';
const [summary, diff, plan] = await Promise.all([
  readJson(path.join(auditDirectory, 'generated', 'dry-run-summary.json')),
  readJson(path.join(auditDirectory, 'generated', 'proposed-diff.json')),
  readJson(path.join(auditDirectory, 'patch-plan.json'))
]);

assert(summary.tripId === '0000' && plan.tripId === '0000', 'Il manifest deve riferirsi solo al viaggio 0000.');
assert(summary.invariants?.noWritesExecuted === true, 'Il manifest richiede un dry-run senza scritture.');
assert((plan.paymentReconciliations || []).every(item => item.apply === false), 'Le riconciliazioni multivaluta devono restare sospese.');

const forbiddenKeys = new Set([
  'tappe/tappa_02_rotorua',
  'tappe/tappa_03_tekapo',
  'tappe/tappa_04_queenstown',
  'tappe/tappa_21',
  'attivita/tappa_21',
  'tappe/tappa_52',
  'attivita/tappa_52',
  'trasporti/trn_03_volo_ca783',
  'trasporti/transport_flight_pek_akl',
  'trasporti/trn_16_ceb_tpe_fco'
]);

for (const item of diff) {
  assert(!forbiddenKeys.has(`${item.collection}/${item.id}`), `Operazione bloccata inclusa nel manifest: ${item.collection}/${item.id}`);
}

const operations = diff.map(item => {
  const key = `${item.collection}/${item.id}`;
  const beforeHash = item.before ? hashCanonical(item.before) : null;
  const intendedAfterHash = item.after ? hashCanonical(item.after) : null;
  return {
    key,
    action: item.action,
    expectedBefore: item.before
      ? { exists: true, sha256: beforeHash, updatedAt: item.before.updatedAt ?? null }
      : { exists: false, sha256: null, updatedAt: null },
    intendedAfterSha256: intendedAfterHash,
    tombstone: item.action === 'delete'
      ? {
          key: `settings/tombstone_${item.collection}_${item.id}`,
          entityType: item.collection,
          deletedId: item.id,
          timestampAssignedAtApply: true
        }
      : null,
    source: item.source
  };
});

const tombstoneCount = operations.filter(item => item.tombstone).length;
const transactionWrites = operations.length + tombstoneCount;
assert(transactionWrites < 500, `Il piano supera il limite di una transazione Firestore: ${transactionWrites} scritture.`);

const manifestSeed = {
  cloudBackupSha256: summary.inputs.cloudSha256,
  planSha256: summary.inputs.planSha256,
  operations: operations.map(({ key, action, expectedBefore, intendedAfterSha256 }) => ({ key, action, expectedBefore, intendedAfterSha256 }))
};

const manifest = {
  format: 'hounigo-roadbook-0000-application-manifest-v1',
  mode: 'PREPARATION_ONLY_NO_WRITES',
  tripId: '0000',
  generatedAt: new Date().toISOString(),
  idempotencyKey: `roadbook-0000-${hashCanonical(manifestSeed).slice(0, 24)}`,
  source: {
    cloudBackupSha256: summary.inputs.cloudSha256,
    localBackupSha256: summary.inputs.localSha256,
    patchPlanSha256: summary.inputs.planSha256
  },
  gate: {
    requireFreshAuthenticatedBackup: true,
    requireExactHashMatchForEveryExistingRecord: true,
    requireAddsToRemainAbsent: true,
    abortBeforeFirstWriteOnAnyMismatch: true,
    oneFirestoreTransaction: true,
    transactionWrites,
    maxTransactionWrites: 499,
    noRealWritesExecuted: true
  },
  operations,
  rollback: {
    source: 'private/cloud-before.json',
    requireApplicationReceiptWithActualAfterHashes: true,
    refuseRestoreIfAnyCurrentHashDiffersFromReceipt: true,
    restoreOriginalDocumentsAndRemoveOnlyMatchingTombstones: true,
    neverOverwritePostApplicationChanges: true
  },
  exclusions: {
    editorialHolds: [...forbiddenKeys].filter(key => key.includes('tappa_02') || key.includes('tappa_03') || key.includes('tappa_04') || key.includes('tappa_21') || key.includes('tappa_52')),
    blockers: ['CA783', 'CI75', 'Travellers Autobarn'],
    paymentReconciliationsApplied: 0
  }
};

await writeFile(path.join(auditDirectory, 'generated', 'application-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({
  idempotencyKey: manifest.idempotencyKey,
  operations: operations.length,
  tombstones: tombstoneCount,
  transactionWrites,
  noRealWrites: manifest.gate.noRealWritesExecuted
}, null, 2));

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function hashCanonical(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
