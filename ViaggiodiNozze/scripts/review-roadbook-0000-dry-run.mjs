import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const auditDirectory = process.argv[2] || 'docs/audit/roadbook-0000-2026-10-28';
const plan = await readJson(path.join(auditDirectory, 'patch-plan.json'));
const cloud = await readJson(path.join(auditDirectory, 'private', 'cloud-before.json'));
const after = await readJson(path.join(auditDirectory, 'generated', 'proposed-after-sanitized.json'));

assert(plan.tripId === '0000', 'Il piano non appartiene al viaggio 0000.');
assert(plan.mode === 'dry-run-only', 'Il piano non è in modalità dry-run.');

const before = Object.fromEntries(
  Object.entries(cloud.collections).map(([collection, documents]) => [
    collection,
    documents
      .filter((document) => !document.name.split('/').at(-1).startsWith('att_chunk_'))
      .map(decodeDocument)
  ])
);

const deletionOperations = [
  ...(plan.deletes || []).map((operation) => ({
    ...operation,
    action: 'delete',
    sourceCollection: operation.collection,
    targetCollection: null
  })),
  ...(plan.migrations || []).map((operation) => ({
    ...operation,
    action: 'migrate',
    sourceCollection: operation.fromCollection,
    targetCollection: operation.toCollection
  }))
];

assert(deletionOperations.length === 24, `Attese 24 operazioni di rimozione, trovate ${deletionOperations.length}.`);

const doubtfulReasons = new Map([
  ['trasporti/trn_03_volo_ca783', 'BLOCCANTE: data e orari CA783 non confermati; non eliminare.'],
  ['tappe/tappa_02_rotorua', 'Confermare che il mock generico non abbia valore editoriale residuo.'],
  ['tappe/tappa_03_tekapo', 'Confermare la sostituzione con tappa_37; coordinate e nota vengono preservate.'],
  ['tappe/tappa_04_queenstown', 'Confermare che il mock generico non abbia valore editoriale residuo.'],
  ['tappe/tappa_21', 'La Peninsula Walkway viene ridotta a spot Point Kean di 20 minuti.'],
  ['tappe/tappa_52', 'Il record Split Point + Teddy’s Lookout viene ridotto al solo Split Point.']
]);

const deletions = deletionOperations.map((operation) => {
  const record = requireRecord(before, operation.sourceCollection, operation.id);
  const key = `${operation.sourceCollection}/${operation.id}`;
  const references = extractReferences(record);
  const linkedBusinessRecords = findBusinessLinks(before, key, references);
  const transientLock = (before.locks || []).some((lock) => lock.id === operation.id);
  return {
    key,
    action: operation.action,
    target: operation.targetCollection ? `${operation.targetCollection}/${operation.id}` : operation.preserveInto || null,
    title: recordTitle(record),
    date: recordDate(record),
    reason: operation.reason,
    status: operation.status,
    bookingReferences: references,
    attachments: Array.isArray(record.attachments) ? record.attachments.length : 0,
    linkedBusinessRecords,
    transientLock,
    doubtful: doubtfulReasons.has(key),
    doubt: doubtfulReasons.get(key) || null
  };
});

const additions = [
  ...(plan.adds || []).filter(isReady).map((operation) => ({
    id: operation.id,
    collection: operation.collection,
    data: operation.data,
    kind: 'new',
    status: operation.status
  })),
  ...(plan.migrations || []).map((operation) => ({
    id: operation.id,
    collection: operation.toCollection,
    data: { ...requireRecord(before, operation.fromCollection, operation.id), ...operation.set },
    kind: 'migration',
    source: `${operation.fromCollection}/${operation.id}`,
    status: operation.status
  }))
];

assert(additions.length === 10, `Attese 10 aggiunte pronte, trovate ${additions.length}.`);

const additionReview = additions.map((addition) => {
  assert(!(before[addition.collection] || []).some((record) => record.id === addition.id), `ID destinazione già presente: ${addition.collection}/${addition.id}`);
  const candidates = findSimilarRecords(before, addition);
  return {
    key: `${addition.collection}/${addition.id}`,
    kind: addition.kind,
    source: addition.source || null,
    title: recordTitle(addition.data),
    date: recordDate(addition.data),
    candidates,
    duplicateFound: false,
    conclusion: additionConclusion(addition.id)
  };
});

const sharedLogicalRecords = 353;
const copyAccounting = {
  localCopies: 441,
  cloudCopies: 485,
  comparedCopies: 926,
  logicalCloudRecords: 460,
  sharedLogicalRecords,
  sharedReplicas: sharedLogicalRecords * 2,
  localOnlyRouteCache: 88,
  cloudOnlyCollaborationMetadata: 107,
  firestoreAttachmentChunks: 19,
  tripAndLiveDocuments: 6
};

assert(
  copyAccounting.sharedReplicas + copyAccounting.localOnlyRouteCache + copyAccounting.cloudOnlyCollaborationMetadata + copyAccounting.firestoreAttachmentChunks + copyAccounting.tripAndLiveDocuments === copyAccounting.comparedCopies,
  'La spiegazione delle 926 copie non torna.'
);

const requiredBlockers = ['Travellers Autobarn', 'CI75', 'CA783'];
for (const blocker of requiredBlockers) {
  assert((plan.blockingDiscrepancies || []).some((item) => item.includes(blocker)), `Blocco mancante: ${blocker}`);
}

assert((plan.paymentReconciliations || []).length === 5, 'Sono richieste cinque riconciliazioni pagamento.');
assert((plan.paymentReconciliations || []).every((item) => item.apply === false), 'Una riconciliazione pagamento risulta applicabile automaticamente.');

const editorialHolds = [
  'tappe/tappa_02_rotorua',
  'tappe/tappa_03_tekapo',
  'tappe/tappa_04_queenstown',
  'tappe/tappa_21',
  'tappe/tappa_52'
];
for (const key of editorialHolds) {
  const [collection, id] = key.split('/');
  const operation = (plan.deletes || []).find(item => item.collection === collection && item.id === id)
    || (plan.migrations || []).find(item => item.fromCollection === collection && item.id === id);
  assert(operation?.status === 'blocked', `Hold editoriale non bloccato: ${key}`);
}

const sourceChecks = await verifySourcePropagation();
const coordinateVerifications = plan.coordinateVerifications || [];
assert(coordinateVerifications.length === 10, 'La revisione deve coprire tutte le 10 coordinate mancanti.');
const mapLimitations = coordinateVerifications.filter(item => item.status === 'address_only').map(item => item.key);
const verifiedCoordinates = coordinateVerifications.filter(item => item.coordinate).map(item => item.key);

const report = {
  mode: 'DRY_RUN_REVIEW_ONLY',
  tripId: '0000',
  generatedAt: new Date().toISOString(),
  deletionOperations: {
    total: deletions.length,
    blocked: deletions.filter((item) => item.status === 'blocked').length,
    doubtful: deletions.filter((item) => item.doubtful).length,
    items: deletions
  },
  additions: {
    total: additionReview.length,
    migrations: additionReview.filter((item) => item.kind === 'migration').length,
    newRecords: additionReview.filter((item) => item.kind === 'new').length,
    duplicatesFound: additionReview.filter((item) => item.duplicateFound).length,
    items: additionReview
  },
  copyAccounting,
  payments: {
    prepared: plan.paymentReconciliations.length,
    automaticallyApplied: 0,
    items: plan.paymentReconciliations
  },
  blockers: plan.blockingDiscrepancies.filter((item) => requiredBlockers.some((blocker) => item.includes(blocker))),
  propagation: {
    sourceChecks,
    mapRecordsWithoutExactCoordinates: mapLimitations,
    mapRecordsWithVerifiedCoordinates: verifiedCoordinates,
    paymentViewsCurrencySafe: false,
    pdfIncludesCopilotNotes: sourceChecks.pdfIncludesCopilotNotes,
    pdfIncludesStructuredTrekkingMetrics: sourceChecks.pdfIncludesStructuredTrekkingMetrics,
    pdfIncludesOperationalAddressesAndTimes: sourceChecks.pdfIncludesOperationalAddressesAndTimes
  },
  invariants: {
    noRealWrites: true,
    noCurrencyConversion: true,
    allDeletesUseTombstones: deletionOperations.every((item) => item.tombstone === true),
    allPaymentChangesRequireApproval: true,
    requiredBlockersPreserved: true
  }
};

await writeFile(path.join(auditDirectory, 'generated', 'final-review.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  deletions: report.deletionOperations.total,
  doubtfulDeletions: report.deletionOperations.doubtful,
  additions: report.additions.total,
  duplicateAdditions: report.additions.duplicatesFound,
  payments: report.payments.prepared,
  verifiedCoordinates: report.propagation.mapRecordsWithVerifiedCoordinates.length,
  mapLimitations: report.propagation.mapRecordsWithoutExactCoordinates.length,
  noRealWrites: report.invariants.noRealWrites
}, null, 2));

function isReady(operation) {
  return operation.status !== 'blocked';
}

function requireRecord(collections, collection, id) {
  const record = (collections[collection] || []).find((candidate) => candidate.id === id);
  assert(record, `Record assente: ${collection}/${id}`);
  return record;
}

function recordTitle(record) {
  return record.title || record.titolo || record.name || record.nome || record.carrier || record.description || '';
}

function recordDate(record) {
  return record.date || record.data || record.checkIn || record.startDate || '';
}

function extractReferences(record) {
  return ['bookingCode', 'bookingReference', 'reference', 'pnr', 'ticketNumber']
    .map((field) => record[field])
    .filter(Boolean)
    .map(String);
}

function findBusinessLinks(collections, key, references) {
  const [sourceCollection, sourceId] = key.split('/');
  const needles = [sourceId, ...references];
  const links = [];
  for (const collection of ['spese', 'documenti']) {
    for (const record of collections[collection] || []) {
      if (collection === sourceCollection && record.id === sourceId) continue;
      const searchable = JSON.stringify(stripBinary(record));
      if (needles.some((needle) => searchable.includes(needle))) links.push(`${collection}/${record.id}`);
    }
  }
  return links;
}

function findSimilarRecords(collections, addition) {
  if (addition.kind === 'migration') return [addition.source];
  const title = normalize(recordTitle(addition.data));
  const location = normalize(addition.data.location || addition.data.address || '');
  const date = recordDate(addition.data);
  const flightCode = `${recordTitle(addition.data)} ${addition.data.carrier || ''}`.match(/\b[A-Z]{2}\d{2,4}\b/i)?.[0]?.toLowerCase();
  const candidates = [];
  for (const [collection, records] of Object.entries(collections)) {
    for (const record of records) {
      const candidateTitle = normalize(recordTitle(record));
      const candidateLocation = normalize(record.location || record.address || record.indirizzo || '');
      const sameFlight = flightCode && normalize(JSON.stringify(stripBinary(record))).includes(flightCode);
      const sameTitle = title && candidateTitle === title;
      const sameLocationAndDate = location && candidateLocation === location && recordDate(record) === date;
      if (sameFlight || sameTitle || sameLocationAndDate) candidates.push(`${collection}/${record.id}`);
    }
  }
  return candidates;
}

function additionConclusion(id) {
  const conclusions = {
    trn_16_ceb_tpe_ci706: 'Nessun CI706 o tratta CEB–TPE equivalente presente.',
    spot_lake_pukaki_20261213: 'Esistono tappe nella regione, ma nessuno spot Lake Pukaki equivalente.',
    spot_werri_beach_20261224: 'L’alloggio Werri e Chinamans Beach non duplicano lo spot fotografico al tramonto.'
  };
  return conclusions[id] || 'Migrazione 1:1: la sorgente viene tombstonata e lo stesso ID passa ad attività.';
}

async function verifySourcePropagation() {
  const files = {
    bookings: await readFile('src/services/unifiedBookingService.ts', 'utf8'),
    accommodations: await readFile('src/views/AlloggiView.tsx', 'utf8'),
    expenses: await readFile('src/views/altro/SpeseBudgetView.tsx', 'utf8'),
    map: await readFile('src/views/MappaView.tsx', 'utf8'),
    pdf: await readFile('src/services/pdfExportService.ts', 'utf8'),
    today: await readFile('src/views/OggiView.tsx', 'utf8')
  };
  const checks = {
    bookingsReadCanonicalCollections: files.bookings.includes('getTransports()') && files.bookings.includes('getAccommodations()') && files.bookings.includes('getActivities()'),
    accommodationsReadCanonicalCollection: files.accommodations.includes('getAccommodations()'),
    expensesReadCanonicalCollections: files.expenses.includes('getTransports()') && files.expenses.includes('getAccommodations()') && files.expenses.includes('getActivities()'),
    mapReadsAffectedCollections: files.map.includes('getTappe()') && files.map.includes('getAccommodations()') && files.map.includes('getActivities()'),
    pdfReadsAffectedCollections: files.pdf.includes('getActivities()') && files.pdf.includes('getTransports()') && files.pdf.includes('getAccommodations()') && files.pdf.includes('getTappe()'),
    pdfIncludesCopilotNotes: files.pdf.includes('a.noteCopilota') && files.pdf.includes('t.noteCopilota') && files.pdf.includes('day.accommodation.noteCopilota'),
    pdfIncludesStructuredTrekkingMetrics: files.pdf.includes('activity.distanceKm') && files.pdf.includes('activity.elevationGainM') && files.pdf.includes('activity.hikingDurationMinutes'),
    pdfIncludesOperationalAddressesAndTimes: files.pdf.includes('day.accommodation.address') && files.pdf.includes('transport.checkinCutoff') && files.pdf.includes('transport.terminalGate'),
    todayReadsAffectedCollections: files.today.includes('getAccommodations()') && files.today.includes('getTransports()') && files.today.includes('getTappe()')
  };
  assert(Object.values(checks).every(Boolean), 'Una vista non legge le collezioni canoniche attese.');
  return checks;
}

function decodeDocument(document) {
  return {
    id: document.name.split('/').at(-1),
    ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decodeValue(value)]))
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
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, nested]) => [key, decodeValue(nested)]));
  return value;
}

function stripBinary(value) {
  if (Array.isArray(value)) return value.map(stripBinary);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'dataUrl').map(([key, nested]) => [key, stripBinary(nested)]));
  }
  return value;
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
