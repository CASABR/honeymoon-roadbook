import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const isExecute = process.argv.includes('--execute');
const auditDir = 'docs/audit/roadbook-0000-2026-10-28';

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
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

function decodeValue(value) {
  if (!value || typeof value !== 'object') return value;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('stringValue' in value) return value.stringValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, nested]) => [key, decodeValue(nested)]));
  }
  return value;
}

function encodeValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(encodeValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = encodeValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function decodeDocument(document) {
  return {
    id: document.name.split('/').at(-1),
    ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decodeValue(value)])),
    _firestoreCreateTime: document.createTime,
    _firestoreUpdateTime: document.updateTime
  };
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

async function getAccessToken() {
  const configRaw = await readFile('C:/Users/CUSI/.config/configstore/firebase-tools.json', 'utf8');
  const config = JSON.parse(configRaw);
  const clientId = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
  const clientSecret = 'j9iVZfS8kkCEFUPaAeJV0sAi';
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: config.tokens.refresh_token
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Impossibile ottenere token OAuth: ' + JSON.stringify(data));
  }
  return { token: data.access_token, user: config.user };
}

async function listSubcollection(token, collection) {
  let docs = [];
  let pageToken = '';
  do {
    const url = `https://firestore.googleapis.com/v1/projects/app-viaggio-di-nozze/databases/(default)/documents/trips/0000/${collection}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return [];
    if (!res.ok) {
      throw new Error(`Errore lista ${collection}: HTTP ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    if (data.documents) docs = docs.concat(data.documents);
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function getDocument(token, docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/app-viaggio-di-nozze/databases/(default)/documents/${docPath}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Errore lettura ${docPath}: HTTP ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function main() {
  console.log(`=== HOUNIGO: APPLICAZIONE CONTROLLATA ROADBOOK 0000 ===`);
  console.log(`Modalità: ${isExecute ? '*** ESECUZIONE REALE ***' : 'PREFLIGHT / DRY-RUN SICURO'}`);

  // 1. Auth & Safety Checks
  const { token, user } = await getAccessToken();
  console.log(`Autenticato come: ${user.email} (sub: ${user.sub})`);

  const tripDoc = await getDocument(token, 'trips/0000');
  if (!tripDoc) throw new Error('Viaggio trips/0000 non trovato su Firestore!');
  const tripFields = tripDoc.fields || {};
  const ownerUid = tripFields.ownerUid?.stringValue;
  const ownerEmail = tripFields.ownerEmail?.stringValue;
  console.log(`Viaggio 0000: "${tripFields.title?.stringValue}", ownerUid: ${ownerUid}, ownerEmail: ${ownerEmail}`);
  if (ownerEmail !== user.email) {
    throw new Error(`Mismatch owner email: atteso ${ownerEmail}, loggato ${user.email}`);
  }

  // 2. Load Manifest & Diff
  const manifest = JSON.parse(await readFile(path.join(auditDir, 'generated', 'application-manifest.json'), 'utf8'));
  const diff = JSON.parse(await readFile(path.join(auditDir, 'generated', 'proposed-diff.json'), 'utf8'));

  if (manifest.tripId !== '0000') throw new Error('Manifest non appartiene a trip 0000');
  if (manifest.operations.length !== 102) throw new Error(`Attese 102 operazioni nel manifest, trovate ${manifest.operations.length}`);
  if (diff.length !== 102) throw new Error(`Attese 102 operazioni nel diff, trovate ${diff.length}`);

  // 3. Fresh Backup
  console.log('\n--- FASE 1: ACQUISIZIONE BACKUP FRESCO AUTENTICATO ---');
  const collectionsToBackup = [
    'giorni', 'attivita', 'alloggi', 'trasporti', 'documenti',
    'tappe', 'ristoranti', 'shopping', 'spese', 'note',
    'bagagli', 'settings', 'members', 'devices', 'locks'
  ];

  const freshCloudCollections = {};
  for (const col of collectionsToBackup) {
    const rawDocs = await listSubcollection(token, col);
    freshCloudCollections[col] = rawDocs;
    process.stdout.write(`  ${col}: ${rawDocs.length} docs  `);
  }
  console.log('\nBackup scaricato con successo.');

  const freshBackupData = {
    format: 'hounigo-firestore-rest-fresh-backup-v1',
    tripId: '0000',
    capturedAt: new Date().toISOString(),
    ownerUid,
    ownerEmail,
    trip: tripDoc,
    collections: freshCloudCollections
  };

  const freshBackupPath = path.join(auditDir, 'private', 'cloud-pre-apply-20261028.json');
  await writeFile(freshBackupPath, JSON.stringify(freshBackupData, null, 2));
  console.log(`Backup fresco salvato in: ${freshBackupPath}`);

  // Decode fresh records for validation
  const freshDecoded = {};
  for (const [col, docs] of Object.entries(freshCloudCollections)) {
    freshDecoded[col] = docs
      .filter(d => !d.name.split('/').at(-1).startsWith('att_chunk_'))
      .map(decodeDocument)
      .map(r => sanitize(r));
  }

  // 4. Concurrency & Precondition Verification
  console.log('\n--- FASE 2: VERIFICA PRECONDIZIONI (CONCURRENCY CHECK) ---');
  const diffMap = new Map();
  for (const item of diff) {
    diffMap.set(`${item.collection}/${item.id}`, item);
  }

  let updatesChecked = 0;
  let deletesChecked = 0;
  let addsChecked = 0;

  for (const op of manifest.operations) {
    const [col, id] = op.key.split('/');
    const currentDoc = (freshDecoded[col] || []).find(d => d.id === id);

    if (op.action === 'update') {
      if (!currentDoc) {
        throw new Error(`PRECONDIZIONE FALLITA: doc da aggiornare non esiste su Firestore: ${op.key}`);
      }
      const currentHash = hashCanonical(currentDoc);
      if (currentHash !== op.expectedBefore.sha256) {
        throw new Error(`CONCURRENCY CONFLICT: hash per ${op.key} cambiato su Firestore! Atteso ${op.expectedBefore.sha256}, trovato ${currentHash}`);
      }
      updatesChecked++;
    } else if (op.action === 'delete') {
      if (!currentDoc) {
        throw new Error(`PRECONDIZIONE FALLITA: doc da cancellare non esiste su Firestore: ${op.key}`);
      }
      const currentHash = hashCanonical(currentDoc);
      if (currentHash !== op.expectedBefore.sha256) {
        throw new Error(`CONCURRENCY CONFLICT: doc da cancellare ${op.key} modificato su Firestore! Atteso ${op.expectedBefore.sha256}, trovato ${currentHash}`);
      }
      deletesChecked++;
    } else if (op.action === 'add') {
      if (currentDoc) {
        throw new Error(`PRECONDIZIONE FALLITA: doc da aggiungere esiste già su Firestore: ${op.key}`);
      }
      addsChecked++;
    }

    if (op.tombstone) {
      const existingTombstone = (freshDecoded.settings || []).find(d => d.id === `tombstone_${col}_${id}`);
      if (existingTombstone) {
        console.warn(`Avviso: tombstone già presente: tombstone_${col}_${id}`);
      }
    }
  }

  console.log(`Precondizioni verificate con successo:`);
  console.log(`  - ${updatesChecked} aggiornamenti: hash identici al snapshot approvato`);
  console.log(`  - ${deletesChecked} cancellazioni: hash identici al snapshot approvato`);
  console.log(`  - ${addsChecked} aggiunte: assenti su Firestore`);

  // 5. Construct Firestore Writes Array (120 writes)
  console.log('\n--- FASE 3: COSTRUZIONE SCRITTURE ATOMICHE FIRESTORE ---');
  const now = Date.now();
  const applyTimestampIso = new Date().toISOString();
  const writes = [];

  for (const op of manifest.operations) {
    const [col, id] = op.key.split('/');
    const diffItem = diffMap.get(op.key);
    const docPath = `projects/app-viaggio-di-nozze/databases/(default)/documents/trips/0000/${col}/${id}`;

    if (op.action === 'update') {
      const payload = { ...diffItem.after };
      delete payload._firestoreCreateTime;
      delete payload._firestoreUpdateTime;
      payload.updatedAt = now;

      const fields = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v !== undefined) fields[k] = encodeValue(v);
      }

      writes.push({
        update: {
          name: docPath,
          fields
        },
        currentDocument: { exists: true }
      });
    } else if (op.action === 'delete') {
      writes.push({
        delete: docPath,
        currentDocument: { exists: true }
      });
    } else if (op.action === 'add') {
      const payload = { ...diffItem.after };
      delete payload._firestoreCreateTime;
      delete payload._firestoreUpdateTime;
      payload.createdAt = now;
      payload.updatedAt = now;

      const fields = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v !== undefined) fields[k] = encodeValue(v);
      }

      writes.push({
        update: {
          name: docPath,
          fields
        },
        currentDocument: { exists: false }
      });
    }

    if (op.tombstone) {
      const tombstoneKey = `tombstone_${col}_${id}`;
      const tombstoneDocPath = `projects/app-viaggio-di-nozze/databases/(default)/documents/trips/0000/settings/${tombstoneKey}`;
      writes.push({
        update: {
          name: tombstoneDocPath,
          fields: {
            id: { stringValue: tombstoneKey },
            value: {
              mapValue: {
                fields: {
                  entityType: { stringValue: col },
                  deletedId: { stringValue: id },
                  timestamp: { integerValue: String(now) },
                  deletedAt: { integerValue: String(now) },
                  pending: { booleanValue: false }
                }
              }
            }
          }
        }
      });
    }
  }

  console.log(`Scritture preparate: ${writes.length} (limite transazione: 500)`);
  if (writes.length !== 120) {
    throw new Error(`Errore: attese esattamente 120 scritture, preparate ${writes.length}`);
  }

  if (!isExecute) {
    console.log('\n[PREFLIGHT SUPERATO] Per applicare realmente, eseguire con: node scripts/apply-roadbook-0000.mjs --execute');
    return;
  }

  // 6. Execute Atomic Commit
  console.log('\n--- FASE 4: ESECUZIONE TRANSAZIONE ATOMICA SU FIRESTORE ---');
  const commitUrl = 'https://firestore.googleapis.com/v1/projects/app-viaggio-di-nozze/databases/(default)/documents:commit';
  const commitRes = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ writes })
  });

  if (!commitRes.ok) {
    const errorBody = await commitRes.text();
    throw new Error(`TRANSAZIONE FALLITA! HTTP ${commitRes.status}: ${errorBody}`);
  }

  const commitData = await commitRes.json();
  console.log(`Transazione Firestore COMPLETATA CON SUCCESSO!`);
  console.log(`Commit Time: ${commitData.commitTime}`);
  console.log(`Write results ricevuti: ${commitData.writeResults?.length}`);

  // 7. Verification Phase
  console.log('\n--- FASE 5: VERIFICA REALE POST-TRANSAZIONE ---');
  let verifiedUpdates = 0;
  let verifiedDeletes = 0;
  let verifiedAdds = 0;
  let verifiedTombstones = 0;

  for (const op of manifest.operations) {
    const [col, id] = op.key.split('/');
    const doc = await getDocument(token, `trips/0000/${col}/${id}`);

    if (op.action === 'update') {
      if (!doc) throw new Error(`Verifica fallita: record aggiornato non trovato: ${op.key}`);
      verifiedUpdates++;
    } else if (op.action === 'delete') {
      if (doc) throw new Error(`Verifica fallita: record cancellato ancora presente: ${op.key}`);
      verifiedDeletes++;
    } else if (op.action === 'add') {
      if (!doc) throw new Error(`Verifica fallita: record aggiunto non trovato: ${op.key}`);
      verifiedAdds++;
    }

    if (op.tombstone) {
      const tombDoc = await getDocument(token, `trips/0000/settings/tombstone_${col}_${id}`);
      if (!tombDoc) throw new Error(`Verifica fallita: tombstone non trovato: tombstone_${col}_${id}`);
      verifiedTombstones++;
    }
  }

  console.log(`Rilettura da Firestore completata:`);
  console.log(`  - 76 aggiornamenti verificati: ${verifiedUpdates}/76`);
  console.log(`  - 18 cancellazioni verificate (404 Not Found): ${verifiedDeletes}/18`);
  console.log(`  - 8 aggiunte verificate: ${verifiedAdds}/8`);
  console.log(`  - 18 tombstones verificate: ${verifiedTombstones}/18`);

  // Check unique IDs in affected collections
  for (const col of ['alloggi', 'attivita', 'ristoranti', 'shopping', 'tappe', 'trasporti']) {
    const postDocs = await listSubcollection(token, col);
    const ids = postDocs.map(d => d.name.split('/').at(-1));
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error(`ID duplicati riscontrati in ${col} dopo l'applicazione!`);
    }
    console.log(`  ${col}: ${ids.length} documenti, zero duplicati.`);
  }

  // 8. Save Receipt
  const receipt = {
    format: 'hounigo-application-receipt-v1',
    tripId: '0000',
    executedAt: applyTimestampIso,
    commitTime: commitData.commitTime,
    idempotencyKey: manifest.idempotencyKey,
    preApplyBackupSha256: sha256(await readFile(freshBackupPath)),
    writesCommitted: writes.length,
    operationsApplied: {
      updates: verifiedUpdates,
      deletes: verifiedDeletes,
      adds: verifiedAdds,
      tombstones: verifiedTombstones
    },
    rollbackReady: true,
    rollbackBackupPath: freshBackupPath
  };

  const receiptPath = path.join(auditDir, 'private', 'application-receipt-0000-20261028.json');
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(`\nRicevuta applicativa salvata in: ${receiptPath}`);
  console.log(`=== APPLICAZIONE COMPLETATA CON SUCCESSO ===`);
}

main().catch(err => {
  console.error('\n*** ERRORE CRITICO:', err);
  process.exit(1);
});
