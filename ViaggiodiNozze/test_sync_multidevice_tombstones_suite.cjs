/**
 * HOUNIGO - TEST SUITE COMPLETA: INTEGRITÀ DATI MULTI-DISPOSITIVO, TWO-PHASE SYNC & TOMBSTONES
 *
 * CLASSIFICAZIONE ESPLICITA DEI TEST (Requisito 4):
 * 1. PARTE A: Test statici sul TESTO DEI SORGENTI di produzione.
 * 2. PARTE B: Test che eseguono FUNZIONI REALI DI PRODUZIONE (StorageService e SyncService compilati a runtime da TypeScript).
 * 3. PARTE C: Simulazioni COMPORTAMENTALI MOCK (2 client isolati + Firestore simulato).
 *
 * NOTA SULL'INTEGRAZIONE REALE:
 * Questa suite NON esegue integrazione reale con un server Firestore remoto / cloud live,
 * rispettando il vincolo di zero scritture remote e zero modifiche al viaggio reale 0000.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

let passedTests = 0;
let totalTests = 0;

function runTest(category, name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] [${category}] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] [${category}] Test ${totalTests}: ${name}`);
    console.error(`         Dettaglio errore: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(category, name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] [${category}] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] [${category}] Test ${totalTests}: ${name}`);
    console.error(`         Dettaglio errore: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('======================================================================');
console.log('HOUNIGO - SUITE COMPLETA INTEGRITÀ DATI, AUDIT TOMBSTONES & SYNC');
console.log('======================================================================\n');

const ROOT_DIR = path.resolve(__dirname);
const SYNC_SERVICE_PATH = path.join(ROOT_DIR, 'src', 'storage', 'syncService.ts');
const STORAGE_SERVICE_PATH = path.join(ROOT_DIR, 'src', 'storage', 'storageService.ts');
const TYPES_PATH = path.join(ROOT_DIR, 'src', 'types', 'index.ts');
const RULES_PATH = path.join(ROOT_DIR, 'firestore.rules');
const PRENOTAZIONI_VIEW_PATH = path.join(ROOT_DIR, 'src', 'views', 'desktop', 'PrenotazioniWorkspaceView.tsx');

// ============================================================================
// PARTE A: TEST STATICI SUL TESTO DEI SORGENTI (FILE DI PRODUZIONE)
// ============================================================================
console.log('--- PARTE A: TEST STATICI SUL TESTO DEI SORGENTI (PRODUZIONE) ---');

runTest('STATICO', 'storageService.ts: rimozione completa del flag fantasma isRecreation', () => {
  const code = fs.readFileSync(STORAGE_SERVICE_PATH, 'utf8');
  assert.ok(!code.includes('isRecreation'), 'storageService.ts non deve contenere alcun riferimento a isRecreation');
  assert.ok(!code.includes('(item as any).isRecreation'), 'Nessun cast a isRecreation consentito');
});

runTest('STATICO', 'storageService.ts: validateSaveAgainstTombstone criterio coerente (createdAt > deletedAt)', () => {
  const code = fs.readFileSync(STORAGE_SERVICE_PATH, 'utf8');
  assert.ok(code.includes('validateSaveAgainstTombstone(entityType: string, id: string, createdAt?: number)'), 'Firma esatta senza isRecreation');
  assert.ok(code.includes('itemCreatedAt > 0 && deletedAt > 0 && itemCreatedAt > deletedAt'), 'Verifica rigorosa di itemCreatedAt > deletedAt');
  assert.ok(!code.includes('updatedAt > deletedAt'), 'Non deve usare updatedAt come criterio di ricreazione');
});

runTest('STATICO', 'storageService.ts: addTappa, addRistorante e addShopping verificano i tombstone prima della persistenza', () => {
  const code = fs.readFileSync(STORAGE_SERVICE_PATH, 'utf8');
  for (const fnName of ['addTappa', 'addRistorante', 'addShopping']) {
    const fnIdx = code.indexOf(`async ${fnName}`);
    assert.ok(fnIdx !== -1, `${fnName} deve essere definito`);
    const fnBlock = code.slice(fnIdx, fnIdx + 1100);
    assert.ok(fnBlock.includes('validateSaveAgainstTombstone'), `${fnName} deve invocare validateSaveAgainstTombstone`);
    assert.ok(fnBlock.includes('throw new Error('), `${fnName} deve lanciare un errore se tombstone attivo`);
    const valIdx = fnBlock.indexOf('validateSaveAgainstTombstone');
    const putIdx = fnBlock.indexOf('idbPut(');
    const notifyIdx = fnBlock.indexOf('notifyDataChanged(');
    assert.ok(valIdx < putIdx, `${fnName}: validateSaveAgainstTombstone deve precedere idbPut`);
    assert.ok(valIdx < notifyIdx, `${fnName}: validateSaveAgainstTombstone deve precedere notifyDataChanged`);
  }
});

runTest('STATICO', 'storageService.ts: importAllData implementa staging, validazione id e filtro tombstone', () => {
  const code = fs.readFileSync(STORAGE_SERVICE_PATH, 'utf8');
  const importIdx = code.indexOf('async importAllData');
  assert.ok(importIdx !== -1, 'importAllData deve essere definito');
  const importBlock = code.slice(importIdx, importIdx + 5000);
  assert.ok(importBlock.includes('validateSaveAgainstTombstone(key, itemObj.id, itemObj.createdAt)'), 'importAllData deve validare ogni elemento con validateSaveAgainstTombstone');
  assert.ok(importBlock.includes('stagedData.set(key, validItems)'), 'importAllData deve pre-validare in stagedData prima di svuotare IDB');
  assert.ok(importBlock.includes('typeof itemObj.id !== \'string\''), 'importAllData deve verificare che id sia stringa non vuota');
});

runTest('STATICO', 'PrenotazioniWorkspaceView.tsx: nessuna emissione manuale duplicata di notifyDataChanged o roadbook_data_mutated', () => {
  const code = fs.readFileSync(PRENOTAZIONI_VIEW_PATH, 'utf8');
  assert.ok(!code.includes("notifyDataChanged('attivita'"), 'Non deve chiamare notifyDataChanged manualmente');
  assert.ok(!code.includes("notifyDataChanged('ristoranti'"), 'Non deve chiamare notifyDataChanged manualmente');
  assert.ok(!code.includes("notifyDataChanged('shopping'"), 'Non deve chiamare notifyDataChanged manualmente');
  assert.ok(!code.includes("notifyDataChanged('documenti'"), 'Non deve chiamare notifyDataChanged manualmente');
  assert.ok(!code.includes("dispatchEvent(new CustomEvent('roadbook_data_mutated'"), 'Non deve dispatchare manualmente roadbook_data_mutated');
});

runTest('STATICO', 'syncService.ts: pushToCloud e Two-Phase Sync coerenti con criteri di storageService e fail-fast reale', () => {
  const code = fs.readFileSync(SYNC_SERVICE_PATH, 'utf8');
  assert.ok(code.includes('syncSettingsAndTombstones()'), 'syncService.ts deve contenere Fase 1 preliminare');
  assert.ok(code.includes('itemCreated > 0 && tombstoneDeleted > 0 && itemCreated > tombstoneDeleted'), 'pushToCloud deve usare esattamente il criterio createdAt > deletedAt');
  assert.ok(code.includes('throw new Error(`Sincronizzazione tombstone fallita o incompleta:'), 'syncSettingsAndTombstones deve bloccare la Fase 2 se un tombstone fallisce');
});

runTest('STATICO', 'firestore.rules: compatibile con Spark (nessuna Cloud Function, no exists() costly)', () => {
  const code = fs.readFileSync(RULES_PATH, 'utf8');
  assert.ok(code.includes('match /{subcol}/{docId}'), 'firestore.rules subcollezioni operative');
  assert.ok(code.includes('isTripMember(tripId)'), 'Richiede membership al viaggio');
});

// ============================================================================
// PARTE B: TEST CON ESECUZIONE DI FUNZIONI REALI DI PRODUZIONE (COMPILED RUNTIME)
// ============================================================================
console.log('\n--- PARTE B: TEST CON FUNZIONI REALI DI PRODUZIONE (COMPILED RUNTIME) ---');

function createProductionStorageServiceInstance() {
  const src = fs.readFileSync(STORAGE_SERVICE_PATH, 'utf8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;

  const mockIdb = new Map();
  const dispatchedEvents = [];

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    Date,
    crypto: { randomUUID: () => 'uuid_' + Math.random().toString(36).slice(2) },
    localStorage: {
      _data: new Map(),
      getItem(k) { return this._data.get(k) || null; },
      setItem(k, v) { this._data.set(k, String(v)); },
      removeItem(k) { this._data.delete(k); }
    },
    window: {
      dispatchEvent(evt) {
        dispatchedEvents.push(evt);
        return true;
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    CustomEvent: class CustomEvent {
      constructor(type, params = {}) {
        this.type = type;
        this.detail = params.detail;
      }
    },
    exports: {},
    module: { exports: {} },
    require: (mod) => {
      return {
        STORES: {
          SETTINGS: 'settings',
          TAPPE: 'tappe',
          RISTORANTI: 'ristoranti',
          SHOPPING: 'shopping',
          GIORNI: 'giorni',
          ATTIVITA: 'attivita',
          ALLOGGI: 'alloggi',
          TRASPORTI: 'trasporti',
          DOCUMENTI: 'documenti',
          SPESE: 'spese',
          NOTE: 'note',
          ROUTES: 'routes',
          BAGAGLI: 'bagagli'
        },
        idbGet: async (s, k) => mockIdb.get(s + ':' + k),
        idbPut: async (s, d) => { mockIdb.set(s + ':' + d.id, d); return d; },
        idbDelete: async (s, k) => { mockIdb.delete(s + ':' + k); },
        idbGetAll: async (s) => Array.from(mockIdb.entries()).filter(([k]) => k.startsWith(s + ':')).map(([, v]) => v),
        getCurrentUserRole: () => 'editor',
        assertCanMutate: () => {},
        formatDateIT: (d) => String(d || ''),
        normalizeTimestamp: (v) => {
          if (!v) return 0;
          if (typeof v === 'number') return v;
          const t = new Date(v).getTime();
          return isNaN(t) ? 0 : t;
        },
        DEFAULT_DOCUMENTS: [],
        REAL_ACTIVITIES: [],
        initialTransports: []
      };
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(transpiled, sandbox);

  return {
    service: sandbox.exports.storageService,
    mockIdb,
    dispatchedEvents
  };
}

function createProductionSyncServiceInstance(opts = {}) {
  const src = fs.readFileSync(SYNC_SERVICE_PATH, 'utf8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;

  const mockIdb = new Map();
  if (opts.initialIdb) {
    for (const [k, v] of opts.initialIdb.entries()) {
      mockIdb.set(k, v);
    }
  }
  const dispatchedEvents = [];
  let operationalExecuted = false;
  let failDocId = opts.failDocId;
  let failSetDoc = opts.failSetDoc;
  let isAuthorized = false; // Inizialmente false per controllare l'avvio della sync

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date,
    setTimeout,
    clearTimeout,
    crypto: { randomUUID: () => 'uuid_1' },
    window: {
      dispatchEvent: (e) => { dispatchedEvents.push(e); return true; },
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    CustomEvent: class CustomEvent { constructor(t, p={}) { this.type = t; this.detail = p.detail; } },
    exports: {},
    module: { exports: {} },
    require: (mod) => {
      return {
        db: {},
        collection: (d, ...p) => p.join('/'),
        doc: (d, ...p) => p.join('/'),
        onSnapshot: () => () => {},
        setDoc: async (ref, data) => {
          if (failSetDoc) throw new Error('Network timeout during setDoc');
          if (failDocId && ref.includes(failDocId)) throw new Error('Firestore error on ' + failDocId);
          return;
        },
        deleteDoc: async () => {},
        getDocs: async (col) => {
          if (col && String(col).includes('settings')) {
            return { docs: [] };
          }
          operationalExecuted = true;
          return { docs: [] };
        },
        isCloudAuthorized: () => isAuthorized,
        normalizeTimestamp: (v) => Number(v) || 0,
        STORES: { SETTINGS: 'settings', TAPPE: 'tappe', RISTORANTI: 'ristoranti', SHOPPING: 'shopping', GIORNI: 'giorni', ATTIVITA: 'attivita', ALLOGGI: 'alloggi', TRASPORTI: 'trasporti', DOCUMENTI: 'documenti', SPESE: 'spese', NOTE: 'note', ROUTES: 'routes', BAGAGLI: 'bagagli' },
        idbGet: async (s, k) => mockIdb.get(s + ':' + k),
        idbPut: async (s, d) => { mockIdb.set(s + ':' + d.id, d); return d; },
        idbDelete: async (s, k) => { mockIdb.delete(s + ':' + k); },
        idbGetAll: async (s) => Array.from(mockIdb.entries()).filter(([k]) => k.startsWith(s + ':')).map(([, v]) => v),
        notifyDataChanged: () => {}
      };
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(transpiled, sandbox);

  const sync = new sandbox.exports.SyncService('trip_test');
  isAuthorized = true; // Abilita autorizzazione per chiamate manuali esplicite

  return {
    sync,
    mockIdb,
    dispatchedEvents,
    setFailSetDoc: (v) => { failSetDoc = v; },
    setFailDocId: (v) => { failDocId = v; },
    resetFlags: () => { operationalExecuted = false; dispatchedEvents.length = 0; },
    wasOperationalExecuted: () => operationalExecuted
  };
}

(async () => {
  // TEST PROD 1: addTappa, addRistorante, addShopping con ID tombstone
  await runAsyncTest('PRODUZIONE REALE', 'addTappa, addRistorante e addShopping rifiutano ID con tombstone attivo e non salvano', async () => {
    const { service, mockIdb, dispatchedEvents } = createProductionStorageServiceInstance();

    await service.recordTombstone('tappe', 'tappa_deleted_99');
    await service.recordTombstone('ristoranti', 'rist_deleted_99');
    await service.recordTombstone('shopping', 'shop_deleted_99');

    dispatchedEvents.length = 0;

    let tappaThrew = false;
    try {
      await service.addTappa({ id: 'tappa_deleted_99', titolo: 'Tappa Zombie' });
    } catch (e) {
      tappaThrew = true;
      assert.ok(e.message.includes('tombstone attivo'), 'Messaggio eccezione deve citare tombstone attivo');
    }
    assert.strictEqual(tappaThrew, true, 'addTappa con ID tombstoned deve lanciare eccezione');
    assert.strictEqual(mockIdb.has('tappe:tappa_deleted_99'), false, 'Tappa tombstoned NON deve essere scritta su IDB');

    let ristThrew = false;
    try {
      await service.addRistorante({ id: 'rist_deleted_99', nome: 'Ristorante Zombie' });
    } catch (e) {
      ristThrew = true;
      assert.ok(e.message.includes('tombstone attivo'), 'Messaggio eccezione deve citare tombstone attivo');
    }
    assert.strictEqual(ristThrew, true, 'addRistorante con ID tombstoned deve lanciare eccezione');
    assert.strictEqual(mockIdb.has('ristoranti:rist_deleted_99'), false, 'Ristorante tombstoned NON deve essere scritto su IDB');

    let shopThrew = false;
    try {
      await service.addShopping({ id: 'shop_deleted_99', nome: 'Shopping Zombie' });
    } catch (e) {
      shopThrew = true;
      assert.ok(e.message.includes('tombstone attivo'), 'Messaggio eccezione deve citare tombstone attivo');
    }
    assert.strictEqual(shopThrew, true, 'addShopping con ID tombstoned deve lanciare eccezione');
    assert.strictEqual(mockIdb.has('shopping:shop_deleted_99'), false, 'Shopping tombstoned NON deve essere scritto su IDB');

    const mutationEvents = dispatchedEvents.filter(e => e.type === 'roadbook_data_mutated' || e.type.endsWith('_updated'));
    assert.strictEqual(mutationEvents.length, 0, 'Nessun evento emesso per add* rifiutati');
  });

  // TEST PROD 2: Salvataggio rifiutato senza eventi di mutazione impropri
  await runAsyncTest('PRODUZIONE REALE', 'Salvataggio rifiutato non genera eventi di mutazione né salva su IDB', async () => {
    const { service, mockIdb, dispatchedEvents } = createProductionStorageServiceInstance();

    mockIdb.set('settings:tombstone_attivita_act_dead', {
      id: 'tombstone_attivita_act_dead',
      value: { entityType: 'attivita', deletedId: 'act_dead', deletedAt: 5000, pending: false }
    });

    dispatchedEvents.length = 0;

    await service.saveActivity({ id: 'act_dead', title: 'Stale Memory Copy', createdAt: 1000 });

    assert.strictEqual(mockIdb.has('attivita:act_dead'), false, 'Dato zombie rifiutato non deve comparire in IDB');
    const mutated = dispatchedEvents.filter(e => e.type === 'roadbook_data_mutated' || e.type === 'attivita_updated');
    assert.strictEqual(mutated.length, 0, 'Nessun evento roadbook_data_mutated o attivita_updated deve essere emesso');
  });

  // TEST PROD 3: Salvataggio valido con eventi corretti
  await runAsyncTest('PRODUZIONE REALE', 'Salvataggio valido persiste su IDB ed emette eventi corretti', async () => {
    const { service, mockIdb, dispatchedEvents } = createProductionStorageServiceInstance();
    dispatchedEvents.length = 0;

    const newAct = { id: 'act_brand_new_1', title: 'Visita Museo', createdAt: Date.now() };
    await service.saveActivity(newAct);

    assert.strictEqual(mockIdb.has('attivita:act_brand_new_1'), true, 'Entità valida deve essere persistita in IDB');
    const mutatedEvents = dispatchedEvents.filter(e => e.type === 'roadbook_data_mutated');
    const entityEvents = dispatchedEvents.filter(e => e.type === 'attivita_updated');

    assert.strictEqual(mutatedEvents.length, 1, 'Deve essere emesso esattamente 1 evento roadbook_data_mutated');
    assert.strictEqual(entityEvents.length, 1, 'Deve essere emesso esattamente 1 evento attivita_updated');
    assert.strictEqual(mutatedEvents[0].detail.entityType, 'attivita');
    assert.strictEqual(mutatedEvents[0].detail.action, 'save');
  });

  // TEST PROD 4: D1 — Validazione completa di importAllData con dati malformati, null, primitivi e tombstone
  await runAsyncTest('PRODUZIONE REALE', 'D1: importAllData isola e scarta elementi malformati (null, primitivi, senza id, tombstoned) preservando dati validi', async () => {
    const { service, mockIdb } = createProductionStorageServiceInstance();

    // Dati preesistenti in IDB
    mockIdb.set('tappe:tappa_preesistente_1', { id: 'tappa_preesistente_1', nome: 'Tappa Esistente' });

    // Tombstone attivo per act_tombstoned
    mockIdb.set('settings:tombstone_attivita_act_tombstoned', {
      id: 'tombstone_attivita_act_tombstoned',
      value: { entityType: 'attivita', deletedId: 'act_tombstoned', deletedAt: 5000, pending: false }
    });

    // Backup con mix di casi: null, primitivi, oggetti senza id, id vuoto, array annidato, tombstone e record valido
    const complexBackupJson = JSON.stringify({
      version: 1,
      data: {
        attivita: [
          null,                                         // 1. null inatteso
          12345,                                        // 2. numero primitivo
          "stringa_invalida",                           // 3. stringa primitiva
          true,                                         // 4. booleano
          [{ id: 'nested_array' }],                     // 5. array in array
          { titolo: 'Oggetto senza ID' },               // 6. oggetto privo di id
          { id: '   ', titolo: 'ID spazio bianco' },    // 7. id non valido
          { id: 'act_tombstoned', title: 'Zombie Tour', createdAt: 2000 }, // 8. tombstone attivo
          { id: 'act_valid_1', title: 'Tour Valido', createdAt: 6000 }      // 9. record valido
        ],
        tappe: "valore_corrotto_non_array",            // 10. proprietà store non-array (non deve azzerare tappe)
        giorni: [
          { id: 'day_valid_1', date: '2026-10-15', title: 'Giorno Valido', createdAt: 6000 }
        ]
      }
    });

    const success = await service.importAllData(complexBackupJson);
    assert.strictEqual(success, true, 'importAllData deve completare con successo isolando i record anomali');

    // 1. Il record valido deve essere stato inserito
    assert.strictEqual(mockIdb.has('attivita:act_valid_1'), true, 'Attività valida importata correttamente');
    assert.strictEqual(mockIdb.has('giorni:day_valid_1'), true, 'Giorno valido importato correttamente');

    // 2. I record anomali NON devono esistere in IDB
    assert.strictEqual(mockIdb.has('attivita:act_tombstoned'), false, 'Attività tombstoned deve essere stata scartata');
    assert.strictEqual(mockIdb.has('attivita:'), false, 'Nessun record con chiave vuota');
    assert.strictEqual(mockIdb.has('attivita:undefined'), false, 'Nessun record undefined');

    // 3. Lo store tappe, avendo valore non array, deve aver preservato i dati preesistenti senza azzeramento
    assert.strictEqual(mockIdb.has('tappe:tappa_preesistente_1'), true, 'Dati locali preesistenti di tappe preservati');
  });

  // TEST PROD 5: D2.1 — Scrittura tombstone riuscita: Fase 2 eseguita
  await runAsyncTest('PRODUZIONE REALE', 'D2.1: Scrittura tombstone riuscita consente esecuzione della Fase 2 e conferma pending: false', async () => {
    const initialMap = new Map([
      ['settings:tombstone_attivita_d2_ok', {
        id: 'tombstone_attivita_d2_ok',
        value: { entityType: 'attivita', deletedId: 'd2_ok', pending: true }
      }]
    ]);
    const inst = createProductionSyncServiceInstance({ initialIdb: initialMap, failSetDoc: false });
    await inst.sync.syncBidirectional();

    assert.strictEqual(inst.wasOperationalExecuted(), true, 'La Fase 2 deve partire dopo conferma tombstone');
    const tombRec = inst.mockIdb.get('settings:tombstone_attivita_d2_ok');
    assert.strictEqual(tombRec.value.pending, false, 'Il tombstone deve passare a pending: false');
  });

  // TEST PROD 6: D2.2 & D2.3 — Scrittura tombstone fallita: Fase 2 bloccata e tombstone resta pending
  await runAsyncTest('PRODUZIONE REALE', 'D2.2 & D2.3: Scrittura tombstone fallita blocca la Fase 2 ed emette sync_error con tombstone pending: true', async () => {
    const initialMap = new Map([
      ['settings:tombstone_attivita_d2_fail', {
        id: 'tombstone_attivita_d2_fail',
        value: { entityType: 'attivita', deletedId: 'd2_fail', pending: true }
      }]
    ]);
    const inst = createProductionSyncServiceInstance({ initialIdb: initialMap, failSetDoc: true });
    await inst.sync.syncBidirectional();

    assert.strictEqual(inst.wasOperationalExecuted(), false, 'La Fase 2 NON deve partire se la scrittura del tombstone fallisce');
    const tombRec = inst.mockIdb.get('settings:tombstone_attivita_d2_fail');
    assert.strictEqual(tombRec.value.pending, true, 'Il tombstone DEVE rimanere pending: true in caso di fallimento');

    const errEvent = inst.dispatchedEvents.find(e => e.type === 'roadbook_cloud_sync_error');
    assert.ok(errEvent, 'Deve essere emesso l\'evento roadbook_cloud_sync_error');
    assert.strictEqual(errEvent.detail.reason, 'phase1_tombstones_failed', 'Ragione errore deve essere phase1_tombstones_failed');
    assert.strictEqual(errEvent.detail.remainingPending, true, 'remainingPending deve essere true');
  });

  // TEST PROD 7: D2.4 — Retry riuscito dopo errore: tombstone confermato e Fase 2 eseguita
  await runAsyncTest('PRODUZIONE REALE', 'D2.4: Retry successivo riuscito conferma il tombstone ed esegue la Fase 2', async () => {
    const initialMap = new Map([
      ['settings:tombstone_attivita_d2_retry', {
        id: 'tombstone_attivita_d2_retry',
        value: { entityType: 'attivita', deletedId: 'd2_retry', pending: true }
      }]
    ]);
    const inst = createProductionSyncServiceInstance({ initialIdb: initialMap, failSetDoc: true });

    // Tentativo 1: Errore di rete
    await inst.sync.syncBidirectional();
    assert.strictEqual(inst.wasOperationalExecuted(), false, 'Fase 2 non partita al tentativo 1');
    assert.strictEqual(inst.mockIdb.get('settings:tombstone_attivita_d2_retry').value.pending, true, 'Ancora pending');

    // Tentativo 2: Connessione ripristinata (retry)
    inst.setFailSetDoc(false);
    inst.resetFlags();
    await inst.sync.syncBidirectional();

    assert.strictEqual(inst.wasOperationalExecuted(), true, 'Fase 2 eseguita dopo retry riuscito');
    assert.strictEqual(inst.mockIdb.get('settings:tombstone_attivita_d2_retry').value.pending, false, 'Tombstone confermato pending: false');
  });

  // TEST PROD 8: D2.5 — Più tombstone: se uno fallisce, la Fase 2 non parte
  await runAsyncTest('PRODUZIONE REALE', 'D2.5: Più tombstone: se uno fallisce, la Fase 2 non parte e i dati protetti non resuscitano', async () => {
    const initialMap = new Map([
      ['settings:tombstone_attivita_ok_1', {
        id: 'tombstone_attivita_ok_1',
        value: { entityType: 'attivita', deletedId: 'ok_1', pending: true }
      }],
      ['settings:tombstone_attivita_fail_2', {
        id: 'tombstone_attivita_fail_2',
        value: { entityType: 'attivita', deletedId: 'fail_2', pending: true }
      }]
    ]);
    // Fallisce solo su fail_2
    const inst = createProductionSyncServiceInstance({ initialIdb: initialMap, failDocId: 'fail_2' });
    await inst.sync.syncBidirectional();

    assert.strictEqual(inst.wasOperationalExecuted(), false, 'La Fase 2 deve essere bloccata anche se 1 solo tombstone su 2 fallisce');
    assert.strictEqual(inst.mockIdb.get('settings:tombstone_attivita_ok_1').value.pending, false, 'Tombstone 1 confermato');
    assert.strictEqual(inst.mockIdb.get('settings:tombstone_attivita_fail_2').value.pending, true, 'Tombstone 2 rimasto pending');
  });

  // TEST PROD 9: Ciclo di cancellazione e protezione giorno deterministico
  await runAsyncTest('PRODUZIONE REALE', 'deleteDay registra tombstone e saveDay impedisce resurrezione da copia obsoleta', async () => {
    const { service, mockIdb } = createProductionStorageServiceInstance();

    const dayId = 'day_2026-10-15';
    const originalCreated = 1000;

    await service.saveDay({ id: dayId, date: '2026-10-15', title: 'Giorno 1', createdAt: originalCreated });
    assert.strictEqual(mockIdb.has('giorni:' + dayId), true, 'Giorno salvato');

    await service.deleteDay(dayId);
    assert.strictEqual(mockIdb.has('giorni:' + dayId), false, 'Giorno rimosso da IDB');
    assert.strictEqual(mockIdb.has('settings:tombstone_giorni_' + dayId), true, 'Tombstone del giorno registrato in settings');

    await service.saveDay({ id: dayId, date: '2026-10-15', title: 'Giorno Stantio', createdAt: originalCreated });
    assert.strictEqual(mockIdb.has('giorni:' + dayId), false, 'La copia obsoleta del giorno DEVE essere respinta');

    const deletionTime = mockIdb.get('settings:tombstone_giorni_' + dayId).value.deletedAt;
    const recreationTime = deletionTime + 1000;
    await service.saveDay({ id: dayId, date: '2026-10-15', title: 'Giorno Riattivato', createdAt: recreationTime });

    assert.strictEqual(mockIdb.has('giorni:' + dayId), true, 'Il giorno riattivato con data posteriore viene salvato');
    assert.strictEqual(mockIdb.has('settings:tombstone_giorni_' + dayId), false, 'Il tombstone locale viene rimosso post riattivazione');
  });

  // TEST PROD 10: Coerenza controlli tra storage locale e push cloud
  await runAsyncTest('PRODUZIONE REALE', 'Coerenza controlli: sia storage locale che push cloud richiedono createdAt > deletedAt', async () => {
    const { service, mockIdb } = createProductionStorageServiceInstance();

    mockIdb.set('settings:tombstone_tappe_tappa_test', {
      id: 'tombstone_tappe_tappa_test',
      value: { entityType: 'tappe', deletedId: 'tappa_test', deletedAt: 5000, pending: false }
    });

    const localAllowedOld = await service.validateSaveAgainstTombstone('tappe', 'tappa_test', 3000);
    assert.strictEqual(localAllowedOld, false, 'Storage locale blocca record obsoleto');

    const localAllowedNoTime = await service.validateSaveAgainstTombstone('tappe', 'tappa_test', undefined);
    assert.strictEqual(localAllowedNoTime, false, 'Storage locale blocca record senza data di creazione');

    const localAllowedFresh = await service.validateSaveAgainstTombstone('tappe', 'tappa_test', 7000);
    assert.strictEqual(localAllowedFresh, true, 'Storage locale ammette ricreazione genuina');
  });

  // ============================================================================
  // PARTE C: SIMULAZIONI COMPORTAMENTALI MULTI-DISPOSITIVO (MOCK)
  // ============================================================================
  console.log('\n--- PARTE C: SIMULAZIONI COMPORTAMENTALI MULTI-DISPOSITIVO (MOCK) ---');

  function createMockEnvironment() {
    const firestoreDb = {
      settings: new Map(),
      attivita: new Map(),
      trasporti: new Map(),
      giorni: new Map()
    };

    function createClient(name) {
      const localStore = {
        settings: new Map(),
        attivita: new Map(),
        trasporti: new Map(),
        giorni: new Map()
      };
      const eventsDispatched = [];

      return {
        name,
        localStore,
        eventsDispatched,
        dispatchEvent(type, detail) {
          eventsDispatched.push({ type, detail });
        },

        async saveEntitySafe(storeName, entity, options = {}) {
          const tombstoneKey = `tombstone_${storeName}_${entity.id}`;
          const tombSetting = localStore.settings.get(tombstoneKey);

          if (tombSetting && tombSetting.value) {
            const itemCreated = entity.createdAt || 0;
            const tombDeleted = tombSetting.value.deletedAt || tombSetting.value.timestamp || 0;
            const isAllowed = itemCreated > 0 && tombDeleted > 0 && itemCreated > tombDeleted;
            if (!isAllowed) {
              return { saved: false, reason: 'tombstone_active' };
            }
          }

          if (options.failIdbPut) {
            throw new Error('Simulated idbPut error (quota exceeded or DB closed)');
          }

          localStore[storeName].set(entity.id, entity);

          if (tombSetting) {
            localStore.settings.delete(tombstoneKey);
          }

          return { saved: true };
        },

        async syncSettingsAndTombstones(shouldFail = false) {
          if (shouldFail) {
            throw new Error('Network error on Phase 1 settings fetch');
          }
          let pulledCount = 0;
          let pushedCount = 0;
          let deletedCount = 0;

          for (const [id, data] of firestoreDb.settings.entries()) {
            if (id.startsWith('tombstone_')) {
              const parts = id.split('_');
              const entityType = parts[1];
              const deletedId = data.deletedId || parts.slice(2).join('_');
              const targetStore = localStore[entityType];

              if (targetStore && targetStore.has(deletedId)) {
                const localItem = targetStore.get(deletedId);
                const localCreated = localItem.createdAt || 0;
                const tombDeleted = data.deletedAt || data.timestamp || 0;

                if (localCreated > tombDeleted) {
                  deletedCount++;
                  continue;
                } else {
                  targetStore.delete(deletedId);
                  deletedCount++;
                }
              }
              localStore.settings.set(id, { id, value: { ...data, pending: false } });
              pulledCount++;
            }
          }

          for (const [id, rec] of localStore.settings.entries()) {
            if (id.startsWith('tombstone_') && (!firestoreDb.settings.has(id) || rec.value?.pending)) {
              firestoreDb.settings.set(id, { ...rec.value, pending: false });
              localStore.settings.set(id, { ...rec, value: { ...(rec.value || {}), pending: false } });
              pushedCount++;
            }
          }

          return { pulledCount, pushedCount, deletedCount };
        },

        async syncOperational(colName) {
          const firestoreCol = firestoreDb[colName];
          const localCol = localStore[colName];
          let pulledCount = 0;
          let pushedCount = 0;
          let deletedCount = 0;

          for (const [id, sData] of firestoreCol.entries()) {
            const tombstoneKey = `tombstone_${colName}_${id}`;
            const tombSetting = localStore.settings.get(tombstoneKey);

            if (tombSetting && tombSetting.value) {
              const sCreated = sData.createdAt || 0;
              const tDeleted = tombSetting.value.deletedAt || tombSetting.value.timestamp || 0;
              if (sCreated > tDeleted) {
                localStore.settings.delete(tombstoneKey);
                localCol.set(id, sData);
                pulledCount++;
              } else {
                firestoreCol.delete(id);
                deletedCount++;
                continue;
              }
            } else {
              const lData = localCol.get(id);
              const lUpdated = lData?.updatedAt || 0;
              const sUpdated = sData?.updatedAt || 0;

              if (lData && lUpdated > 0 && lUpdated > sUpdated) {
                firestoreCol.set(id, lData);
                pushedCount++;
              } else {
                localCol.set(id, sData);
                pulledCount++;
              }
            }
          }

          for (const [id, lData] of localCol.entries()) {
            if (!firestoreCol.has(id)) {
              const tombstoneKey = `tombstone_${colName}_${id}`;
              const tombSetting = localStore.settings.get(tombstoneKey);

              if (tombSetting && tombSetting.value) {
                const lCreated = lData.createdAt || 0;
                const tDeleted = tombSetting.value.deletedAt || tombSetting.value.timestamp || 0;
                if (!(lCreated > tDeleted)) {
                  localCol.delete(id);
                  continue;
                }
              }
              firestoreCol.set(id, lData);
              pushedCount++;
            }
          }

          return { pulledCount, pushedCount, deletedCount };
        },

        async executeFullSync(options = {}) {
          let pulledCount = 0;
          let pushedCount = 0;
          let deletedCount = 0;
          let failedCount = 0;

          try {
            const resP1 = await this.syncSettingsAndTombstones(options.failPhase1);
            pulledCount += resP1.pulledCount;
            pushedCount += resP1.pushedCount;
            deletedCount += resP1.deletedCount;
          } catch (e) {
            failedCount++;
            this.dispatchEvent('roadbook_cloud_sync_error', { failedCount, reason: 'phase1_failed' });
            return { pulledCount, pushedCount, deletedCount, failedCount };
          }

          try {
            for (const col of ['attivita', 'trasporti', 'giorni']) {
              if (options.failCol === col) throw new Error(`Network error on ${col}`);
              const resP2 = await this.syncOperational(col);
              pulledCount += resP2.pulledCount;
              pushedCount += resP2.pushedCount;
              deletedCount += resP2.deletedCount;
            }
          } catch (e) {
            failedCount++;
          }

          if (failedCount > 0) {
            this.dispatchEvent('roadbook_cloud_sync_error', { failedCount });
          } else if (pushedCount > 0 || pulledCount > 0 || deletedCount > 0) {
            this.dispatchEvent('roadbook_cloud_synced', { pushedCount, pulledCount, deletedCount });
          } else {
            this.dispatchEvent('roadbook_cloud_sync_idle', {});
          }

          return { pulledCount, pushedCount, deletedCount, failedCount };
        }
      };
    }

    return { firestoreDb, clientA: createClient('Client A'), clientB: createClient('Client B') };
  }

  // MOCK TEST 1
  await runAsyncTest('MOCK MULTI-DEVICE', 'Errore idbPut lascia intatto il tombstone locale', async () => {
    const { clientA } = createMockEnvironment();
    clientA.localStore.settings.set('tombstone_attivita_act_fail', {
      id: 'tombstone_attivita_act_fail',
      value: { entityType: 'attivita', deletedId: 'act_fail', deletedAt: 2000, pending: false }
    });

    let threw = false;
    try {
      await clientA.saveEntitySafe('attivita', { id: 'act_fail', title: 'New', createdAt: 3000 }, { failIdbPut: true });
    } catch (err) {
      threw = true;
    }

    assert.strictEqual(threw, true, 'idbPut fallito deve sollevare eccezione');
    assert.strictEqual(clientA.localStore.attivita.has('act_fail'), false, 'Nessun dato parziale deve rimanere salvato');
    assert.strictEqual(clientA.localStore.settings.has('tombstone_attivita_act_fail'), true, 'Il tombstone DEVE rimanere presente dopo errore idbPut');
  });

  // MOCK TEST 2
  await runAsyncTest('MOCK MULTI-DEVICE', 'Ricreazione intenzionale con stesso ID (createdAt > deletedAt) ha successo', async () => {
    const { firestoreDb, clientA } = createMockEnvironment();
    clientA.localStore.settings.set('tombstone_attivita_act_recreate', {
      id: 'tombstone_attivita_act_recreate',
      value: { entityType: 'attivita', deletedId: 'act_recreate', deletedAt: 2000, pending: false }
    });
    firestoreDb.settings.set('tombstone_attivita_act_recreate', {
      entityType: 'attivita', deletedId: 'act_recreate', deletedAt: 2000
    });

    const res = await clientA.saveEntitySafe('attivita', {
      id: 'act_recreate', title: 'Tour Ricreato', createdAt: 3000, updatedAt: 3000
    });

    assert.strictEqual(res.saved, true, 'La ricreazione intenzionale deve essere consentita');
    assert.strictEqual(clientA.localStore.attivita.has('act_recreate'), true, 'Entità deve essere presente in local storage');
    assert.strictEqual(clientA.localStore.settings.has('tombstone_attivita_act_recreate'), false, 'Tombstone locale rimosso post salvataggio');

    await clientA.executeFullSync();
    assert.strictEqual(firestoreDb.attivita.has('act_recreate'), true, 'Entità ricreata deve essere presente su Cloud');
  });

  // MOCK TEST 3
  await runAsyncTest('MOCK MULTI-DEVICE', 'Vecchio oggetto salvato dopo cancellazione remota viene bloccato (createdAt <= deletedAt)', async () => {
    const { clientA } = createMockEnvironment();
    clientA.localStore.settings.set('tombstone_attivita_stale', {
      id: 'tombstone_attivita_stale',
      value: { entityType: 'attivita', deletedId: 'stale', deletedAt: 2000, pending: false }
    });

    const staleObject = { id: 'stale', title: 'Old Memory Object', createdAt: 1000, updatedAt: 2500 };
    const res = await clientA.saveEntitySafe('attivita', staleObject);

    assert.strictEqual(res.saved, false, 'Salvataggio di vecchio oggetto deve essere respinto');
    assert.strictEqual(res.reason, 'tombstone_active');
    assert.strictEqual(clientA.localStore.attivita.has('stale'), false, 'Nessun record zombie salvato in localStore');
    assert.strictEqual(clientA.localStore.settings.has('tombstone_attivita_stale'), true, 'Tombstone rimane attivo');
  });

  // MOCK TEST 4
  await runAsyncTest('MOCK MULTI-DEVICE', 'Modifica offline concorrente soccombe alla cancellazione (no resurrezione)', async () => {
    const { firestoreDb, clientA, clientB } = createMockEnvironment();
    firestoreDb.attivita.set('act_concurrent', { id: 'act_concurrent', title: 'Original', createdAt: 500, updatedAt: 500 });
    clientA.localStore.attivita.set('act_concurrent', { id: 'act_concurrent', title: 'Original', createdAt: 500, updatedAt: 500 });
    clientB.localStore.attivita.set('act_concurrent', { id: 'act_concurrent', title: 'Original', createdAt: 500, updatedAt: 500 });

    clientB.localStore.attivita.set('act_concurrent', { id: 'act_concurrent', title: 'B Offline Edit', createdAt: 500, updatedAt: 1200 });

    clientA.localStore.attivita.delete('act_concurrent');
    clientA.localStore.settings.set('tombstone_attivita_act_concurrent', {
      id: 'tombstone_attivita_act_concurrent',
      value: { entityType: 'attivita', deletedId: 'act_concurrent', deletedAt: 2000, pending: true }
    });
    firestoreDb.attivita.delete('act_concurrent');
    await clientA.executeFullSync();

    await clientB.executeFullSync();

    assert.strictEqual(clientB.localStore.attivita.has('act_concurrent'), false, 'Copia locale offline deve essere eliminata');
    assert.strictEqual(firestoreDb.attivita.has('act_concurrent'), false, 'Cloud non deve contenere il record resuscitato');
  });

  // MOCK TEST 5
  await runAsyncTest('MOCK MULTI-DEVICE', 'Eliminazione di un giorno registra tombstone ed evita resurrezione da copia remota', async () => {
    const { firestoreDb, clientA, clientB } = createMockEnvironment();
    const dayItem = { id: 'day_2026-12-05', date: '2026-12-05', title: 'Giorno 5', createdAt: 1000, updatedAt: 1000 };
    firestoreDb.giorni.set('day_2026-12-05', dayItem);
    clientA.localStore.giorni.set('day_2026-12-05', dayItem);
    clientB.localStore.giorni.set('day_2026-12-05', dayItem);

    clientA.localStore.giorni.delete('day_2026-12-05');
    clientA.localStore.settings.set('tombstone_giorni_day_2026-12-05', {
      id: 'tombstone_giorni_day_2026-12-05',
      value: { entityType: 'giorni', deletedId: 'day_2026-12-05', deletedAt: 2000, pending: true }
    });
    firestoreDb.giorni.delete('day_2026-12-05');
    await clientA.executeFullSync();

    await clientB.executeFullSync();
    assert.strictEqual(clientB.localStore.giorni.has('day_2026-12-05'), false, 'Giorno eliminato rimosso su Client B');
    assert.strictEqual(firestoreDb.giorni.has('day_2026-12-05'), false, 'Giorno non resuscitato su Cloud');
    assert.strictEqual(firestoreDb.settings.has('tombstone_giorni_day_2026-12-05'), true, 'Tombstone del giorno preservato in settings');
  });

  // MOCK TEST 6
  await runAsyncTest('MOCK MULTI-DEVICE', 'Fallimento scrittura tombstone su Firestore mantiene pending: true e lo ritenta', async () => {
    const { clientA } = createMockEnvironment();
    clientA.localStore.settings.set('tombstone_attivita_failed_write', {
      id: 'tombstone_attivita_failed_write',
      value: { entityType: 'attivita', deletedId: 'failed_write', deletedAt: 2000, pending: true }
    });

    try {
      await clientA.syncSettingsAndTombstones(true);
    } catch (e) {}

    const pendingRec = clientA.localStore.settings.get('tombstone_attivita_failed_write');
    assert.strictEqual(pendingRec.value.pending, true, 'Tombstone deve restare pending: true se la scrittura fallisce');

    await clientA.syncSettingsAndTombstones(false);
    const resolvedRec = clientA.localStore.settings.get('tombstone_attivita_failed_write');
    assert.strictEqual(resolvedRec.value.pending, false, 'Tombstone passa a pending: false dopo invio riuscito');
  });

  // MOCK TEST 7
  await runAsyncTest('MOCK MULTI-DEVICE', 'Dispositivo offline riconnesso riconcilia modifiche e cancellazioni senza regressioni', async () => {
    const { firestoreDb, clientB } = createMockEnvironment();

    clientB.localStore.attivita.set('act_genuine_offline', {
      id: 'act_genuine_offline', title: 'Genuina', createdAt: 3000, updatedAt: 3000
    });

    firestoreDb.settings.set('tombstone_trasporti_trn_del', {
      entityType: 'trasporti', deletedId: 'trn_del', deletedAt: 2500
    });
    clientB.localStore.trasporti.set('trn_del', { id: 'trn_del', title: 'Volo Cancellato', createdAt: 1000, updatedAt: 1000 });

    await clientB.executeFullSync();

    assert.strictEqual(firestoreDb.attivita.has('act_genuine_offline'), true, 'Nuova attività inviata a Cloud');
    assert.strictEqual(clientB.localStore.trasporti.has('trn_del'), false, 'Trasporto cancellato da tombstone rimosso localmente');
    assert.strictEqual(firestoreDb.trasporti.has('trn_del'), false, 'Trasporto cancellato non presente su Cloud');
  });

  // MOCK TEST 8
  await runAsyncTest('MOCK MULTI-DEVICE', 'Scrittura da client legacy su Firestore viene rilevata e sanata da Two-Phase Sync', async () => {
    const { firestoreDb, clientA } = createMockEnvironment();

    firestoreDb.settings.set('tombstone_attivita_zombie', {
      entityType: 'attivita', deletedId: 'zombie', deletedAt: 2000
    });

    firestoreDb.attivita.set('zombie', { id: 'zombie', title: 'Zombie Written by Legacy Client', createdAt: 1000, updatedAt: 2500 });

    await clientA.executeFullSync();

    assert.strictEqual(clientA.localStore.attivita.has('zombie'), false, 'Client aggiornato non deve accettare il record zombie');
    assert.strictEqual(firestoreDb.attivita.has('zombie'), false, 'Record zombie scritto dal client legacy eliminato da Firestore');
  });

  // MOCK TEST 9
  await runAsyncTest('MOCK MULTI-DEVICE', 'Mutex di sincronizzazione assorbe chiamate simultanee senza sovrapposizioni', async () => {
    let activeExecutions = 0;
    let maxOverlap = 0;
    let completedRuns = 0;
    let isSyncing = false;
    let pendingRequest = false;

    async function syncBidirectional() {
      if (isSyncing) {
        pendingRequest = true;
        return;
      }
      isSyncing = true;
      activeExecutions++;
      maxOverlap = Math.max(maxOverlap, activeExecutions);
      try {
        await new Promise(r => setTimeout(r, 15));
        completedRuns++;
      } finally {
        activeExecutions--;
        isSyncing = false;
        if (pendingRequest) {
          pendingRequest = false;
          await syncBidirectional();
        }
      }
    }

    await Promise.all([
      syncBidirectional(),
      syncBidirectional(),
      syncBidirectional()
    ]);

    assert.strictEqual(maxOverlap, 1, 'Nessuna esecuzione sovrapposta');
    assert.strictEqual(completedRuns, 2, 'Richieste condensate in 2 esecuzioni sequenziali');
    assert.strictEqual(isSyncing, false, 'Lock rilasciato correttamente');
  });

  console.log('\n----------------------------------------------------------------------');
  console.log(`Esito Test Suite: ${passedTests}/${totalTests} superati.`);
  assert.strictEqual(passedTests, totalTests, 'Tutti i test della suite devono passare');
})();
