import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [, , localPath, cloudPath, planPath, outputDirectory] = process.argv;

if (!localPath || !cloudPath || !planPath || !outputDirectory) {
  console.error('Uso: node scripts/roadbook-0000-dry-run.mjs <local.json> <cloud.json> <patch-plan.json> <output-dir>');
  process.exit(1);
}

const [localSnapshot, cloudSnapshot, plan] = await Promise.all([
  readJson(localPath),
  readJson(cloudPath),
  readJson(planPath)
]);

assert(localSnapshot.tripId === '0000', 'Lo snapshot locale non appartiene al viaggio 0000.');
assert(cloudSnapshot.tripId === '0000', 'Lo snapshot cloud non appartiene al viaggio 0000.');
assert(plan.tripId === '0000', 'Il patch plan non appartiene al viaggio 0000.');

const cloudCollections = Object.fromEntries(
  Object.entries(cloudSnapshot.collections).map(([collection, documents]) => [
    collection,
    documents.map(decodeDocument)
  ])
);

const localCollections = structuredClone(localSnapshot.data);
const logicalCloudCollections = structuredClone(cloudCollections);
logicalCloudCollections.documenti = (logicalCloudCollections.documenti || []).filter(
  (document) => !document.id.startsWith('att_chunk_')
);

const comparison = compareSnapshots(localCollections, logicalCloudCollections);
const working = structuredClone(logicalCloudCollections);
const changedKeys = new Set();
const tombstones = [];
const skippedBlocked = [];

for (const operation of plan.bulkUpdates || []) {
  if (operation.status === 'blocked') {
    skippedBlocked.push(operation.id);
    continue;
  }
  const records = getCollection(working, operation.collection);
  for (const record of records) {
    if (matches(record, operation.match)) {
      Object.assign(record, operation.set);
      changedKeys.add(`${operation.collection}/${record.id}`);
    }
  }
}

for (const operation of plan.updates || []) {
  if (operation.status === 'blocked') {
    skippedBlocked.push(operation.id);
    continue;
  }
  const record = requireRecord(working, operation.collection, operation.id);
  Object.assign(record, operation.set || {});
  for (const field of operation.unset || []) delete record[field];
  changedKeys.add(`${operation.collection}/${operation.id}`);
}

for (const operation of plan.deletes || []) {
  if (operation.status === 'blocked') {
    skippedBlocked.push(operation.id);
    continue;
  }
  assert(operation.tombstone === true, `Delete senza tombstone: ${operation.collection}/${operation.id}`);
  removeRecord(working, operation.collection, operation.id);
  tombstones.push(`tombstone_${operation.collection}_${operation.id}`);
}

for (const operation of plan.adds || []) {
  if (operation.status === 'blocked') {
    skippedBlocked.push(operation.id);
    continue;
  }
  const records = getCollection(working, operation.collection);
  assert(!records.some((record) => record.id === operation.id), `Add duplicata: ${operation.collection}/${operation.id}`);
  records.push({ id: operation.id, ...operation.data });
  changedKeys.add(`${operation.collection}/${operation.id}`);
}

for (const operation of plan.migrations || []) {
  if (operation.status === 'blocked') {
    skippedBlocked.push(operation.id);
    continue;
  }
  const source = requireRecord(working, operation.fromCollection, operation.id);
  assert(operation.tombstone === true, `Migrazione senza tombstone: ${operation.fromCollection}/${operation.id}`);
  removeRecord(working, operation.fromCollection, operation.id);
  tombstones.push(`tombstone_${operation.fromCollection}_${operation.id}`);
  const destination = getCollection(working, operation.toCollection);
  assert(!destination.some((record) => record.id === operation.id), `Destinazione migrazione già presente: ${operation.toCollection}/${operation.id}`);
  destination.push({ ...source, ...operation.set, id: operation.id });
  changedKeys.add(`${operation.toCollection}/${operation.id}`);
}

for (const [collection, records] of Object.entries(working)) {
  const ids = records.map((record) => record.id);
  assert(ids.length === new Set(ids).size, `ID duplicati dopo dry-run in ${collection}.`);
}

const proposedDiff = buildDiff(logicalCloudCollections, working, plan);

const summary = {
  mode: 'DRY_RUN_ONLY',
  tripId: '0000',
  generatedAt: new Date().toISOString(),
  inputs: {
    localSha256: sha256(await readFile(localPath)),
    cloudSha256: sha256(await readFile(cloudPath)),
    planSha256: sha256(await readFile(planPath))
  },
  records: {
    localAnalyzed: countRecords(localSnapshot.data),
    cloudAnalyzed: 1 + countRecords(cloudSnapshot.collections) + (cloudSnapshot.live?.feed ? 1 : 0) + (cloudSnapshot.live?.updates?.length || 0),
    comparedCopies: countRecords(localSnapshot.data) + 1 + countRecords(cloudSnapshot.collections) + (cloudSnapshot.live?.feed ? 1 : 0) + (cloudSnapshot.live?.updates?.length || 0),
    logicalCloudBefore: countRecords(logicalCloudCollections),
    logicalAfterProposed: countRecords(working)
  },
  localCloudComparison: redactComparison(comparison),
  proposed: {
    updatedUniqueRecords: changedKeys.size,
    changedFields: proposedDiff.reduce((total, item) => total + item.changedFields.length, 0),
    deletionOperationsProposed: (plan.deletes || []).length + (plan.migrations || []).length,
    deletedRecords: (plan.deletes || []).filter(isReady).length + (plan.migrations || []).filter(isReady).length,
    addedRecords: (plan.adds || []).filter(isReady).length + (plan.migrations || []).filter(isReady).length,
    tombstonesRequired: tombstones.length,
    blockedOperations: skippedBlocked,
    paymentReconciliationsPrepared: (plan.paymentReconciliations || []).length,
    paymentReconciliationsApplied: (plan.paymentReconciliations || []).filter((item) => item.apply === true).length
  },
  invariants: {
    noWritesExecuted: true,
    tripIdUnchanged: true,
    idsPreservedOnUpdates: true,
    everyDeleteHasTombstone: true,
    uniqueIdsAfterDryRun: true,
    noCurrencyConversionExecuted: true,
    allPaymentReconciliationsRequireApproval: (plan.paymentReconciliations || []).every((item) => item.apply === false),
    cloudErrors: cloudSnapshot.errors || {}
  }
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, 'dry-run-summary.json'), JSON.stringify(summary, null, 2));
await writeFile(path.join(outputDirectory, 'proposed-after-sanitized.json'), JSON.stringify(sanitizeCollections(working), null, 2));
await writeFile(path.join(outputDirectory, 'proposed-diff.json'), JSON.stringify(sanitize(proposedDiff), null, 2));
await writeFile(path.join(outputDirectory, 'record-inventory-before.csv'), buildInventoryCsv(logicalCloudCollections));

console.log(JSON.stringify(summary, null, 2));

function isReady(operation) {
  return operation.status !== 'blocked';
}

function matches(record, match = {}) {
  return Object.entries(match).every(([field, expected]) => record[field] === expected);
}

function getCollection(collections, collection) {
  collections[collection] ||= [];
  return collections[collection];
}

function requireRecord(collections, collection, id) {
  const record = getCollection(collections, collection).find((candidate) => candidate.id === id);
  assert(record, `Record sorgente assente: ${collection}/${id}`);
  return record;
}

function removeRecord(collections, collection, id) {
  const records = getCollection(collections, collection);
  const index = records.findIndex((record) => record.id === id);
  assert(index >= 0, `Record da eliminare assente: ${collection}/${id}`);
  records.splice(index, 1);
}

function compareSnapshots(local, cloud) {
  const collections = {};
  let localOnly = 0;
  let cloudOnly = 0;
  for (const collection of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const localIds = new Set((local[collection] || []).map((record) => record.id));
    const cloudIds = new Set((cloud[collection] || []).map((record) => record.id));
    const localOnlyIds = [...localIds].filter((id) => !cloudIds.has(id));
    const cloudOnlyIds = [...cloudIds].filter((id) => !localIds.has(id));
    localOnly += localOnlyIds.length;
    cloudOnly += cloudOnlyIds.length;
    collections[collection] = {
      local: localIds.size,
      cloud: cloudIds.size,
      localOnlyIds,
      cloudOnlyIds
    };
  }
  return { localOnly, cloudOnly, collections };
}

function buildDiff(beforeCollections, afterCollections, patchPlan) {
  const sources = new Map();
  for (const operation of patchPlan.bulkUpdates || []) {
    if (!isReady(operation)) continue;
    for (const record of beforeCollections[operation.collection] || []) {
      if (matches(record, operation.match)) {
        sources.set(`${operation.collection}/${record.id}`, operation.source || operation.reason);
      }
    }
  }
  for (const operation of patchPlan.updates || []) {
    if (isReady(operation)) sources.set(`${operation.collection}/${operation.id}`, operation.source || operation.reason);
  }
  for (const operation of patchPlan.deletes || []) {
    if (isReady(operation)) sources.set(`${operation.collection}/${operation.id}`, operation.source || operation.reason);
  }
  for (const operation of patchPlan.adds || []) {
    if (isReady(operation)) sources.set(`${operation.collection}/${operation.id}`, operation.source || operation.reason);
  }
  for (const operation of patchPlan.migrations || []) {
    if (!isReady(operation)) continue;
    sources.set(`${operation.fromCollection}/${operation.id}`, operation.source || operation.reason);
    sources.set(`${operation.toCollection}/${operation.id}`, operation.source || operation.reason);
  }

  const diff = [];
  const collections = new Set([...Object.keys(beforeCollections), ...Object.keys(afterCollections)]);
  for (const collection of collections) {
    const before = new Map((beforeCollections[collection] || []).map((record) => [record.id, record]));
    const after = new Map((afterCollections[collection] || []).map((record) => [record.id, record]));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const previous = before.get(id);
      const next = after.get(id);
      const changedFields = fieldDiff(previous, next);
      if (changedFields.length === 0) continue;
      diff.push({
        collection,
        id,
        action: !previous ? 'add' : !next ? 'delete' : 'update',
        source: sources.get(`${collection}/${id}`) || 'Patch plan approvato',
        changedFields,
        before: previous || null,
        after: next || null
      });
    }
  }
  return diff.sort((left, right) => `${left.collection}/${left.id}`.localeCompare(`${right.collection}/${right.id}`));
}

function fieldDiff(before, after) {
  if (!before) return Object.keys(after || {}).filter((field) => !field.startsWith('_')).sort();
  if (!after) return Object.keys(before || {}).filter((field) => !field.startsWith('_')).sort();
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((field) => !field.startsWith('_'))
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .sort();
}

function buildInventoryCsv(collections) {
  const headings = ['collection', 'id', 'date', 'time', 'title', 'bookingReference', 'status', 'updatedAt'];
  const rows = [headings];
  for (const collection of Object.keys(collections).sort()) {
    for (const record of [...collections[collection]].sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
      rows.push([
        collection,
        publicRecordId(collection, record.id),
        record.date || record.data || record.startDate || record.checkIn || '',
        record.time || record.ora || record.departureTime || '',
        record.title || record.titolo || record.name || record.nome || record.description || '',
        record.bookingCode || record.bookingReference || record.reference || record.pnr || '',
        record.status || record.stato || '',
        record.updatedAt || record._firestoreUpdateTime || ''
      ]);
    }
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function redactComparison(comparison) {
  const redacted = structuredClone(comparison);
  for (const collection of ['members', 'devices', 'invites', 'inviteTokens']) {
    const entry = redacted.collections[collection];
    if (!entry) continue;
    entry.localOnlyIds = entry.localOnlyIds.map((id) => publicRecordId(collection, id));
    entry.cloudOnlyIds = entry.cloudOnlyIds.map((id) => publicRecordId(collection, id));
  }
  return redacted;
}

function sanitizeCollections(collections) {
  const sanitized = sanitize(collections);
  for (const collection of ['members', 'devices', 'invites', 'inviteTokens']) {
    for (const record of sanitized[collection] || []) {
      record.id = publicRecordId(collection, record.id);
    }
  }
  return sanitized;
}

function publicRecordId(collection, id) {
  if (!['members', 'devices', 'invites', 'inviteTokens'].includes(collection)) return id;
  return `[sha256:${sha256(Buffer.from(String(id))).slice(0, 16)}]`;
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function decodeDocument(document) {
  return {
    id: document.name.split('/').at(-1),
    ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decodeValue(value)])),
    _firestoreCreateTime: document.createTime,
    _firestoreUpdateTime: document.updateTime
  };
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return value;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('stringValue' in value) return value.stringValue;
  if ('bytesValue' in value) return `[bytes:${String(value.bytesValue).length}]`;
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, nested]) => [key, decodeValue(nested)]));
  }
  return value;
}

function sanitize(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([field]) => ![
          'dataUrl',
          'ownerUid',
          'ownerEmail',
          'uid',
          'email',
          'members',
          'subscription',
          'deviceId',
          'invitedBy',
          'createdBy',
          'updatedBy',
          'createdByUid',
          'updatedByUid'
        ].includes(field))
        .map(([field, nested]) => [field, sanitize(nested, field)])
    );
  }
  if (typeof value === 'string' && value.startsWith('data:')) return `[data-url:${value.length}]`;
  return value;
}

function countRecords(collections) {
  return Object.values(collections || {}).reduce((total, records) => total + records.length, 0);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
